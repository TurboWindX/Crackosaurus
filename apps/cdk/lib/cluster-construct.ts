import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudmap from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

export interface ClusterServiceProps {
  cluster: ecs.ICluster;
  clusterRepo: ecr.IRepository;
  executionRole: iam.IRole;
  taskRole: iam.IRole;
  securityGroup: ec2.ISecurityGroup;
  vpcSubnets?: ec2.SubnetSelection;
  namespace: cloudmap.PrivateDnsNamespace;
  imageTag?: string;
  desiredCount?: number;
  discoveryNamespace?: string;
  discoveryService?: string;
  discoveryRegion?: string;
  clusterHost?: string;
  clusterPort?: string;
  stepFunctionArn?: string;
  jobQueueUrl?: string;
  fileSystem: efs.IFileSystem;
}

export class ClusterService extends Construct {
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ClusterServiceProps) {
    super(scope, id);

    const imageTag = props.imageTag;

    const taskDef = new ecs.FargateTaskDefinition(this, "ClusterTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: props.executionRole,
      taskRole: props.taskRole,
    });

    // Add EFS volume for shared storage
    const efsVolume = {
      name: "efs-volume",
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
        transitEncryption: "ENABLED",
        authorizationConfig: {
          iam: "ENABLED",
        },
      },
    };
    taskDef.addVolume(efsVolume);

    const container = taskDef.addContainer("ClusterContainer", {
      image: ecs.ContainerImage.fromEcrRepository(props.clusterRepo, imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "cluster" }),
      environment: {
        NODE_ENV: "production",
        CLUSTER_HOST: props.clusterHost ?? "0.0.0.0",
        CLUSTER_PORT: props.clusterPort ?? "13337",
        CLUSTER_TYPE: "aws",
        CLUSTER_INSTANCE_ROOT: "/data/instances",
        CLUSTER_WORDLIST_ROOT: "/data/wordlists",
        CLUSTER_DISCOVERY_TYPE: "cloud_map",
        CLUSTER_DISCOVERY_NAMESPACE: props.discoveryNamespace ?? "",
        CLUSTER_DISCOVERY_SERVICE: props.discoveryService ?? "cluster",
        CLUSTER_DISCOVERY_REGION: props.discoveryRegion ?? "",
        ...(props.stepFunctionArn ? { CLUSTER_STEP_FUNCTION: props.stepFunctionArn } : {}),
        ...(props.jobQueueUrl ? { CLUSTER_JOB_QUEUE_URL: props.jobQueueUrl } : {}),
      },
    });

    container.addMountPoints({
      sourceVolume: "efs-volume",
      containerPath: "/data",
      readOnly: false,
    });

    this.service = new ecs.FargateService(this, "ClusterFargateService", {
      cluster: props.cluster,
      taskDefinition: taskDef,
      desiredCount: props.desiredCount ?? 1,
      assignPublicIp: false,
      securityGroups: [props.securityGroup],
      vpcSubnets: props.vpcSubnets,
      cloudMapOptions: {
        name: props.discoveryService ?? "cluster",
        cloudMapNamespace: props.namespace,
      },
    });
  }
}
