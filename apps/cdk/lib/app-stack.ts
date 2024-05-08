import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import {
  IVpc,
  InstanceClass,
  InstanceSize,
  InstanceType,
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
import {
  BackendConfig,
  argsBackendConfig,
  envBackendConfig,
} from "@repo/app-config/server";

import { DatabaseStack, DatabaseStackConfig } from "./database-stack";
import { ServiceStack, ServiceStackConfig } from "./service-stack";

interface AppStackRequiredConfig {
  databaseName?: string;
  server: ServiceStackConfig;
  cluster: ServiceStackConfig;
}

interface AppStackDatabaseConfig {
  databaseType: "postgresql";
  database: DatabaseStackConfig;
}

export type AppStackConfig = AppStackRequiredConfig &
  Partial<AppStackDatabaseConfig>;

interface AppStackRequiredProps {
  vpc?: IVpc;
  databaseCredentials?: ISecret;
}

interface AppStackDatabaseProps {
  databaseType: "instance";
  databaseInstance: IDatabaseInstance;
}

export type AppStackProps = NestedStackProps &
  AppStackRequiredConfig &
  AppStackRequiredProps &
  (AppStackDatabaseProps | AppStackDatabaseConfig);

export class AppStack extends NestedStack {
  public readonly database?: DatabaseStack;

  public readonly server: ServiceStack;
  public readonly cluster: ServiceStack;

  public static readonly DEFAULT_DATABASE_NAME = "crackosaurus";
  public static readonly DEFAULT_DATABASE_PORT = 5432;

  constructor(scope: Construct, props: AppStackProps) {
    super(scope, "app-stack", props);

    let vpc: IVpc;
    if (props.vpc) {
      vpc = props.vpc;
    } else {
      vpc = new Vpc(this, "vpc", {
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: "ingress",
            subnetType: SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: "application",
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            cidrMask: 28,
            name: "rds",
            subnetType: SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });
    }

    let databaseCredentials: ISecret;
    if (props.databaseCredentials) {
      databaseCredentials = props.databaseCredentials;
    } else {
      databaseCredentials = new Secret(this, "db-creds", {
        description: "Database credentials",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: "postgres" }),
          generateStringKey: "password",
          passwordLength: 32,
          excludePunctuation: true,
        },
      });
    }

    let databaseInstance: IDatabaseInstance;
    if (props.databaseType === "postgresql") {
      this.database = new DatabaseStack(this, {
        ...props.database,
        database: props.databaseName ?? AppStack.DEFAULT_DATABASE_NAME,
        credentials: databaseCredentials,
        port: AppStack.DEFAULT_DATABASE_PORT,
        vpc,
      });

      databaseInstance = this.database.instance;
    } else if (props.databaseType === "instance") {
      this.database = undefined;

      databaseInstance = props.databaseInstance;
    } else {
      throw TypeError(`Unhandled database type ${(props as any).databaseType}`);
    }

    const databaseUrl = `postgresql://${databaseCredentials
      .secretValueFromJson("username")
      .unsafeUnwrap()}:${databaseCredentials
      .secretValueFromJson("password")
      .unsafeUnwrap()}@${databaseInstance.instanceEndpoint.hostname}:${
      databaseInstance.instanceEndpoint.port
    }/${props.databaseName}?schema=public`;

    const cluster = new Cluster(this, "cluster", { vpc: props.vpc });
    cluster.addCapacity("cluster-capacity", {
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      desiredCapacity: 2,
    });

    const clusterConfig: ClusterConfig = {
      host: {
        name: props.cluster.hostname,
        port: CLUSTER_DEFAULT_PORT,
      },
      type: {
        name: "debug",
      },
    };

    this.cluster = new ServiceStack(this, {
      ...props.cluster,
      name: "cluster",
      cluster,
      args: argsClusterConfig(clusterConfig),
      environment: envClusterConfig(clusterConfig),
    });

    const serverSecret = new Secret(this, "server-secret", {
      description: "Server secret",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    const serverConfig: BackendConfig = {
      host: {
        name: props.server.hostname,
        port: BACKEND_DEFAULT_PORT,
      },
      web: {
        name: props.server.hostname,
        port: BACKEND_DEFAULT_PORT,
      },
      database: {
        provider: "postgresql",
        path: databaseUrl,
      },
      cluster: clusterConfig.host,
      secret: serverSecret.secretValueFromJson("secret").unsafeUnwrap(),
    };

    this.server = new ServiceStack(this, {
      ...props.server,
      name: "server",
      cluster,
      args: argsBackendConfig(serverConfig),
      environment: envBackendConfig(serverConfig),
    });
  }
}
