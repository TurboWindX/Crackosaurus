import * as cdk from "aws-cdk-lib";
import * as cloudmap from "aws-cdk-lib/aws-servicediscovery";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface CrackosaurusStackProps extends cdk.StackProps {
  environmentName: string;
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
  dbPassword?: string;
}

export class CrackosaurusStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrackosaurusStackProps) {
    super(scope, id, props);

    const { environmentName, domainName } = props;
    const isProduction = environmentName === "prod";

    // ===========================================
    // VPC and Networking
    // ===========================================
    const vpc = new ec2.Vpc(this, "VPC", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        // Removed isolated subnets - not needed for Fargate + SQLite on EFS
      ],
    });

    // Service Discovery Namespace
    const namespace = new cloudmap.PrivateDnsNamespace(this, "ServiceNamespace", {
      name: "crackosaurus.local",
      vpc,
    });

    // ===========================================
    // Security Groups
    // ===========================================
    const albSecurityGroup = new ec2.SecurityGroup(this, "ALBSecurityGroup", {
      vpc,
      description: "Security group for Application Load Balancer",
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic"
    );

    const ecsSecurityGroup = new ec2.SecurityGroup(this, "ECSSecurityGroup", {
      vpc,
      description: "Security group for ECS instances",
      allowAllOutbound: true,
    });
    ecsSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(8080),
      "Allow traffic from ALB to server"
    );
    ecsSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(13337),
      "Allow cluster communication"
    );
    ecsSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(2049),
      "Allow NFS traffic for EFS"
    );

    // ===========================================
    // Database: SQLite on EFS (persistent storage)
    // ===========================================
    // EFS filesystem to store SQLite database - survives task restarts
    const fileSystem = new efs.FileSystem(this, "FileSystem", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroup: ecsSecurityGroup,
      encrypted: true,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // EFS doesn't support SNAPSHOT
    });

    // Access point for the database directory
    const accessPoint = new efs.AccessPoint(this, "AccessPoint", {
      fileSystem,
      path: "/data",
      createAcl: {
        ownerGid: "1000",
        ownerUid: "1000",
        permissions: "755",
      },
      posixUser: {
        gid: "1000",
        uid: "1000",
      },
    });

    // ===========================================
    // IAM Roles
    // ===========================================

    // ECS Task Execution Role - used by ECS to pull images, write logs
    const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    // ECS Task Role - used by application containers to access AWS services
    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // Grant S3 permissions for dynamic bucket creation
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:CreateBucket",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:GetBucketCors",
          "s3:PutBucketPublicAccessBlock",
          "s3:PutBucketCORS",
          "s3:PutBucketVersioning",
        ],
        resources: ["arn:aws:s3:::crackosaurus-*"],
      })
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListMultipartUploadParts",
          "s3:AbortMultipartUpload",
        ],
        resources: ["arn:aws:s3:::crackosaurus-*/*"],
      })
    );

    // ===========================================
    // ECS Cluster with Fargate
    // ===========================================
    const ecsCluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `crackosaurus-${environmentName}`,
      containerInsights: false, // Disable to save costs
    });

    // ===========================================
    // Application Load Balancer
    // ===========================================
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "ServerTargetGroup", {
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP, // Fargate uses IP type
      healthCheck: {
        path: "/ping",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // ===========================================
    // Server Service (Fargate)
    // ===========================================
    const serverRepository = ecr.Repository.fromRepositoryName(
      this,
      "ServerRepository",
      "crackosaurus/server"
    );
    serverRepository.grantPull(taskExecutionRole);

    const serverTaskDefinition = new ecs.FargateTaskDefinition(this, "ServerTask", {
      cpu: 256, // 0.25 vCPU
      memoryLimitMiB: 512, // 512 MB
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    // Mount EFS for SQLite database
    serverTaskDefinition.addVolume({
      name: "data",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        transitEncryption: "ENABLED",
        authorizationConfig: {
          accessPointId: accessPoint.accessPointId,
          iam: "ENABLED",
        },
      },
    });

    const serverContainer = serverTaskDefinition.addContainer("server", {
      containerName: "server",
      image: ecs.ContainerImage.fromEcrRepository(serverRepository, "latest"),
      portMappings: [
        {
          containerPort: 8080,
          protocol: ecs.Protocol.TCP,
        },
      ],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "server",
      }),
      environment: {
        NODE_ENV: "production",
        DATABASE_PROVIDER: "sqlite",
        DATABASE_PATH: "file:///data/crackosaurus.db", // Stored on EFS with file:// protocol (absolute path)
        BACKEND_HOST: "0.0.0.0",
        BACKEND_PORT: "8080",
        WEB_HOST: domainName || alb.loadBalancerDnsName,
        WEB_PORT: "80",
        CLUSTER_HOST: "cluster.crackosaurus.local",
        CLUSTER_PORT: "13337",
        AWS_REGION: this.region,
      },
    });

    // Mount the EFS volume to the container
    serverContainer.addMountPoints({
      sourceVolume: "data",
      containerPath: "/data",
      readOnly: false,
    });

    // Grant EFS access to the task role
    fileSystem.grant(taskRole, "elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite");

    const serverService = new ecs.FargateService(this, "ServerService", {
      cluster: ecsCluster,
      taskDefinition: serverTaskDefinition,
      desiredCount: 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSecurityGroup],
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE",
          weight: 1,
        },
      ],
    });

    serverService.attachToApplicationTargetGroup(targetGroup);

    // Auto-scaling based on CPU for production
    if (isProduction) {
      const scaling = serverService.autoScaleTaskCount({
        minCapacity: 1,
        maxCapacity: 4,
      });

      scaling.scaleOnCpuUtilization("CpuScaling", {
        targetUtilizationPercent: 70,
        scaleInCooldown: cdk.Duration.seconds(60),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });
    }

    // ===========================================
    // Cluster Service (Fargate with Spot)
    // ===========================================
    const clusterRepository = ecr.Repository.fromRepositoryName(
      this,
      "ClusterRepository",
      "crackosaurus/cluster"
    );
    clusterRepository.grantPull(taskExecutionRole);

    const clusterTaskDefinition = new ecs.FargateTaskDefinition(this, "ClusterTask", {
      cpu: 256, // 0.25 vCPU
      memoryLimitMiB: 512, // 512 MB
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    const clusterContainer = clusterTaskDefinition.addContainer("cluster", {
      containerName: "cluster",
      image: ecs.ContainerImage.fromEcrRepository(clusterRepository, "latest"),
      portMappings: [
        {
          containerPort: 13337,
          protocol: ecs.Protocol.TCP,
        },
      ],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "cluster",
      }),
      environment: {
        CLUSTER_HOST: "0.0.0.0",
        CLUSTER_PORT: "13337",
        CLUSTER_TYPE: "external",
        AWS_REGION: this.region,
      },
    });

    new ecs.FargateService(this, "ClusterService", {
      cluster: ecsCluster,
      taskDefinition: clusterTaskDefinition,
      desiredCount: 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSecurityGroup],
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT", // Use Spot for cost savings (can be interrupted)
          weight: 1,
        },
      ],
      cloudMapOptions: {
        name: "cluster",
        cloudMapNamespace: namespace,
        dnsRecordType: cloudmap.DnsRecordType.A, // Fargate uses A records, not SRV
        dnsTtl: cdk.Duration.seconds(10),
        container: clusterContainer,
        containerPort: 13337,
      },
    });

    // ===========================================
    // DNS (Optional)
    // ===========================================
    if (domainName && props.hostedZoneId) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
        this,
        "HostedZone",
        {
          hostedZoneId: props.hostedZoneId,
          zoneName: domainName,
        }
      );

      new route53.ARecord(this, "AliasRecord", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.LoadBalancerTarget(alb)
        ),
      });
    }

    // ===========================================
    // Outputs
    // ===========================================
    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: alb.loadBalancerDnsName,
      description: "DNS name of the load balancer",
      exportName: `${id}-LoadBalancerDNS`,
    });

    new cdk.CfnOutput(this, "DatabaseInfo", {
      value: "SQLite database at /data/crackosaurus.db on EFS",
      description: "Database configuration",
      exportName: `${id}-DatabaseInfo`,
    });

    new cdk.CfnOutput(this, "FileSystemId", {
      value: fileSystem.fileSystemId,
      description: "EFS File System ID",
      exportName: `${id}-FileSystemId`,
    });

    new cdk.CfnOutput(this, "ClusterName", {
      value: ecsCluster.clusterName,
      description: "ECS cluster name (Fargate)",
      exportName: `${id}-ClusterName`,
    });

    if (domainName) {
      new cdk.CfnOutput(this, "ApplicationURL", {
        value: `http://${domainName}`,
        description: "Application URL",
      });
    }
  }
}
