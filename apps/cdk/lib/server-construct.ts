import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface ServerServiceProps {
  cluster: ecs.ICluster;
  serverRepo: ecr.IRepository;
  executionRole: iam.IRole;
  taskRole: iam.IRole;
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
  vpcSubnets?: ec2.SubnetSelection;
  dbHost: string;
  dbSecretArn: string;
  wordlistsBucket: s3.IBucket;
  imageTag?: string;
  desiredCount?: number;
  // cluster discovery defaults
  discoveryNamespace?: string;
  discoveryService?: string;
  discoveryRegion?: string;
  clusterHost?: string;
  clusterPort?: string;
}

export class ServerService extends Construct {
  public readonly service: ecs.FargateService;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: ServerServiceProps) {
    super(scope, id);

    const imageTag = props.imageTag;

    const taskDef = new ecs.FargateTaskDefinition(this, "ServerTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: props.executionRole,
      taskRole: props.taskRole,
    });

    // Build environment map (non-secret values)
    const env: { [key: string]: string } = {
      NODE_ENV: "production",
      S3_BUCKET_NAME: props.wordlistsBucket.bucketName,
      CLUSTER_DISCOVERY_TYPE: "cloud_map",
      CLUSTER_DISCOVERY_NAMESPACE: props.discoveryNamespace ?? "",
      CLUSTER_DISCOVERY_SERVICE: props.discoveryService ?? "cluster",
      CLUSTER_DISCOVERY_REGION: props.discoveryRegion ?? "",
      CLUSTER_PORT: props.clusterPort ?? "13337",
    };

    // Inject DB secrets directly from Secrets Manager
    const dbSecret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "DbSecret",
      props.dbSecretArn
    );
    const secrets: Record<string, ecs.Secret> = {
      DATABASE_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
      DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
      DATABASE_NAME: ecs.Secret.fromSecretsManager(dbSecret, "dbname"),
      DATABASE_HOST: ecs.Secret.fromSecretsManager(dbSecret, "host"),
      DATABASE_PORT: ecs.Secret.fromSecretsManager(dbSecret, "port"),
    };

    // If the caller provided an explicit clusterHost and it's not the placeholder
    // 0.0.0.0 (used by the cluster container), export it. Otherwise omit CLUSTER_HOST
    // so the server will use service discovery.
    const host = props.clusterHost ?? "";
    if (host && host !== "0.0.0.0" && host !== "0") {
      env["CLUSTER_HOST"] = host;
    }

    const container = taskDef.addContainer("ServerContainer", {
      image: ecs.ContainerImage.fromEcrRepository(props.serverRepo, imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "server" }),
      environment: env,
      secrets,
    });

    container.addPortMappings({ containerPort: 8080 });

    this.service = new ecs.FargateService(this, "FargateService", {
      cluster: props.cluster,
      taskDefinition: taskDef,
      desiredCount: props.desiredCount ?? 1,
      assignPublicIp: false,
      securityGroups: [props.securityGroup],
      vpcSubnets: props.vpcSubnets,
    });

    this.targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "FargateTargetGroup",
      {
        vpc: props.vpc,
        port: 8080,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: "/api/health",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
        },
      }
    );

    this.service.attachToApplicationTargetGroup(this.targetGroup);
  }
}
