import {
  Duration,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
} from "aws-cdk-lib";
import {
  IVpc,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
} from "aws-cdk-lib/aws-ec2";
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface DatabaseStackConfig {
  subnetGroupName?: string;
  subnetType?: SubnetType;
}

export interface DatabaseStackProps
  extends DatabaseStackConfig,
    NestedStackProps {
  database: string;
  port: number;
  vpc: IVpc;
  credentials: ISecret;
}

export class DatabaseStack extends NestedStack {
  public readonly instance: DatabaseInstance;

  constructor(scope: Construct, props: DatabaseStackProps) {
    super(scope, "database-stack", props);

    const securityGroup = new SecurityGroup(scope, "security-group", {
      vpc: props.vpc,
    });

    securityGroup.addIngressRule(
      Peer.ipv4(props.vpc.vpcCidrBlock),
      Port.tcp(props.port),
      `Allow database access via port ${props.port} to VPC ${props.vpc.vpcId}`
    );

    this.instance = new DatabaseInstance(this, "database", {
      vpc: props.vpc,
      vpcSubnets: {
        subnetGroupName: props.subnetGroupName,
        subnetType: props.subnetType,
      },
      port: props.port,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_16_2,
      }),
      securityGroups: [securityGroup],
      databaseName: props.database,
      credentials: Credentials.fromSecret(props.credentials),
      backupRetention: Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
