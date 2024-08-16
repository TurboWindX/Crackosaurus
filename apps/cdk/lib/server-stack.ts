import { Duration } from "aws-cdk-lib";
import { ISubnet, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  ICluster,
  LogDriver,
} from "aws-cdk-lib/aws-ecs";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ILoadBalancerV2,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "node:path";

import {
  BackendConfig,
  argsBackendConfig,
  envBackendConfig,
} from "@repo/app-config/server";

export interface ServerStackConfig {
  internet?: boolean;
}

export interface ServiceStackProps extends ServerStackConfig {
  prefix?: string;
  cluster: ICluster;
  serviceSubnets: ISubnet[];
  loadBalancerSubnets: ISubnet[];
  clusterLoaderBalancer: ILoadBalancerV2;
  databaseUrl: string;
}

export class ServerStack extends Construct {
  public readonly taskDefinition: FargateTaskDefinition;
  public readonly service: FargateService;
  public readonly loadBalancer: ApplicationLoadBalancer;

  public static readonly NAME = "server";

  constructor(scope: Construct, props: ServiceStackProps) {
    const id = `${ServerStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    const secret = new Secret(this, "secret", {
      secretName: tag("secret"),
      description: "Server cookie secret",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    const config: BackendConfig = {
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
        path: props.databaseUrl,
      },
      cluster: {
        name: props.clusterLoaderBalancer.loadBalancerDnsName,
        port: 80,
      },
      secret: secret.secretValueFromJson("secret").unsafeUnwrap(),
    };

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: path.join(
        "packages",
        "container",
        ServerStack.NAME,
        "Containerfile"
      ),
      buildArgs: argsBackendConfig(config),
    });

    this.taskDefinition = new FargateTaskDefinition(this, "task");

    this.taskDefinition.addContainer("container", {
      containerName: tag("container"),
      image: ContainerImage.fromDockerImageAsset(image),
      environment: envBackendConfig(config),
      portMappings: [
        {
          containerPort: config.host.port,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          `wget -q --tries=1 --spider http://localhost:${config.host.port}/api/ping || exit 1`,
        ],
        interval: Duration.seconds(30),
        retries: 2,
      },
      logging: LogDriver.awsLogs({
        streamPrefix: tag("container") ?? id,
      }),
    });

    const serviceSG = new SecurityGroup(this, "service-sg", {
      securityGroupName: tag("service-sg"),
      vpc: props.cluster.vpc,
    });

    this.service = new FargateService(this, "service", {
      serviceName: tag("service"),
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      vpcSubnets: {
        subnets: props.serviceSubnets,
      },
      securityGroups: [serviceSG],
    });

    this.loadBalancer = new ApplicationLoadBalancer(this, "load-balancer", {
      vpc: props.cluster.vpc,
      vpcSubnets: {
        subnets: props.loadBalancerSubnets,
      },
      internetFacing: props.internet ?? false,
    });

    this.loadBalancer
      .addListener("load-balancer-http", {
        protocol: ApplicationProtocol.HTTP,
        port: 80,
      })
      .addTargets("load-balancer-http-target", {
        protocol: ApplicationProtocol.HTTP,
        port: config.host.port,
        targets: [this.service],
      })
      .configureHealthCheck({
        path: "/ping",
      });

    this.service.connections.allowFrom(
      this.loadBalancer.connections,
      Port.tcp(config.host.port),
      "LoadBalancer to Server"
    );
  }
}
