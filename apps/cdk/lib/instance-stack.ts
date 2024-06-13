import { Aws, DockerImage } from "aws-cdk-lib";
import {
  ISubnet,
  IVpc,
  MachineImage,
  SecurityGroup,
} from "aws-cdk-lib/aws-ec2";
import { IFileSystem } from "aws-cdk-lib/aws-efs";
import {
  AccountPrincipal,
  InstanceProfile,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Key } from "aws-cdk-lib/aws-kms";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import {
  DefinitionBody,
  JsonPath,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import path from "node:path";

import { envInstanceConfig } from "@repo/app-config/instance";

export interface InstanceStackConfig {
  interval?: number;
  cooldown?: number;
}

export interface InstanceStackProps extends InstanceStackConfig {
  prefix?: string;
  vpc: IVpc;
  subnets: ISubnet[];
  fileSystem: IFileSystem;
  fileSystemPath: string;
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
        ImageId: MachineImage.latestAmazonLinux2023().getImage(this).imageId,
        InstanceType: JsonPath.stringAt("$.instanceType"),
        MinCount: 1,
        MaxCount: 1,
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
            SubnetId: props.subnets[0]?.subnetId,
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
      instanceRoot: path.join(props.fileSystemPath, "instances"),
      wordlistRoot: path.join(props.fileSystemPath, "wordlists"),
      instanceCooldown: props.cooldown ?? 60,
      instanceInterval: props.interval ?? 10,
    });

    const instanceEnvString = Object.entries(instanceEnv)
      .map(
        ([key, value]) =>
          `${key}=${value === formatTag ? formatTag : JSON.stringify(value)}`
      )
      .join("\n");

    return `#!/bin/bash

    # Environment
    ${instanceEnvString}

    # Install Packages
    yum install -y aws-cli amazon-efs-utils curl nodejs unzip

    # Install App
    aws s3 cp ${this.asset.s3ObjectUrl} /package.zip
    uzip /package.zip -d /
    rm /package.zip
    chmod +x ${hashcatPath}

    # Mount EFS
    mount -t efs -o tls ${props.fileSystem.fileSystemId}:/ /

    # Run App
    node ${scriptPath}

    # Stop Instance
    TOKEN=$(curl --request PUT "http://169.254.169.254/latest/api/token" --header "X-aws-ec2-metadata-token-ttl-seconds: 3600")
    EC2_INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id --header "X-aws-ec2-metadata-token: $TOKEN")
    aws ec2 terminate-instances --instance-ids $EC2_INSTANCE_ID
    `;
  }
}
