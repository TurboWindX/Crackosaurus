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
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

import {
  BACKEND_ENV,
  BackendConfig,
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
  clusterLoaderBalancer?: ILoadBalancerV2;
  databaseUrl: string;
  uploadsBucketArn: string;
  s3PresignedUrlRoleArn: string;
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
      cluster: props.clusterLoaderBalancer
        ? {
            name: props.clusterLoaderBalancer.loadBalancerDnsName,
            port: 80,
          }
        : {
            name: "cluster.crackosaurus.local", // Service Discovery via Cloud Map
            port: 13337,
          },
      secret: secret.secretValueFromJson("secret").unsafeUnwrap(),
      s3: {
        bucketArn: props.uploadsBucketArn,
        roleArn: props.s3PresignedUrlRoleArn,
      },
      environment: "production",
    };

    // Separate build-time args from runtime environment variables
    // Build args must be resolved at synthesis time, so only include static values
    const buildArgs = {
      [BACKEND_ENV.backendHost]: config.host.name,
      [BACKEND_ENV.backendPort]: config.host.port.toString(),
      [BACKEND_ENV.databaseProvider]: config.database.provider,
    };

    const image = new DockerImageAsset(this, "docker-image", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: path.join(
        "packages",
        "container",
        ServerStack.NAME,
        "Containerfile"
      ),
      buildArgs,
    });

    this.taskDefinition = new FargateTaskDefinition(this, "task", {
      cpu: 2048, // Very high CPU for large file processing
      memoryLimitMiB: 4096, // 4GB memory to handle 4GB+ files safely
    });

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
          `curl -f http://localhost:${config.host.port}/ping || exit 1`,
        ],
        interval: Duration.seconds(30), // Reduced from 60s for faster health checks
        retries: 3, // Reduced from 5 to fail faster if unhealthy
        timeout: Duration.seconds(10), // Reduced from 30s for quicker response
        startPeriod: Duration.seconds(60), // Reduced from 2 minutes for faster startup
      },
      logging: LogDriver.awsLogs({
        streamPrefix: tag("container") ?? id,
      }),
      essential: true,
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
      desiredCount: 1,
      healthCheckGracePeriod: Duration.seconds(120), // Reduced from 5 minutes for faster deployment
      enableExecuteCommand: true, // Enable ECS exec for debugging
      circuitBreaker: {
        rollback: true, // Enable automatic rollback on failures
      },
    });

    this.loadBalancer = new ApplicationLoadBalancer(this, "load-balancer", {
      vpc: props.cluster.vpc,
      vpcSubnets: {
        subnets: props.loadBalancerSubnets,
      },
      internetFacing: props.internet ?? false,
      idleTimeout: Duration.seconds(4000), // Maximum ALB timeout (66 minutes)
    });

    this.loadBalancer
      .addListener("load-balancer-http", {
        protocol: ApplicationProtocol.HTTP,
        port: 80,
        open: props.internet ?? false,
      })
      .addTargets("load-balancer-http-target", {
        protocol: ApplicationProtocol.HTTP,
        port: config.host.port,
        targets: [this.service],
        healthCheck: {
          timeout: Duration.seconds(30),
          interval: Duration.seconds(60),
        },
      })
      .configureHealthCheck({
        path: "/ping",
        timeout: Duration.seconds(30), // Increased health check timeout
        interval: Duration.seconds(60),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      });

    this.service.connections.allowFrom(
      this.loadBalancer.connections,
      Port.tcp(config.host.port),
      "LoadBalancer to Server"
    );

    // Allow ECS task role to generate presigned URLs (requires S3 object permissions)
    this.taskDefinition.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucketMultipartUploads",
          "s3:ListMultipartUploadParts",
          "s3:AbortMultipartUpload",
        ],
        resources: [props.uploadsBucketArn, `${props.uploadsBucketArn}/*`],
      })
    );
  }
}
