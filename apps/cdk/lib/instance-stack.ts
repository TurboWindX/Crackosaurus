import { DockerImage, Duration } from "aws-cdk-lib";
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
import { Queue } from "aws-cdk-lib/aws-sqs";
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
  prefix?: string;
  vpc: IVpc;
  subnet: ISubnet;
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
  queueUrl: string;
}

export class InstanceStack extends Construct {
  public readonly stepFunction: StateMachine;
  public readonly instanceRole: Role;
  public readonly instanceSG: SecurityGroup;
  public readonly asset: Asset;
  public readonly jobQueue: Queue;

  public static readonly NAME = "instance";

  constructor(scope: Construct, props: InstanceStackProps) {
    const id = `${InstanceStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    // Create SQS queue for job notifications
    this.jobQueue = new Queue(this, "job-queue", {
      queueName: tag("job-queue"),
      visibilityTimeout: Duration.minutes(15), // Time worker has to process job
      receiveMessageWaitTime: Duration.seconds(20), // Long polling
    });

    // Use provided security group or create a new one
    this.instanceSG = props.securityGroup ?? new SecurityGroup(this, "security-group", {
      securityGroupName: tag("security-group"),
      vpc: props.vpc,
      description: "Security group for GPU instances",
    });

    if (props.sshKey) {
      this.instanceSG.connections.allowFromAnyIpv4(Port.SSH, "SSH for debugging");
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

    // Grant SQS permissions to instance role
    this.jobQueue.grantConsumeMessages(this.instanceRole);
    this.jobQueue.grantSendMessages(this.instanceRole);

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

    const runInstance = new CallAwsService(this, "run-instance", {
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
            JsonPath.stringAt("$.instanceID")
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
            SubnetId: props.subnet.subnetId,
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
            ],
          },
        ],
      },
      iamResources: ["*"],
    });

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
      hashcatPath: hashcatPath,
      instanceRoot: path.posix.join("/mnt/efs", "instances"),
      wordlistRoot: path.posix.join("/mnt/efs", "wordlists"),
      instanceCooldown: props.cooldown ?? 60,
      instanceInterval: props.interval ?? 10,
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
      queueUrl: this.jobQueue.queueUrl,
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

    # Install Packages
    yum update -y
    yum install -y aws-cli amazon-efs-utils nfs-utils

    # Install Drivers
    dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/amzn2023/x86_64/cuda-amzn2023.repo
    dnf clean expire-cache
    dnf update -y
    dnf install -y kernel-devel kernel-modules-extra
    dnf module install -y nvidia-driver:latest-dkms
    dnf install -y cuda-toolkit

    # Install Node
    curl -fsSL -o- https://rpm.nodesource.com/setup_20.x | bash
    dnf install nodejs -y

    # Mount EFS
    mkdir -p /mnt/efs
    mount -t efs -o tls,iam ${props.fileSystemId}:/ /mnt/efs
    
    # Create worker user with same UID/GID as cluster container (1001:1001)
    groupadd -g 1001 worker || true
    useradd -u 1001 -g 1001 -m worker || true
    
    # Create and set permissions for app directories
    mkdir -p /mnt/efs/instances /mnt/efs/wordlists
    chown 1001:1001 -R /mnt/efs/instances /mnt/efs/wordlists

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
    INSTANCE_ID="{}"
    echo "Instance ID: $INSTANCE_ID"
    su worker -c 'INSTANCE_ID='$INSTANCE_ID' JOB_QUEUE_URL="${props.queueUrl}" HASHCAT_PATH="${props.hashcatPath}" INSTANCE_ROOT="/mnt/efs/instances" WORDLIST_ROOT="/mnt/efs/wordlists" INSTANCE_INTERVAL="10" INSTANCE_COOLDOWN="60" node ${props.scriptPath} 2>&1 | tee /tmp/session.log'
    echo "=== Instance Application Exited with code: $? ==="

    # Stop Instance
    aws ec2 terminate-instances --instance-ids $EC2_INSTANCE_ID
    `;
  }
}
