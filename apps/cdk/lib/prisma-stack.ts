import { Duration } from "aws-cdk-lib";
import { ISubnet } from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import {
  ContainerImage,
  FargateTaskDefinition,
  ICluster,
  LogDriver,
} from "aws-cdk-lib/aws-ecs";
import { DefinitionBody, StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import {
  EcsFargateLaunchTarget,
  EcsRunTask,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PrismaStackConfig {}

export interface PrismaStackProps extends PrismaStackConfig {
  prefix?: string;
  databaseUrl: string;
  cluster: ICluster;
  subnets: ISubnet[];
}

export class PrismaStack extends Construct {
  public readonly runTask: EcsRunTask;
  public readonly taskDefinition: FargateTaskDefinition;
  public readonly stateMachine: StateMachine;

  public static readonly NAME = "prisma";

  public static readonly DEFAULT_CPU = 512;
  public static readonly DEFAULT_MEMORY_LIMIT_MIB = 512;

  constructor(scope: Construct, props: PrismaStackProps) {
    const id = `${PrismaStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: path.join(
        "packages",
        "container",
        PrismaStack.NAME,
        "Containerfile"
      ),
      buildArgs: {
        DATABASE_PROVIDER: "postgresql",
      },
    });

    this.taskDefinition = new FargateTaskDefinition(this, "task");

    this.taskDefinition.addContainer("container", {
      containerName: tag("container"),
      image: ContainerImage.fromDockerImageAsset(image),
      environment: {
        DATABASE_PATH: props.databaseUrl,
      },
      logging: LogDriver.awsLogs({
        streamPrefix: tag("container") ?? id,
      }),
    });

    this.runTask = new EcsRunTask(this, "run-task", {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      launchTarget: new EcsFargateLaunchTarget(),
    });

    this.stateMachine = new StateMachine(this, "trigger-task", {
      stateMachineName: tag("trigger-task"),
      definitionBody: DefinitionBody.fromChainable(this.runTask),
      timeout: Duration.minutes(3),
    });
  }
}
