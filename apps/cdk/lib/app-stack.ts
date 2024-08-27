import { ISubnet, IVpc, Port, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { FileSystem } from "aws-cdk-lib/aws-efs";
import { IDatabaseInstance } from "aws-cdk-lib/aws-rds";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import { ClusterStack, ClusterStackConfig } from "./cluster-stack";
import { DatabaseStack, DatabaseStackConfig } from "./database-stack";
import { InstanceStack, InstanceStackConfig } from "./instance-stack";
import { PrismaStack, PrismaStackConfig } from "./prisma-stack";
import { ServerStack, ServerStackConfig } from "./server-stack";
import { StorageStack } from "./storage-stack";

interface AppStackRequiredConfig {
  databaseName?: string;
  databasePort?: number;
  prisma: PrismaStackConfig;
  server: ServerStackConfig;
  cluster: ClusterStackConfig;
  instance: InstanceStackConfig;
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

interface AppStackPrefixProps {
  prefix?: string;
}

export type AppStackProps = AppStackPrefixProps &
  AppStackRequiredConfig &
  (AppStackVpcProps | AppStackVpcConfig) &
  (AppStackDatabaseProps | AppStackDatabaseConfig) &
  (AppStackDatabaseCredentialsProps | AppStackDatabaseCredentialsConfig);

export class AppStack extends Construct {
  public readonly database?: DatabaseStack;

  public readonly appCluster: Cluster;

  public readonly cluster: ClusterStack;
  public readonly instance: InstanceStack;
  public readonly server: ServerStack;
  public readonly storage: StorageStack;
  public readonly prisma: PrismaStack;

  public static readonly DEFAULT_DATABASE_USER = "postgres";
  public static readonly DEFAULT_DATABASE_NAME = "crackosaurus";
  public static readonly DEFAULT_DATABASE_PORT = 5432;

  public static readonly DEFAULT_SECRET_LENGTH = 32;

  constructor(scope: Construct, props: AppStackProps) {
    const id = "app-stack";
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

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
        vpcName: tag("vpc"),
        subnetConfiguration: [
          {
            name: "internet",
            cidrMask: 24,
            subnetType: SubnetType.PUBLIC,
          },
          {
            name: "app",
            cidrMask: 24,
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            name: "database",
            cidrMask: 28,
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
      throw TypeError(`Unhandled vpc type for ${props}`);
    }

    /**
     * Database Service
     */

    let databaseSecret: ISecret;
    if (props.databaseCreditals === "instance") {
      databaseSecret = props.databaseSecret;
    } else if (props.databaseCreditals === "secret") {
      databaseSecret = new Secret(this, "database-credentials", {
        secretName: tag("database-credentials"),
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
      throw TypeError(`Unhandled database type for ${props}`);
    }

    const databaseName = props.databaseName ?? AppStack.DEFAULT_DATABASE_NAME;

    let databaseInstance: IDatabaseInstance;
    if (props.databaseType === "postgresql") {
      this.database = new DatabaseStack(this, {
        ...props.database,
        prefix,
        database: databaseName,
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
      throw TypeError(`Unhandled database type for ${props}`);
    }

    const databaseUrl = `postgresql://${databaseSecret
      .secretValueFromJson("username")
      .unsafeUnwrap()}:${databaseSecret
      .secretValueFromJson("password")
      .unsafeUnwrap()}@${databaseInstance.instanceEndpoint.hostname}:${
      databaseInstance.instanceEndpoint.port
    }/${databaseName}?schema=public`;

    /**
     * Stacks
     */

    this.appCluster = new Cluster(this, "cluster", {
      clusterName: tag("cluster"),
      vpc,
      containerInsights: true,
    });

    this.storage = new StorageStack(this, {
      prefix,
      vpc,
      subnets: subnets.app,
    });

    this.instance = new InstanceStack(this, {
      ...props.instance,
      prefix,
      vpc,
      subnet: subnets.app[0]!,
      fileSystem: this.storage.fileSystem,
      fileSystemPath: this.storage.fileSystemPath,
    });

    this.cluster = new ClusterStack(this, {
      ...props.cluster,
      prefix,
      cluster: this.appCluster,
      subnets: subnets.app,
      fileSystem: this.storage.fileSystem,
      fileSystemPath: this.storage.fileSystemPath,
      accessPoint: this.storage.accessPoint,
      stepFunction: this.instance.stepFunction,
    });

    this.prisma = new PrismaStack(this, {
      prefix,
      databaseUrl,
      cluster: this.appCluster,
      subnets: subnets.app,
    });

    this.server = new ServerStack(this, {
      ...props.server,
      prefix,
      cluster: this.appCluster,
      serviceSubnets: subnets.app,
      loadBalancerSubnets: subnets.internet,
      clusterLoaderBalancer: this.cluster.loadBalancer,
      databaseUrl,
    });

    // Make sure database is built before running server.
    this.server.service.node.addDependency(databaseInstance);

    /**
     * Network
     */

    const databasePort = Port.tcp(databaseInstance.instanceEndpoint.port);

    databaseInstance.connections.allowFrom(
      this.prisma.runTask.connections,
      databasePort,
      "Prisma to Database"
    );

    databaseInstance.connections.allowFrom(
      this.server.service.connections,
      databasePort,
      "Server to Database"
    );

    const clusterPort = Port.tcp(80);

    this.cluster.loadBalancer.connections.allowFrom(
      this.server.service.connections,
      clusterPort,
      "Server to Cluster"
    );

    const fileSystemPort =
      this.storage.fileSystem.connections.defaultPort ??
      Port.tcp(FileSystem.DEFAULT_PORT);

    this.storage.fileSystem.connections.allowFrom(
      this.cluster.service.connections,
      fileSystemPort,
      "Cluster to FileSystem"
    );

    this.storage.fileSystem.connections.allowFrom(
      this.instance.instanceSG,
      fileSystemPort,
      "Instance to FileSystem"
    );
  }
}
