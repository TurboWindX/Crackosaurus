import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { SubnetType } from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  Compatibility,
  ContainerImage,
  Ec2Service,
  ICluster,
  NetworkMode,
  TaskDefinition,
} from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
import * as path from "node:path";

export interface ServiceStackConfig {
  hostname: string;
  subnetGroupName?: string;
  subnetType?: SubnetType;
  memoryLimitMiB: number;
}

export interface ServiceStackProps
  extends ServiceStackConfig,
    NestedStackProps {
  name: string;
  cluster: ICluster;
  args?: Record<string, string>;
  environment: Record<string, string>;
}

export class ServiceStack extends NestedStack {
  public readonly service: Ec2Service;

  constructor(scope: Construct, props: ServiceStackProps) {
    super(scope, `${props.name}-stack`, props);

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "../../.."),
      file: `packages/container/${props.name}/Containerfile`,
      buildArgs: props.args,
    });

    const taskDefinition = new TaskDefinition(this, "task", {
      compatibility: Compatibility.EC2,
      networkMode: NetworkMode.AWS_VPC,
    });

    taskDefinition.addContainer("container", {
      image: ContainerImage.fromDockerImageAsset(image),
      hostname: props.hostname,
      environment: props.environment,
      memoryLimitMiB: props.memoryLimitMiB,
    });

    this.service = new Ec2Service(this, "service", {
      cluster: props.cluster,
      taskDefinition,
      vpcSubnets: {
        subnetGroupName: props.subnetGroupName,
        subnetType: props.subnetType,
      },
    });
  }
}
