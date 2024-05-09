import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import {
  ISubnet,
  IVpc,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { IDatabaseInstance } from "aws-cdk-lib/aws-rds";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import {
  ClusterConfig,
  argsClusterConfig,
  envClusterConfig,
} from "@repo/app-config/cluster";
import {
  BACKEND_DEFAULT_PORT,
  CLUSTER_DEFAULT_PORT,
} from "@repo/app-config/host";
import { BackendConfig } from "@repo/app-config/server";

import { ClusterStack, ClusterStackConfig } from "./cluster-stack";
import { DatabaseStack, DatabaseStackConfig } from "./database-stack";
import { ServerStack, ServerStackConfig } from "./server-stack";

interface AppStackRequiredConfig {
  databaseName?: string;
  databasePort?: number;
  server: ServerStackConfig;
  cluster: ClusterStackConfig;
}

interface AppStackDatabaseConfig {
  databaseType: "postgresql";
  database: DatabaseStackConfig;
}

interface AppStackDatabaseCredentialsConfig {
  databaseCreditals: "secret";
  databaseUser?: string;
  passwordLength?: number;
}

interface AppStackVpcConfig {
  vpcType: "aws";
}

export type AppStackConfig = AppStackRequiredConfig &
  Partial<AppStackDatabaseConfig> &
  Partial<AppStackDatabaseCredentialsConfig> &
  Partial<AppStackVpcConfig>;

interface AppStackVpcSubnets {
  internet: ISubnet[];
  app: ISubnet[];
  database: ISubnet[];
}

interface AppStackVpcProps {
  vpcType: "instance";
  vpc: IVpc;
  subnets: AppStackVpcSubnets;
}

interface AppStackDatabaseProps {
  databaseType: "instance";
  databaseInstance: IDatabaseInstance;
}

interface AppStackDatabaseCredentialsProps {
  databaseCreditals: "instance";
  databaseSecret: ISecret;
}

export type AppStackProps = NestedStackProps &
  AppStackRequiredConfig &
  (AppStackVpcProps | AppStackVpcConfig) &
  (AppStackDatabaseProps | AppStackDatabaseConfig) &
  (AppStackDatabaseCredentialsProps | AppStackDatabaseCredentialsConfig);

export class AppStack extends NestedStack {
  public readonly database?: DatabaseStack;

  public readonly server: ServerStack;
  public readonly cluster: ClusterStack;

  public static readonly DEFAULT_DATABASE_USER = "postgres";
  public static readonly DEFAULT_DATABASE_NAME = "crackosaurus";
  public static readonly DEFAULT_DATABASE_PORT = 5432;

  public static readonly DEFAULT_SECRET_LENGTH = 32;

  constructor(scope: Construct, props: AppStackProps) {
    super(scope, "app-stack", props);

    /**
     * Vpc
     */

    let vpc: IVpc;
    let subnets: AppStackVpcSubnets;
    if (props.vpcType === "instance") {
      vpc = props.vpc;
      subnets = props.subnets;
    } else if (props.vpcType === "aws") {
      vpc = new Vpc(this, "vpc", {
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: "internet",
            subnetType: SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: "app",
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            cidrMask: 28,
            name: "database",
            subnetType: SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });

      subnets = {
        internet: vpc.selectSubnets({ subnetGroupName: "internet" }).subnets,
        app: vpc.selectSubnets({ subnetGroupName: "app" }).subnets,
        database: vpc.selectSubnets({ subnetGroupName: "database" }).subnets,
      };
    } else {
      throw TypeError(`Unhandled vpc type ${(props as any).vpcType}`);
    }

    /**
     * Database Credentials
     */

    let databaseSecret: ISecret;
    if (props.databaseCreditals === "instance") {
      databaseSecret = props.databaseSecret;
    } else if (props.databaseCreditals === "secret") {
      databaseSecret = new Secret(this, "db-creds", {
        description: "Database credentials",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: props.databaseUser ?? AppStack.DEFAULT_DATABASE_USER,
          }),
          generateStringKey: "password",
          passwordLength:
            props.passwordLength ?? AppStack.DEFAULT_SECRET_LENGTH,
          excludePunctuation: true,
        },
      });
    } else {
      throw TypeError(
        `Unhandled database type ${(props as any).databaseCreditals}`
      );
    }

    /**
     * Database Service
     */

    let databaseInstance: IDatabaseInstance;
    if (props.databaseType === "postgresql") {
      this.database = new DatabaseStack(this, {
        ...props.database,
        database: props.databaseName ?? AppStack.DEFAULT_DATABASE_NAME,
        credentials: databaseSecret,
        port: props.databasePort ?? AppStack.DEFAULT_DATABASE_PORT,
        vpc,
        subnets: subnets.database,
      });

      databaseInstance = this.database.instance;
    } else if (props.databaseType === "instance") {
      this.database = undefined;

      databaseInstance = props.databaseInstance;
    } else {
      throw TypeError(`Unhandled database type ${(props as any).databaseType}`);
    }

    const databaseUrl = `postgresql://${databaseSecret
      .secretValueFromJson("username")
      .unsafeUnwrap()}:${databaseSecret
      .secretValueFromJson("password")
      .unsafeUnwrap()}@${databaseInstance.instanceEndpoint.hostname}:${
      databaseInstance.instanceEndpoint.port
    }/${props.databaseName}?schema=public`;

    /**
     * App Cluster
     */

    const cluster = new Cluster(this, "cluster", { vpc });
    cluster.addCapacity("cluster-capacity", {
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      desiredCapacity: 2,
    });

    /**
     * Cluster Service
     */

    const clusterConfig: ClusterConfig = {
      host: {
        name: "cluster",
        port: CLUSTER_DEFAULT_PORT,
      },
      type: {
        name: "debug",
      },
    };

    this.cluster = new ClusterStack(this, {
      ...props.cluster,
      cluster,
      subnets: subnets.app,
      config: clusterConfig,
    });

    const serverSecret = new Secret(this, "server-secret", {
      description: "Server cookie secret",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: AppStack.DEFAULT_SECRET_LENGTH,
        excludePunctuation: true,
      },
    });

    /**
     * Server Service
     */

    const serverConfig: BackendConfig = {
      host: {
        name: "server",
        port: BACKEND_DEFAULT_PORT,
      },
      web: {
        name: "server",
        port: BACKEND_DEFAULT_PORT,
      },
      database: {
        provider: "postgresql",
        path: databaseUrl,
      },
      cluster: clusterConfig.host,
      secret: serverSecret.secretValueFromJson("secret").unsafeUnwrap(),
    };

    this.server = new ServerStack(this, {
      ...props.server,
      cluster,
      subnets: subnets.app,
      config: serverConfig,
    });

    /**
     * Security Group
     */

    if (this.database) {
      const port = this.database.instance.instanceEndpoint.port;

      this.database.securityGroup.addIngressRule(
        Peer.securityGroupId(this.server.securityGroup.securityGroupId),
        Port.tcp(port),
        `Allow database access via port ${port} to server`
      );
    }

    if (this.cluster) {
      const port = clusterConfig.host.port;

      this.cluster.securityGroup.addIngressRule(
        Peer.securityGroupId(this.server.securityGroup.securityGroupId),
        Port.tcp(port),
        `Allow cluster access via port ${port} to server`
      );
    }
  }
}
