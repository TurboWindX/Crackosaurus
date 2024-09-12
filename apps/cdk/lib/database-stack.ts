import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  ISubnet,
  IVpc,
  InstanceClass,
  InstanceSize,
  InstanceType,
} from "aws-cdk-lib/aws-ec2";
import { Key } from "aws-cdk-lib/aws-kms";
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface DatabaseStackConfig {
  backup?: Duration;
  removal?: RemovalPolicy;
}

export interface DatabaseStackProps extends DatabaseStackConfig {
  prefix?: string;
  database: string;
  port: number;
  vpc: IVpc;
  subnets: ISubnet[];
  credentials: ISecret;
}

export class DatabaseStack extends Construct {
  public readonly storageEncryptionKey: Key;
  public readonly instance: DatabaseInstance;

  public static readonly NAME = "database";

  public static readonly DEFAULT_BACKUP_RETENTION = Duration.days(0);
  public static readonly DEFAULT_REMOVAL_POLICY = RemovalPolicy.DESTROY;

  constructor(scope: Construct, props: DatabaseStackProps) {
    const id = `${DatabaseStack.NAME}-stack`;
    super(scope, id);

    this.storageEncryptionKey = new Key(this, "key");

    const removal = props.removal ?? DatabaseStack.DEFAULT_REMOVAL_POLICY;

    this.instance = new DatabaseInstance(this, "database", {
      databaseName: props.database,
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.subnets,
      },
      port: props.port,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_16_2,
      }),
      storageEncryptionKey: this.storageEncryptionKey,
      credentials: Credentials.fromSecret(props.credentials),
      backupRetention: props.backup ?? DatabaseStack.DEFAULT_BACKUP_RETENTION,
      deleteAutomatedBackups: removal === RemovalPolicy.DESTROY,
      deletionProtection: removal !== RemovalPolicy.DESTROY,
      removalPolicy: removal,
    });
  }
}
