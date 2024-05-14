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
  ClusterConfig,
  argsClusterConfig,
  envClusterConfig,
} from "@repo/app-config/cluster";

export interface ClusterStackConfig {}

export interface ServiceStackProps extends ClusterStackConfig {
  prefix?: string;
  cluster: ICluster;
  subnets: ISubnet[];
  config: ClusterConfig;
}

export class ClusterStack extends Construct {
  public readonly taskDefinition: FargateTaskDefinition;

  public readonly service: FargateService;
  public readonly serviceSG: SecurityGroup;

  public readonly loadBalancer: ApplicationLoadBalancer;
  public readonly loadBalancerPort: number;
  public readonly loadBalancerSG: SecurityGroup;

  public static readonly NAME = "cluster";

  constructor(scope: Construct, props: ServiceStackProps) {
    const id = `${ClusterStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: `packages/container/${ClusterStack.NAME}/Containerfile`,
      buildArgs: argsClusterConfig(props.config),
    });

    this.taskDefinition = new FargateTaskDefinition(this, "task");

    this.taskDefinition.addContainer("container", {
      containerName: tag("container"),
      image: ContainerImage.fromDockerImageAsset(image),
      environment: envClusterConfig(props.config),
      portMappings: [
        {
          containerPort: props.config.host.port,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          `wget -q --tries=1 --spider http://localhost:${props.config.host.port}/ping || exit 1`,
        ],
        interval: Duration.seconds(30),
        retries: 2,
      },
      logging: LogDriver.awsLogs({
        streamPrefix: tag("container") ?? id,
      }),
    });

    this.serviceSG = new SecurityGroup(this, "service-sg", {
      securityGroupName: tag("service-sg"),
      vpc: props.cluster.vpc,
    });

    this.service = new FargateService(this, "service", {
      serviceName: tag("service"),
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      vpcSubnets: {
        subnets: props.subnets,
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
      "LoadBalancer to Cluster"
    );

    this.loadBalancer = new ApplicationLoadBalancer(this, "load-balancer", {
      vpc: props.cluster.vpc,
      vpcSubnets: {
        subnets: props.subnets,
      },
      internetFacing: false,
      securityGroup: this.loadBalancerSG,
    });

    this.loadBalancer
      .addListener("load-balancer-http", {
        protocol: ApplicationProtocol.HTTP,
        port: this.loadBalancerPort,
        open: false,
      })
      .addTargets("load-balancer-http-target", {
        protocol: ApplicationProtocol.HTTP,
        port: props.config.host.port,
        targets: [this.service],
      })
      .configureHealthCheck({
        path: "/ping",
      });
  }
}
