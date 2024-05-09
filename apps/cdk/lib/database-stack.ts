import {
  Duration,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
} from "aws-cdk-lib";
import {
  ISubnet,
  IVpc,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
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

export interface DatabaseStackProps
  extends DatabaseStackConfig,
    NestedStackProps {
  database: string;
  port: number;
  vpc: IVpc;
  subnets: ISubnet[];
  credentials: ISecret;
}

export class DatabaseStack extends NestedStack {
  public readonly securityGroup: SecurityGroup;
  public readonly storageEncryptionKey: Key;
  public readonly instance: DatabaseInstance;

  public static readonly NAME = "database";

  public static readonly DEFAULT_BACKUP_RETENTION = Duration.days(0);
  public static readonly DEFAULT_REMOVAL_POLICY = RemovalPolicy.DESTROY;

  constructor(scope: Construct, props: DatabaseStackProps) {
    super(scope, `${DatabaseStack.NAME}-stack`, props);

    this.securityGroup = new SecurityGroup(scope, "security-group", {
      vpc: props.vpc,
    });

    this.securityGroup.addIngressRule(
      Peer.ipv4(props.vpc.vpcCidrBlock),
      Port.tcp(props.port),
      `Allow database access via port ${props.port} to VPC ${props.vpc.vpcId}`
    );

    this.storageEncryptionKey = new Key(this, "key");

    this.instance = new DatabaseInstance(this, "database", {
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
      securityGroups: [this.securityGroup],
      databaseName: props.database,
      credentials: Credentials.fromSecret(props.credentials),
      backupRetention: props.backup ?? DatabaseStack.DEFAULT_BACKUP_RETENTION,
      deleteAutomatedBackups: true,
      deletionProtection: props.removal !== RemovalPolicy.DESTROY,
      removalPolicy: props.removal ?? DatabaseStack.DEFAULT_REMOVAL_POLICY,
    });
  }
}
