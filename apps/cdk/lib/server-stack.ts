import { Duration } from "aws-cdk-lib";
import { ISubnet, Peer, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
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
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
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
  config: BackendConfig;
}

export class ServerStack extends Construct {
  public readonly loadBalancerPort: number;

  public readonly taskDefinition: FargateTaskDefinition;

  public readonly service: FargateService;
  public readonly serviceSG: SecurityGroup;

  public readonly loadBalancer: ApplicationLoadBalancer;
  public readonly loadBalancerSG: SecurityGroup;

  public static readonly NAME = "server";

  constructor(scope: Construct, props: ServiceStackProps) {
    const id = `${ServerStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: `packages/container/${ServerStack.NAME}/Containerfile`,
      buildArgs: argsBackendConfig(props.config),
    });

    this.taskDefinition = new FargateTaskDefinition(this, "task");

    this.taskDefinition.addContainer("container", {
      containerName: tag("container"),
      image: ContainerImage.fromDockerImageAsset(image),
      environment: envBackendConfig(props.config),
      portMappings: [
        {
          containerPort: props.config.host.port,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          `wget -q --tries=1 --spider http://localhost:${props.config.host.port}/api/ping || exit 1`,
        ],
        interval: Duration.seconds(30),
        retries: 2,
      },
      logging: LogDriver.awsLogs({
        streamPrefix: tag("container") ?? id,
      }),
    });

    this.serviceSG = new SecurityGroup(this, "security-group", {
      securityGroupName: tag("security-group"),
      vpc: props.cluster.vpc,
    });

    this.service = new FargateService(this, "service", {
      serviceName: tag("service"),
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      vpcSubnets: {
        subnets: props.serviceSubnets,
      },
      securityGroups: [this.serviceSG],
    });

    this.loadBalancerPort = 80;

    this.loadBalancerSG = new SecurityGroup(this, "load-balancer-sg", {
      securityGroupName: tag("load-balancer-sg"),
      vpc: props.cluster.vpc,
    });

    this.serviceSG.addIngressRule(
      Peer.securityGroupId(this.loadBalancerSG.securityGroupId),
      Port.tcp(props.config.host.port),
      "LoadBalancer to Server"
    );

    const internet = props.internet ?? false;

    this.loadBalancer = new ApplicationLoadBalancer(this, "load-balancer", {
      vpc: props.cluster.vpc,
      vpcSubnets: {
        subnets: props.loadBalancerSubnets,
      },
      internetFacing: internet,
      securityGroup: this.loadBalancerSG,
    });

    this.loadBalancer
      .addListener("load-balancer-http", {
        protocol: ApplicationProtocol.HTTP,
        port: this.loadBalancerPort,
      })
      .addTargets("load-balancer-http-target", {
        protocol: ApplicationProtocol.HTTP,
        port: props.config.host.port,
        targets: [this.service],
      })
      .configureHealthCheck({
        path: "/api/ping",
      });
  }
}
