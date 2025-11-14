// This is for the GPU ec2 instances that get created to process jobs
import { DockerImage } from "aws-cdk-lib";
import {
  ISubnet,
  IVpc,
  MachineImage,
  Port,
  SecurityGroup,
} from "aws-cdk-lib/aws-ec2";
import { IFileSystem } from "aws-cdk-lib/aws-efs";
import {
  InstanceProfile,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import {
  DefinitionBody,
  JsonPath,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import path from "path";

import { envInstanceConfig } from "@repo/app-config/instance";

export interface InstanceStackConfig {
  interval?: number;
  cooldown?: number;
  sshKey?: string;
  imageId?: string;
}

export interface InstanceStackProps extends InstanceStackConfig {
  accessPointId?: string;
  prefix?: string;
  vpc: IVpc;
  subnets: ISubnet[]; // Changed from subnet to subnets array for multi-AZ support
  fileSystem: IFileSystem;
  fileSystemPath: string;
  securityGroup?: SecurityGroup; // Optional: security group for GPU instances
}

interface UserDataTemplateProps {
  s3ObjectUrl: string;
  hashcatPath: string;
  fileSystemId: string;
  fileSystemPath: string;
  instanceEnvString: string;
  scriptPath: string;
  accessPointId?: string;
}

export class InstanceStack extends Construct {
  public readonly stepFunction: StateMachine;
  public readonly instanceRole: Role;
  public readonly instanceSG: SecurityGroup;
  public readonly asset: Asset;
  // jobQueue removed - SQS is no longer used

  public static readonly NAME = "instance";

  constructor(scope: Construct, props: InstanceStackProps) {
    const id = `${InstanceStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    // SQS queue removed - instances will use EFS scanning instead

    // Use provided security group or create a new one
    this.instanceSG =
      props.securityGroup ??
      new SecurityGroup(this, "security-group", {
        securityGroupName: tag("security-group"),
        vpc: props.vpc,
        description: "Security group for GPU instances",
      });

    if (props.sshKey) {
      this.instanceSG.connections.allowFromAnyIpv4(
        Port.SSH,
        "SSH for debugging"
      );
    }

    // Allow GPU instances to access EFS
    props.fileSystem.connections.allowDefaultPortFrom(this.instanceSG);

    // GPU Instance Role - LEAST PRIVILEGE (no EC2 management permissions)
    this.instanceRole = new Role(this, "role", {
      roleName: tag("role"),
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      description: "IAM role for GPU instances - least privilege access",
    });

    // Remove AmazonEC2FullAccess - CRITICAL SECURITY FIX
    // GPU instances should NOT be able to create/modify/delete EC2 resources

    // Allow EFS access for reading wordlists and writing results
    this.instanceRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonElasticFileSystemClientReadWriteAccess"
      )
    );

    props.fileSystem.grantReadWrite(this.instanceRole);

    // Previously granted SQS permissions; removed since queue no longer exists

    this.asset = new Asset(this, "package", {
      path: __dirname,
      bundling: {
        image: DockerImage.fromBuild(path.join(__dirname, "..", "..", ".."), {
          file: path.join(
            "packages",
            "container",
            InstanceStack.NAME,
            "aws",
            "Containerfile"
          ),
        }),
      },
    });

    this.asset.grantRead(this.instanceRole);

    const instanceProfile = new InstanceProfile(this, "profile", {
      role: this.instanceRole,
    });

    // Helper function to create runInstance task for a specific subnet
    const createRunInstanceTask = (subnetIndex: number) => {
      const subnet = props.subnets[subnetIndex];
      if (!subnet) {
        throw new Error(`Subnet at index ${subnetIndex} is undefined`);
      }

      return new CallAwsService(this, `run-instance-az-${subnetIndex}`, {
        service: "ec2",
        action: "runInstances",
        parameters: {
          ImageId:
            props.imageId ??
            MachineImage.latestAmazonLinux2023().getImage(this).imageId,
          InstanceType: JsonPath.stringAt("$.instanceType"),
          MinCount: 1,
          MaxCount: 1,
          KeyName: props.sshKey,
          IamInstanceProfile: {
            Arn: instanceProfile.instanceProfileArn,
          },
          UserData: JsonPath.base64Encode(
            JsonPath.format(
              this.getUserDataTemplate(props),
              JsonPath.stringAt("$.instanceID"),
              JsonPath.stringAt("$.instanceType")
            )
          ),
          EbsOptimized: false,
          BlockDeviceMappings: [
            {
              DeviceName: "/dev/xvda",
              Ebs: {
                VolumeType: "gp2",
                VolumeSize: 16,
                DeleteOnTermination: true,
                Encrypted: true,
              },
            },
          ],
          NetworkInterfaces: [
            {
              SubnetId: subnet.subnetId,
              AssociatePublicIpAddress: false,
              DeviceIndex: 0,
              Groups: [this.instanceSG.securityGroupId],
            },
          ],
          PrivateDnsNameOptions: {
            HostnameType: "ip-name",
            EnableResourceNameDnsARecord: false,
            EnableResourceNameDnsAAAARecord: false,
          },
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                {
                  Key: "Name",
                  Value: JsonPath.format(
                    tag("{}") ?? "{}",
                    JsonPath.stringAt("$.instanceID")
                  ),
                },
                {
                  Key: "ManagedBy",
                  Value: "Crackosaurus",
                },
                {
                  Key: "Type",
                  Value: "GPU", // Required for terminate permission condition
                },
                {
                  Key: "AvailabilityZone",
                  Value: subnet.availabilityZone,
                },
              ],
            },
          ],
        },
        iamResources: ["*"],
      });
    };

    // Create primary runInstance task (first AZ)
    const runInstance = createRunInstanceTask(0);

    // If multiple subnets are provided, add error handling to retry in other AZs
    if (props.subnets.length > 1) {
      // Create fallback task for second AZ
      const runInstanceFallback = createRunInstanceTask(1);

      // Configure primary task to catch InsufficientInstanceCapacity errors and retry in second AZ
      runInstance.addCatch(runInstanceFallback, {
        errors: [
          "States.TaskFailed", // Generic task failure
          "Ec2.InsufficientInstanceCapacity", // Specific capacity error
          "Ec2.Client.InsufficientInstanceCapacity",
        ],
        resultPath: "$.error",
      });
    }

    this.stepFunction = new StateMachine(this, "state-machine", {
      stateMachineName: tag("run-instance"),
      definitionBody: DefinitionBody.fromChainable(runInstance),
    });

    this.stepFunction.node.addDependency(props.fileSystem);

    this.stepFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["ec2:*"],
        resources: ["*"],
      })
    );

    this.instanceRole.grantPassRole(this.stepFunction.role);
  }

  protected getUserDataTemplate(props: InstanceStackProps): string {
    const scriptPath = "/app/index.js";
    const hashcatPath = "/app/hashcat/hashcat.bin";

    const formatTag = "{}";

    const instanceEnv = envInstanceConfig({
      instanceID: formatTag,
      instanceType: formatTag,
      hashcatPath: hashcatPath,
      instanceRoot: path.posix.join("/mnt/efs/crackodata", "instances"),
      wordlistRoot: path.posix.join("/mnt/efs/crackodata", "wordlists"),
      ruleRoot: path.posix.join("/mnt/efs/crackodata", "rules"),
      instanceCooldown: props.cooldown ?? 60,
      instanceInterval: props.interval ?? 10,
      // SQS queue URL removed - not included in instance env
    });

    const instanceEnvString = Object.entries(instanceEnv)
      .map(
        ([key, value]) =>
          `${key}=${value === formatTag ? formatTag : JSON.stringify(value)}`
      )
      .join(" ");

    const templateProps: UserDataTemplateProps = {
      s3ObjectUrl: this.asset.s3ObjectUrl,
      hashcatPath,
      fileSystemId: props.fileSystem.fileSystemId,
      fileSystemPath: props.fileSystemPath,
      instanceEnvString,
      scriptPath,
      accessPointId: props.accessPointId,
    };

    return this.getUserDataTemplateAmazonLinux(templateProps);
  }

  protected getUserDataTemplateAmazonLinux(
    props: UserDataTemplateProps
  ): string {
    return `#!/bin/bash

    # Instance Info
    TOKEN=$(curl -s --request PUT "http://169.254.169.254/latest/api/token" --header "X-aws-ec2-metadata-token-ttl-seconds: 3600")
    EC2_INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id --header "X-aws-ec2-metadata-token: $TOKEN")
    AWS_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region --header "X-aws-ec2-metadata-token: $TOKEN")

    # Install minimal packages needed for EFS mount
    echo "=== Installing EFS utilities ===" | tee -a /var/log/userdata.log
    yum update -y
    yum install -y aws-cli amazon-efs-utils nfs-utils

    # Mount EFS EARLY - before heavy driver installs
    echo "=== Mounting EFS ===" | tee -a /var/log/userdata.log
    mkdir -p /mnt/efs/crackodata
    echo "Attempting to mount EFS: ${props.fileSystemId}:/ -> /mnt/efs/crackodata" | tee -a /var/log/userdata.log
    echo "Access Point: ${props.accessPointId}" | tee -a /var/log/userdata.log
    
    # When using access point, mount root (/) not the path - access point enforces the path
    if mount -t efs -o tls,iam,accesspoint=${props.accessPointId} ${props.fileSystemId}:/ /mnt/efs/crackodata; then
        echo "✓ EFS mount successful" | tee -a /var/log/userdata.log
        ls -laR /mnt/efs/crackodata | tee -a /var/log/userdata.log
        mount | grep efs | tee -a /var/log/userdata.log
    else
        echo "✗ EFS mount FAILED with exit code $?" | tee -a /var/log/userdata.log
        echo "Checking EFS utils..." | tee -a /var/log/userdata.log
        which mount.efs | tee -a /var/log/userdata.log
        echo "Network connectivity check..." | tee -a /var/log/userdata.log
        ping -c 3 ${props.fileSystemId}.efs.$AWS_REGION.amazonaws.com | tee -a /var/log/userdata.log
        echo "Continuing without EFS mount - instance will fail" | tee -a /var/log/userdata.log
    fi
    
    # Sleep to allow log capture
    echo "Waiting 10 seconds for log observation..." | tee -a /var/log/userdata.log
    sleep 16
    echo "Continuing with driver installation..." | tee -a /var/log/userdata.log

    # Install Drivers (after EFS mount verification)
    dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/amzn2023/x86_64/cuda-amzn2023.repo
    dnf clean expire-cache
    dnf update -y
    dnf install -y kernel-devel kernel-modules-extra
    dnf module install -y nvidia-driver:latest-dkms
    dnf install -y cuda-toolkit

    # Install Node
    curl -fsSL -o- https://rpm.nodesource.com/setup_20.x | bash
    dnf install nodejs -y

    # Create worker user with same UID/GID as cluster container (1001:1001)
    groupadd -g 1001 worker || true
    useradd -u 1001 -g 1001 -m worker || true
    
    # Create and set permissions for app directories
  mkdir -p /mnt/efs/crackodata/instances /mnt/efs/crackodata/wordlists /mnt/efs/crackodata/rules
  chown 1001:1001 -R /mnt/efs/crackodata/instances /mnt/efs/crackodata/wordlists /mnt/efs/crackodata/rules

    # Install App
    aws s3 cp ${props.s3ObjectUrl} /tmp/package.zip
    unzip /tmp/package.zip -d /
    rm -f /tmp/package.zip
    
    # Install aws-sdk in app directory
    cd /app
    npm init -y
    npm install aws-sdk
    
    chown 1001:1001 -R /app
    chmod a+x ${props.hashcatPath}

    # Run App (output to both console and log file)
    echo "=== Starting Instance Application ==="
  # Use the generated instance env string which includes RULE_ROOT when present
  su worker -c '${props.instanceEnvString} node ${props.scriptPath} 2>&1 | tee /tmp/session.log'
    echo "=== Instance Application Exited with code: $? ==="

    # Stop Instance
    aws ec2 terminate-instances --instance-ids $EC2_INSTANCE_ID
    `;
  }
}
