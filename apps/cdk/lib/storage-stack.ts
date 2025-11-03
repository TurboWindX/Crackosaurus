import { RemovalPolicy } from "aws-cdk-lib";
import { ISubnet, IVpc } from "aws-cdk-lib/aws-ec2";
import { AccessPoint, FileSystem } from "aws-cdk-lib/aws-efs";
import { AnyPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface StorageStackConfig {
  removalPolicy?: RemovalPolicy;
}

export interface StorageStackProps extends StorageStackConfig {
  prefix?: string;
  vpc: IVpc;
  subnets?: ISubnet[];
}

export class StorageStack extends Construct {
  public readonly fileSystem: FileSystem;
  public readonly fileSystemPath: string;
  public readonly accessPoint: AccessPoint;

  public static readonly NAME = "storage";

  constructor(scope: Construct, props: StorageStackProps) {
    const id = `${StorageStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    this.fileSystemPath = "/crackosaurus";

    this.fileSystem = new FileSystem(this, "file-system", {
      fileSystemName: tag("file-system"),
      encrypted: true,
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.subnets,
      },
      removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
    });

    this.accessPoint = this.fileSystem.addAccessPoint("access-point-v2", {
      path: this.fileSystemPath,
      posixUser: {
        gid: "1001",
        uid: "1001",
      },
      createAcl: {
        ownerGid: "1001",
        ownerUid: "1001",
        permissions: "777",
      },
    });

    this.fileSystem.addToResourcePolicy(
      new PolicyStatement({
        actions: [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientRootAccess",
          "elasticfilesystem:ClientWrite"
        ],
        principals: [new AnyPrincipal()],
        conditions: {
          Bool: {
            "elasticfilesystem:AccessedViaMountTarget": "true",
          },
        },
      })
    );
  }
}
