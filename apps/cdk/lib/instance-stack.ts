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
  prefix?: string;
  vpc: IVpc;
  subnet: ISubnet;
  fileSystem: IFileSystem;
  fileSystemPath: string;
}

interface UserDataTemplateProps {
  s3ObjectUrl: string;
  hashcatPath: string;
  fileSystemId: string;
  instanceEnvString: string;
  scriptPath: string;
}

export class InstanceStack extends Construct {
  public readonly stepFunction: StateMachine;
  public readonly instanceRole: Role;
  public readonly instanceSG: SecurityGroup;
  public readonly asset: Asset;

  public static readonly NAME = "instance";

  constructor(scope: Construct, props: InstanceStackProps) {
    const id = `${InstanceStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    this.instanceSG = new SecurityGroup(this, "security-group", {
      securityGroupName: tag("security-group"),
      vpc: props.vpc,
    });

    if (props.sshKey) {
      this.instanceSG.connections.allowFromAnyIpv4(Port.SSH, "SSH");
    }

    this.instanceRole = new Role(this, "role", {
      roleName: tag("role"),
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    });

    this.instanceRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess")
    );

    this.instanceRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonElasticFileSystemClientReadWriteAccess"
      )
    );

    props.fileSystem.grantReadWrite(this.instanceRole);

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
      instanceRoot: path.join("efs", props.fileSystemPath, "instances"),
      wordlistRoot: path.join("efs", props.fileSystemPath, "wordlists"),
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
      instanceEnvString,
      scriptPath,
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
    mkdir /efs
    mount -t efs -o tls ${props.fileSystemId}:/ /efs

    # Install App
    aws s3 cp ${props.s3ObjectUrl} /tmp/package.zip
    unzip /tmp/package.zip -d /
    rm -f /tmp/package.zip
    chown 1000:1000 -R /app
    chmod a+x ${props.hashcatPath}

    # Run App
    su ec2-user -c '${props.instanceEnvString} node ${props.scriptPath} 2>&1 > /tmp/session.log'

    # Stop Instance
    aws ec2 terminate-instances --instance-ids $EC2_INSTANCE_ID
    `;
  }
}
