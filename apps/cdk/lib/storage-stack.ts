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
  public readonly accessPoint: AccessPoint;

  public static readonly NAME = "storage";
  public static readonly PATH = "/crackosaurus";

  constructor(scope: Construct, props: StorageStackProps) {
    const id = `${StorageStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    this.fileSystem = new FileSystem(this, "file-system", {
      fileSystemName: tag("file-system"),
      encrypted: true,
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.subnets,
      },
      removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
    });

    this.accessPoint = this.fileSystem.addAccessPoint("access-point", {
      path: StorageStack.PATH,
      posixUser: {
        gid: "1000",
        uid: "1000",
      },
      createAcl: {
        ownerGid: "1000",
        ownerUid: "1000",
        permissions: "777",
      },
    });

    this.fileSystem.addToResourcePolicy(
      new PolicyStatement({
        actions: ["elasticfilesystem:ClientMount"],
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
