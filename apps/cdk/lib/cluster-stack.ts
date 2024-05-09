import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { ISubnet, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  Compatibility,
  ContainerImage,
  Ec2Service,
  ICluster,
  NetworkMode,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "node:path";

import {
  ClusterConfig,
  argsClusterConfig,
  envClusterConfig,
} from "@repo/app-config/cluster";

export interface ClusterStackConfig {
  cpu?: number;
  memoryLimitMiB?: number;
}

export interface ServiceStackProps
  extends ClusterStackConfig,
    NestedStackProps {
  cluster: ICluster;
  subnets: ISubnet[];
  config: ClusterConfig;
}

export class ClusterStack extends NestedStack {
  public readonly executionRole: Role;
  public readonly securityGroup: SecurityGroup;
  public readonly service: Ec2Service;

  public static readonly NAME = "cluster";

  public static readonly DEFAULT_CPU = 512;
  public static readonly DEFAULT_MEMORY_LIMIT_MIB = 512;

  constructor(scope: Construct, props: ServiceStackProps) {
    super(scope, `${ClusterStack.NAME}-stack`, props);

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: `packages/container/${ClusterStack.NAME}/Containerfile`,
      buildArgs: argsClusterConfig(props.config),
    });

    this.executionRole = new Role(this, "role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
      ],
    });

    const taskDefinition = new TaskDefinition(this, "task", {
      compatibility: Compatibility.EC2,
      networkMode: NetworkMode.AWS_VPC,
      executionRole: this.executionRole,
    });

    taskDefinition.addContainer("container", {
      image: ContainerImage.fromDockerImageAsset(image),
      hostname: ClusterStack.NAME,
      environment: envClusterConfig(props.config),
      portMappings: [
        {
          containerPort: props.config.host.port,
        },
      ],
      cpu: props.cpu ?? ClusterStack.DEFAULT_CPU,
      memoryLimitMiB:
        props.memoryLimitMiB ?? ClusterStack.DEFAULT_MEMORY_LIMIT_MIB,
    });

    this.securityGroup = new SecurityGroup(this, "security-group", {
      vpc: props.cluster.vpc,
    });

    this.service = new Ec2Service(this, "service", {
      cluster: props.cluster,
      taskDefinition,
      vpcSubnets: {
        subnets: props.subnets,
      },
      securityGroups: [this.securityGroup],
    });
  }
}
