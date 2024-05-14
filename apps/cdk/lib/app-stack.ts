import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import {
  ISubnet,
  IVpc,
  Peer,
  Port,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { IDatabaseInstance } from "aws-cdk-lib/aws-rds";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import { ClusterConfig } from "@repo/app-config/cluster";
import { BackendConfig } from "@repo/app-config/server";

import { ClusterStack, ClusterStackConfig } from "./cluster-stack";
import { DatabaseStack, DatabaseStackConfig } from "./database-stack";
import { PrismaStack, PrismaStackConfig } from "./prisma-stack";
import { ServerStack, ServerStackConfig } from "./server-stack";

interface AppStackRequiredConfig {
  databaseName?: string;
  databasePort?: number;
  prisma: PrismaStackConfig;
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

interface AppStackPrefixProps {
  prefix?: string;
}

export type AppStackProps = NestedStackProps &
  AppStackPrefixProps &
  AppStackRequiredConfig &
  (AppStackVpcProps | AppStackVpcConfig) &
  (AppStackDatabaseProps | AppStackDatabaseConfig) &
  (AppStackDatabaseCredentialsProps | AppStackDatabaseCredentialsConfig);

export class AppStack extends NestedStack {
  public readonly database?: DatabaseStack;

  public readonly appCluster: Cluster;

  public readonly prisma: PrismaStack;
  public readonly server: ServerStack;
  public readonly cluster: ClusterStack;

  public static readonly DEFAULT_DATABASE_USER = "postgres";
  public static readonly DEFAULT_DATABASE_NAME = "crackosaurus";
  public static readonly DEFAULT_DATABASE_PORT = 5432;

  public static readonly DEFAULT_SECRET_LENGTH = 32;

  constructor(scope: Construct, props: AppStackProps) {
    const id = "app-stack";
    super(scope, id, props);

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
      throw TypeError(`Unhandled vpc type ${(props as any).vpcType}`);
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
      throw TypeError(
        `Unhandled database type ${(props as any).databaseCreditals}`
      );
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
      throw TypeError(`Unhandled database type ${(props as any).databaseType}`);
    }

    const databaseUrl = `postgresql://${databaseSecret
      .secretValueFromJson("username")
      .unsafeUnwrap()}:${databaseSecret
      .secretValueFromJson("password")
      .unsafeUnwrap()}@${databaseInstance.instanceEndpoint.hostname}:${
      databaseInstance.instanceEndpoint.port
    }/${databaseName}?schema=public`;

    /**
     * App Cluster
     */

    this.appCluster = new Cluster(this, "cluster", {
      clusterName: tag("cluster"),
      vpc,
      containerInsights: true,
    });

    /**
     * Cluster Service
     */

    const clusterConfig: ClusterConfig = {
      host: {
        name: "cluster",
        port: 8080,
      },
      type: {
        name: "debug",
      },
    };

    this.cluster = new ClusterStack(this, {
      ...props.cluster,
      prefix,
      cluster: this.appCluster,
      subnets: subnets.app,
      config: clusterConfig,
    });

    /**
     * Prisma Service
     */

    this.prisma = new PrismaStack(this, {
      prefix,
      databaseUrl,
      cluster: this.appCluster,
      subnets: subnets.app,
    });

    /**
     * Server Service
     */

    const serverSecret = new Secret(this, "server-secret", {
      secretName: tag("server-secret"),
      description: "Server cookie secret",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: AppStack.DEFAULT_SECRET_LENGTH,
        excludePunctuation: true,
      },
    });

    const serverConfig: BackendConfig = {
      host: {
        name: "USE_WEB_HOST",
        port: 8080,
      },
      web: {
        name: "server",
        port: 8080,
      },
      database: {
        provider: "postgresql",
        path: databaseUrl,
      },
      cluster: {
        name: this.cluster.loadBalancer.loadBalancerDnsName,
        port: 80,
      },
      secret: serverSecret.secretValueFromJson("secret").unsafeUnwrap(),
    };

    this.server = new ServerStack(this, {
      ...props.server,
      prefix,
      cluster: this.appCluster,
      serviceSubnets: subnets.app,
      loadBalancerSubnets: subnets.internet,
      config: serverConfig,
    });

    // Force database to be built before deploying.
    if (this.database)
      this.server.service.node.addDependency(this.database.instance);

    /**
     * Security Group
     */

    if (this.database) {
      const databasePort = this.database.instance.instanceEndpoint.port;

      this.database.securityGroup.addIngressRule(
        Peer.securityGroupId(this.prisma.securityGroup.securityGroupId),
        Port.tcp(databasePort),
        "Prisma to RDS"
      );

      this.database.securityGroup.addIngressRule(
        Peer.securityGroupId(this.server.serviceSG.securityGroupId),
        Port.tcp(databasePort),
        "Server to RDS"
      );
    }

    if (this.cluster) {
      this.cluster.loadBalancerSG.addIngressRule(
        Peer.securityGroupId(this.server.serviceSG.securityGroupId),
        Port.tcp(this.cluster.loadBalancerPort),
        "Server to Cluster"
      );
    }
  }
}
