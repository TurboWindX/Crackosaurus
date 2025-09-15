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
import { IAccessPoint, IFileSystem } from "aws-cdk-lib/aws-efs";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ManagedPolicy } from "aws-cdk-lib/aws-iam";
import { IStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import * as path from "path";

import {
  ClusterConfig,
  argsClusterConfig,
  envClusterConfig,
} from "@repo/app-config/cluster";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClusterStackConfig {}

export interface ClusterStackProps {
  prefix?: string;
  cluster: ICluster;
  subnets: ISubnet[];
  fileSystem: IFileSystem;
  accessPoint: IAccessPoint;
  fileSystemPath: string;
  stepFunction: IStateMachine;
}

export class ClusterStack extends Construct {
  public readonly taskDefinition: FargateTaskDefinition;
  public readonly service: FargateService;
  public readonly loadBalancer: ApplicationLoadBalancer;

  public static readonly NAME = "cluster";

  constructor(scope: Construct, props: ClusterStackProps) {
    const id = `${ClusterStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    const config: ClusterConfig = {
      host: {
        name: "cluster",
        port: 8080,
      },
      type: {
        name: "aws",
        stepFunctionArn: props.stepFunction.stateMachineArn,
        instanceRoot: path.join(props.fileSystemPath, "instances"),
        wordlistRoot: path.join(props.fileSystemPath, "wordlists"),
      },
    };

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: path.join(
        "packages",
        "container",
        ClusterStack.NAME,
        "Containerfile"
      ),
      buildArgs: argsClusterConfig(config),
    });

    const volumeName = "crackosaurus";
    this.taskDefinition = new FargateTaskDefinition(this, "task", {
      cpu: 2048, // Very high CPU for large file processing
      memoryLimitMiB: 4096, // 4GB memory to handle 4GB+ files safely
      volumes: [
        {
          name: volumeName,
          efsVolumeConfiguration: {
            fileSystemId: props.fileSystem.fileSystemId,
            authorizationConfig: {
              accessPointId: props.accessPoint.accessPointId,
            },
            transitEncryption: "ENABLED",
          },
        },
      ],
    });

    this.taskDefinition.taskRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess")
    );

    props.stepFunction.grantStartExecution(this.taskDefinition.taskRole);
    props.fileSystem.grantReadWrite(this.taskDefinition.taskRole);

    const container = this.taskDefinition.addContainer("container", {
      containerName: tag("container"),
      image: ContainerImage.fromDockerImageAsset(image),
      environment: envClusterConfig(config),
      portMappings: [
        {
          containerPort: config.host.port,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          `curl -f http://localhost:${config.host.port}/ping || exit 1`,
        ],
        interval: Duration.seconds(60),
        retries: 5,
        timeout: Duration.seconds(30),
        startPeriod: Duration.minutes(2),
      },
      logging: LogDriver.awsLogs({
        streamPrefix: tag("container") ?? id,
      }),
    });

    container.addMountPoints({
      sourceVolume: volumeName,
      containerPath: props.fileSystemPath,
      readOnly: false,
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
        subnets: props.subnets,
      },
      securityGroups: [serviceSG],
      desiredCount: 1,
      healthCheckGracePeriod: Duration.minutes(5),
    });

    this.service.node.addDependency(props.fileSystem);
    this.service.node.addDependency(props.stepFunction);

    this.loadBalancer = new ApplicationLoadBalancer(this, "load-balancer", {
      vpc: props.cluster.vpc,
      vpcSubnets: {
        subnets: props.subnets,
      },
      internetFacing: false,
    });

    this.loadBalancer
      .addListener("load-balancer-http", {
        protocol: ApplicationProtocol.HTTP,
        port: 80,
        open: false,
      })
      .addTargets("load-balancer-http-target", {
        protocol: ApplicationProtocol.HTTP,
        port: config.host.port,
        targets: [this.service],
      })
      .configureHealthCheck({
        path: "/ping",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        timeout: Duration.seconds(30),
        interval: Duration.seconds(60),
      });

    this.service.connections.allowFrom(
      this.loadBalancer.connections,
      Port.tcp(config.host.port),
      "LoadBalancer to Cluster"
    );
  }
}
