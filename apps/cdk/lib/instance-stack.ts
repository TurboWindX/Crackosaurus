import { DockerImage } from "aws-cdk-lib";
import { IVpc, MachineImage, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import {
  InstanceProfile,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import path from "node:path";

import { StorageStack } from "./storage-stack";

export interface InstanceStackConfig {}

export interface InstanceStackProps extends InstanceStackConfig {
  prefix?: string;
  vpc: IVpc;
}

export class InstanceStack extends Construct {
  public readonly fileSystemPath: string;
  public readonly imageID: string;
  public readonly securityGroup: SecurityGroup;
  public readonly role: Role;
  public readonly profile: InstanceProfile;
  public readonly scriptPath: string;
  public readonly hashcatPath: string;
  public readonly asset: Asset;

  public static readonly NAME = "instance";

  constructor(scope: Construct, props: InstanceStackProps) {
    const id = `${InstanceStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    this.fileSystemPath = StorageStack.PATH;
    this.scriptPath = "/app/index.js";
    this.hashcatPath = "/app/hashcat/hashcat.bin";

    const machineImage = MachineImage.latestAmazonLinux2023();
    this.imageID = machineImage.getImage(this).imageId;

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

    this.securityGroup = new SecurityGroup(this, "security-group", {
      securityGroupName: tag("security-group"),
      vpc: props.vpc,
    });

    this.role = new Role(this, "role", {
      roleName: tag("role"),
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    });

    this.role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess")
    );

    this.role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonElasticFileSystemClientReadWriteAccess"
      )
    );

    this.profile = new InstanceProfile(this, "profile", {
      role: this.role,
    });

    this.asset.grantRead(this.role);
  }
}
