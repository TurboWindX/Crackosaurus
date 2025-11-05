import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudmap from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

import { InstanceStack } from "./instance-stack";

export interface CrackosaurusStackProps extends cdk.StackProps {
  environmentName: string;
  imageTag?: string;  // Docker image tag to use (defaults to environmentName)
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
}

export class CrackosaurusStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrackosaurusStackProps) {
    super(scope, id, props);

    const { environmentName } = props;
    const imageTag = props.imageTag || environmentName;  // Use environmentName if imageTag not specified
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
      ],
    });

    // Service Discovery Namespace
    const namespace = new cloudmap.PrivateDnsNamespace(
      this,
      "ServiceNamespace",
      {
        name: `${environmentName}.crackosaurus.local`,
        vpc,
      }
    );

    // ===========================================
    // ECR repositories for images (server, prisma runner, cluster)
    // ===========================================
    // Import existing ECR repositories by name (push script will create them if missing)
    const serverRepo = ecr.Repository.fromRepositoryName(
      this,
      "ServerRepository",
      "crackosaurus/server"
    );

    const prismaRepo = ecr.Repository.fromRepositoryName(
      this,
      "PrismaRepository",
      "crackosaurus/prisma"
    );

    const clusterRepo = ecr.Repository.fromRepositoryName(
      this,
      "ClusterRepository",
      "crackosaurus/cluster"
    );

    new cdk.CfnOutput(this, "ServerRepoUri", { value: serverRepo.repositoryUri });
    new cdk.CfnOutput(this, "PrismaRepoUri", { value: prismaRepo.repositoryUri });
    new cdk.CfnOutput(this, "ClusterRepoUri", { value: clusterRepo.repositoryUri });

    // ===========================================
    // Security Groups - Separated by tier for defense in depth
    // ===========================================
    
    // ALB Security Group - Internet facing
    const albSecurityGroup = new ec2.SecurityGroup(this, "ALBSecurityGroup", {
      vpc,
      description: "Security group for Application Load Balancer",
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic from internet"
    );
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic from internet"
    );

    // Server Security Group - For web/API servers
    const serverSecurityGroup = new ec2.SecurityGroup(
      this,
      "ServerSecurityGroup",
      {
        vpc,
        description: "Security group for server instances",
        allowAllOutbound: true,
      }
    );
    serverSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(8080),
      "Allow traffic from ALB to server"
    );

    // Cluster Security Group - For cluster worker nodes
    const clusterSecurityGroup = new ec2.SecurityGroup(
      this,
      "ClusterSecurityGroup",
      {
        vpc,
        description: "Security group for cluster worker instances",
        allowAllOutbound: true,
      }
    );
    clusterSecurityGroup.addIngressRule(
      serverSecurityGroup,
      ec2.Port.tcp(13337),
      "Allow cluster API access from server only"
    );
    clusterSecurityGroup.addIngressRule(
      clusterSecurityGroup,
      ec2.Port.tcp(13337),
      "Allow cluster-to-cluster communication"
    );

    // EFS Security Group - For shared file system
    const efsSecurityGroup = new ec2.SecurityGroup(this, "EFSSecurityGroup", {
      vpc,
      description: "Security group for EFS file system",
      allowAllOutbound: false,
    });
    efsSecurityGroup.addIngressRule(
      serverSecurityGroup,
      ec2.Port.tcp(2049),
      "Allow NFS from server instances"
    );
    efsSecurityGroup.addIngressRule(
      clusterSecurityGroup,
      ec2.Port.tcp(2049),
      "Allow NFS from cluster instances"
    );

    // GPU Instance Security Group - For Step Functions managed instances
    const gpuSecurityGroup = new ec2.SecurityGroup(
      this,
      "GpuSecurityGroup",
      {
        vpc,
        description: "Security group for GPU instances",
        allowAllOutbound: true,
      }
    );
    // GPU instances don't need inbound access - they pull jobs from SQS

    // RDS Security Group - For database
    const dbSecurityGroup = new ec2.SecurityGroup(this, "DBSecurityGroup", {
      vpc,
      description: "Security group for RDS database",
      allowAllOutbound: false,
    });
    dbSecurityGroup.addIngressRule(
      serverSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow PostgreSQL traffic from server"
    );
    dbSecurityGroup.addIngressRule(
      clusterSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow PostgreSQL traffic from cluster"
    );

    // ===========================================
    // Database: RDS Aurora Serverless v2 PostgreSQL
    // ===========================================
    const dbCredentials = new secretsmanager.Secret(this, "DBCredentials", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "crackosaurus" }),
        generateStringKey: "password",
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    const dbCluster = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_6,
      }),
      credentials: rds.Credentials.fromSecret(dbCredentials),
      writer: rds.ClusterInstance.serverlessV2("writer", {
        autoMinorVersionUpgrade: true,
      }),
      readers: [],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      defaultDatabaseName: "crackosaurus",
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      storageEncrypted: true, // REQUIRED by SCP
      backup: {
        retention: cdk.Duration.days(isProduction ? 7 : 1),
        preferredWindow: "03:00-04:00",
      },
      removalPolicy: isProduction
        ? cdk.RemovalPolicy.SNAPSHOT
        : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProduction,
    });

    // ===========================================
    // EFS File System for Shared Storage
    // ===========================================
    const fileSystem = new efs.FileSystem(this, "FileSystem", {
      vpc,
      encrypted: true, // Encrypt EFS at rest
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: isProduction
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      securityGroup: efsSecurityGroup, // Dedicated security group for EFS
    });

    new efs.AccessPoint(this, "AccessPoint", {
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
    // Instance Stack (Step Functions for GPU instances)
    // ===========================================
    const instanceStack = new InstanceStack(this, {
      prefix: environmentName,
      vpc,
      subnets: vpc.privateSubnets, // Pass all private subnets for multi-AZ support
      fileSystem,
      fileSystemPath: "/data",
      securityGroup: gpuSecurityGroup, // Pass GPU security group
      cooldown: 60, // seconds to wait before checking job status
      interval: 10, // seconds between checks
    });

    // ===========================================
    // IAM Roles - Separated by function for least privilege
    // ===========================================
    
    // Server Role - For web/API server instances
    const serverRole = new iam.Role(this, "ServerRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "IAM role for Crackosaurus server instances",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
      ],
    });

    // Cluster Role - For cluster worker instances
    const clusterRole = new iam.Role(this, "ClusterRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "IAM role for Crackosaurus cluster worker instances",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
      ],
    });

    // Allow reading database credentials
    dbCredentials.grantRead(serverRole);
    dbCredentials.grantRead(clusterRole);

    // Grant ECR pull permissions to roles for the created repositories
    try {
      serverRepo.grantPull(serverRole);
      prismaRepo.grantPull(serverRole);
      clusterRepo.grantPull(clusterRole);
    } catch (e) {
      // In case grant happens before role creation in some synth contexts, ignore
    }

    // Allow EFS access for server (mount and write)
    fileSystem.grant(
      serverRole,
      "elasticfilesystem:ClientRootAccess",
      "elasticfilesystem:ClientMount",
      "elasticfilesystem:ClientWrite"
    );

    // Allow EFS access for cluster (mount and write)
    fileSystem.grant(
      clusterRole,
      "elasticfilesystem:ClientRootAccess",
      "elasticfilesystem:ClientMount",
      "elasticfilesystem:ClientWrite"
    );

    // Allow ECR access for server
    serverRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"], // GetAuthorizationToken doesn't support resource-level permissions
      })
    );

    serverRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ],
        resources: [
          `arn:aws:ecr:${this.region}:${this.account}:repository/crackosaurus/server`,
          `arn:aws:ecr:${this.region}:${this.account}:repository/crackosaurus/prisma`,
        ],
      })
    );

    // Allow ECR access for cluster
    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"], // GetAuthorizationToken doesn't support resource-level permissions
      })
    );

    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ],
        resources: [
          `arn:aws:ecr:${this.region}:${this.account}:repository/crackosaurus/cluster`,
        ],
      })
    );

    // Allow CloudWatch Logs for server
    serverRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/crackosaurus/server/*`,
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/crackosaurus/server/*:log-stream:*`,
        ],
      })
    );

    // Allow CloudWatch Logs for cluster
    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/crackosaurus/cluster/*`,
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/crackosaurus/cluster/*:log-stream:*`,
        ],
      })
    );

    // Create an S3 bucket for wordlists and let CDK manage it. We give
    // object-level access to the roles that need it (EC2 server role,
    // Fargate task role, and cluster role). This keeps least-privilege
    // while allowing CDK to provision the bucket during deploy.
    const wordlistsBucket = new s3.Bucket(this, "WordlistsBucket", {
      // Use an environment-scoped, readable name so multiple environments
      // don't collide (e.g., crackosaurus-bleeding-wordlists)
      bucketName: `crackosaurus-${environmentName}-wordlists`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
    });

    new cdk.CfnOutput(this, "WordlistsBucketName", { value: wordlistsBucket.bucketName });
    new cdk.CfnOutput(this, "WordlistsBucketArn", { value: wordlistsBucket.bucketArn });

    // Configure CORS at deployment time so runtime tasks don't need s3:PutBucketCORS
    // This avoids granting the Fargate task permission to modify bucket-level
    // configuration and ensures the bucket is ready for cross-origin requests.
    wordlistsBucket.addCorsRule({
      allowedMethods: [
        s3.HttpMethods.GET,
        s3.HttpMethods.PUT,
        s3.HttpMethods.POST,
        s3.HttpMethods.DELETE,
        s3.HttpMethods.HEAD,
      ],
      allowedOrigins: ["*"],
      allowedHeaders: ["*"],
      exposedHeaders: ["ETag", "x-amz-version-id"],
      maxAge: 3000,
    });
    // Grant object-level access and list permissions to the appropriate roles
    wordlistsBucket.grantReadWrite(serverRole);
    wordlistsBucket.grantReadWrite(clusterRole);

    const listPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:ListBucket", "s3:GetBucketLocation"],
      resources: [wordlistsBucket.bucketArn],
    });

    serverRole.addToPolicy(listPolicy);
    clusterRole.addToPolicy(listPolicy);
  // taskRole grants are applied after taskRole is declared below

    // Allow Service Discovery for server (to discover cluster nodes)
    serverRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["servicediscovery:DiscoverInstances"],
        resources: [`arn:aws:servicediscovery:${this.region}:${this.account}:namespace/${namespace.namespaceId}`],
      })
    );

    // Allow Service Discovery for cluster (to register itself)
    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "servicediscovery:ListNamespaces",
          "servicediscovery:ListServices",
        ],
        resources: ["*"], // ListNamespaces and ListServices don't support resource-level permissions
      })
    );

    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "servicediscovery:RegisterInstance",
          "servicediscovery:DeregisterInstance",
          "servicediscovery:DiscoverInstances",
          "servicediscovery:GetInstance",
          "servicediscovery:ListInstances",
        ],
        resources: [
          `arn:aws:servicediscovery:${this.region}:${this.account}:namespace/${namespace.namespaceId}`,
          `arn:aws:servicediscovery:${this.region}:${this.account}:service/*`,
        ],
      })
    );

    // Allow Step Functions execution for cluster (to start GPU instances)
    instanceStack.stepFunction.grantStartExecution(clusterRole);

    // Allow SQS for server (to send jobs)
    instanceStack.jobQueue.grantSendMessages(serverRole);

    // Allow SQS for cluster (to send and receive jobs)
    instanceStack.jobQueue.grantSendMessages(clusterRole);
    instanceStack.jobQueue.grantConsumeMessages(clusterRole);

    // Allow EC2 terminate for cluster only (to delete GPU instances)
    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:DescribeInstances"],
        resources: ["*"], // DescribeInstances doesn't support resource-level permissions
      })
    );

    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:TerminateInstances"],
        resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/*`],
        conditions: {
          StringEquals: {
            "ec2:ResourceTag/ManagedBy": "Crackosaurus",
            "ec2:ResourceTag/Type": "GPU",
          },
        },
      })
    );

    // Allow EC2 operations for instance management (needed by Step Functions role)
    instanceStack.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:DescribeInstances"],
        resources: ["*"], // DescribeInstances doesn't support resource-level permissions
      })
    );

    instanceStack.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:RunInstances"],
        resources: [
          `arn:aws:ec2:${this.region}:${this.account}:instance/*`,
          `arn:aws:ec2:${this.region}:${this.account}:volume/*`,
          `arn:aws:ec2:${this.region}:${this.account}:network-interface/*`,
          `arn:aws:ec2:${this.region}::image/*`, // AMIs are regional, not account-specific
          `arn:aws:ec2:${this.region}:${this.account}:security-group/*`,
          `arn:aws:ec2:${this.region}:${this.account}:subnet/*`,
        ],
        conditions: {
          StringEquals: {
            "aws:RequestedRegion": this.region,
          },
        },
      })
    );

    instanceStack.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:CreateTags"],
        resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/*`],
        conditions: {
          StringEquals: {
            "ec2:CreateAction": "RunInstances",
          },
        },
      })
    );

    instanceStack.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:TerminateInstances"],
        resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/*`],
        conditions: {
          StringEquals: {
            "ec2:ResourceTag/ManagedBy": "Crackosaurus",
          },
        },
      })
    );

    // ===========================================
    // Application Load Balancer
    // ===========================================
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "ServerTargetGroup",
      {
        vpc,
        port: 8080,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/api/health",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    const listener = alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // ===========================================
    // ECS Cluster & Fargate Service (optional)
    // ===========================================
    const ecsCluster = new ecs.Cluster(this, "EcsCluster", { vpc });

    const taskRole = new iam.Role(this, "FargateTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // Allow task to read DB credentials
    dbCredentials.grantRead(taskRole);

    // Grant the Fargate task role access to the wordlists bucket (created above).
    // We do this here because `taskRole` is declared only after the bucket
    // creation site earlier in this function.
    wordlistsBucket.grantReadWrite(taskRole);
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket", "s3:GetBucketLocation"],
        resources: [wordlistsBucket.bucketArn],
      })
    );

    const executionRole = new iam.Role(this, "FargateExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    // Allow the execution role to read DB credentials from Secrets Manager
    // (needed so the task can fetch secrets at startup)
    dbCredentials.grantRead(executionRole);

    const taskDef = new ecs.FargateTaskDefinition(this, "ServerTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
      taskRole,
    });

    const container = taskDef.addContainer("ServerContainer", {
      image: ecs.ContainerImage.fromEcrRepository(serverRepo, imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "server" }),
      environment: {
        NODE_ENV: "production",
        // Provide DB host/port/name via env so entrypoint can build DATABASE_PATH
        DATABASE_HOST: dbCluster.clusterEndpoint.hostname,
        DATABASE_PORT: '5432',
        DATABASE_NAME: 'crackosaurus',
        // DO NOT set DATABASE_URL here; entrypoint will construct it
  // Provide the S3 bucket name (created by this stack) so the runtime
  // will not attempt to create buckets.
  S3_BUCKET_NAME: wordlistsBucket.bucketName,
      },
      // Inject DB username/password from Secrets Manager into container env vars
      secrets: {
        DATABASE_USER: ecs.Secret.fromSecretsManager(dbCredentials, 'username'),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbCredentials, 'password'),
      },
    });

    // Expose the same port mapping the app expects
    container.addPortMappings({ containerPort: 8080 });

    const fargateService = new ecs.FargateService(this, "FargateService", {
      cluster: ecsCluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [serverSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Ensure the Fargate service doesn't start creating tasks until the
    // database cluster has been created and is available. This makes
    // CloudFormation deploys more resilient by ordering resource creation
    // so tasks won't immediately fail trying to connect to a not-yet-ready DB.
    // Note: This only enforces CloudFormation resource creation order; the
    // service tasks still should handle transient DB unavailability at runtime.
    fargateService.node.addDependency(dbCluster);

    // Create an IP target group for the Fargate service and attach via listener rule
    const fargateTargetGroup = new elbv2.ApplicationTargetGroup(this, "FargateTargetGroup", {
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/api/health",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
    });

    // Attach service tasks to the target group
    fargateService.attachToApplicationTargetGroup(fargateTargetGroup);

    // Add a listener rule to route all traffic to the Fargate target group (full cutover)
    listener.addAction("FargateDefaultRule", {
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/*"])],
      action: elbv2.ListenerAction.forward([fargateTargetGroup]),
    });

    // If you still need the EC2 instance target group for static assets, add a rule
    // with a lower priority number (higher precedence) to route specific paths to the ASG.
    // Example: route /static/* to the EC2 target group (keep commented unless needed)
    // listener.addAction("Ec2StaticRule", {
    //   priority: 5,
    //   conditions: [elbv2.ListenerCondition.pathPatterns(["/static/*"])],
    //   action: elbv2.ListenerAction.forward([targetGroup]),
    // });

    // ===========================================
    // User Data Script for EC2 Instances
    // ===========================================
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -ex",
      "",
      "# Install required packages",
      "yum update -y",
      "yum install -y docker amazon-efs-utils jq",
      "systemctl start docker",
      "systemctl enable docker",
      "usermod -aG docker ec2-user",
      "",
      "# Mount EFS using token substitution"
    );

    // Mount EFS - use cfn-init style with metadata or direct script
    // Write mount script to file and execute it
    userData.addCommands(
      "mkdir -p /mnt/efs",
      "",
      "# Create mount script to avoid token substitution issues"
    );

    userData.addCommands(
      cdk.Fn.sub(
        "cat > /tmp/mount-efs.sh << 'EOFSCRIPT'\n#!/bin/bash\nset -e\nmount -t efs -o tls,iam ${FileSystemId}:/ /mnt/efs\necho \"${FileSystemId}:/ /mnt/efs efs _netdev,tls,iam 0 0\" >> /etc/fstab\nEOFSCRIPT",
        {
          FileSystemId: fileSystem.fileSystemId,
        }
      )
    );

    userData.addCommands(
      "chmod +x /tmp/mount-efs.sh",
      "/tmp/mount-efs.sh",
      "",
      "# Create data directories",
      "mkdir -p /mnt/efs/wordlists /mnt/efs/instances /mnt/efs/jobs",
      "groupadd -g 1001 cluster || true",
      "useradd -u 1001 -g 1001 -m cluster || true",
      "chown -R 1001:1001 /mnt/efs",
      ""
    );

    userData.addCommands(
      "# Get database credentials from Secrets Manager",
      `DB_SECRET_ARN=${dbCredentials.secretArn}`,
      `AWS_REGION=${this.region}`,
      "DB_SECRET=$(aws secretsmanager get-secret-value --secret-id $DB_SECRET_ARN --region $AWS_REGION --query SecretString --output text)",
      "DB_PASSWORD=$(echo $DB_SECRET | jq -r .password)",
      `DB_HOST=${dbCluster.clusterEndpoint.hostname}`,
      "",
      "# ECR Login and pull images",
      `ECR_REGISTRY=${this.account}.dkr.ecr.${this.region}.amazonaws.com`,
      `IMAGE_TAG=${imageTag}`,
      "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY",
      "docker pull $ECR_REGISTRY/crackosaurus/server:$IMAGE_TAG",
      "docker pull $ECR_REGISTRY/crackosaurus/prisma:$IMAGE_TAG",
      "",
      "# Run Prisma migrations",
      'echo "Running Prisma migrations..."',
      'DATABASE_URL="postgresql://crackosaurus:${DB_PASSWORD}@${DB_HOST}:5432/crackosaurus?schema=public"',
      'docker run --rm -e DATABASE_PROVIDER=postgresql -e DATABASE_PATH="${DATABASE_URL}" $ECR_REGISTRY/crackosaurus/prisma:$IMAGE_TAG || echo "WARNING: Prisma migration failed, continuing..."',
      'echo "Prisma migrations complete"',
      "",
      "# Run server container",
      `docker run -d --name crackosaurus-server --restart unless-stopped -p 8080:8080 -v /mnt/efs:/data -e NODE_ENV=production -e DATABASE_PROVIDER=postgresql -e DATABASE_PATH="\${DATABASE_URL}" -e STORAGE_TYPE=filesystem -e STORAGE_PATH=/data -e CLUSTER_TYPE=external -e CLUSTER_DISCOVERY_TYPE=cloud_map -e CLUSTER_DISCOVERY_NAMESPACE=${environmentName}.crackosaurus.local -e CLUSTER_DISCOVERY_SERVICE=cluster -e CLUSTER_DISCOVERY_REGION=\${AWS_REGION} -e CLUSTER_HOST=cluster.${environmentName}.crackosaurus.local -e CLUSTER_PORT=13337 -e USE_WEB_HOST=true -e AWS_REGION=\${AWS_REGION} $ECR_REGISTRY/crackosaurus/server:$IMAGE_TAG`,
      "",
      "echo 'EC2 instance setup complete'"
    );

    // ===========================================
    // Launch Template for Server Instances
    // ===========================================
    const serverLaunchTemplate = new ec2.LaunchTemplate(this, "ServerLaunchTemplate", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: serverSecurityGroup, // Server security group
      role: serverRole, // Server IAM role
      userData,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true, // CRITICAL: Required by SCP
            deleteOnTermination: true,
          }),
        },
      ],
      requireImdsv2: true, // Security best practice
    });

    // ===========================================
    // Auto Scaling Group for Server
    // ===========================================
    const serverAsg = new autoscaling.AutoScalingGroup(this, "ServerASG", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      launchTemplate: serverLaunchTemplate,
      // Full cutover: scale ASG down to zero by default (min/desired set to 0)
      minCapacity: 0,
      maxCapacity: isProduction ? 3 : 1,
      desiredCapacity: 0,
      healthCheck: autoscaling.HealthCheck.elb({
        grace: cdk.Duration.minutes(30),
      }),
      updatePolicy: autoscaling.UpdatePolicy.rollingUpdate({
        maxBatchSize: 1,
        minInstancesInService: isProduction ? 1 : 0,
        pauseTime: cdk.Duration.minutes(5),
      }),
    });

    // Attach to ALB target group
    targetGroup.addTarget(serverAsg);

    // ===========================================
    // Cluster Worker Launch Template (Spot)
    // ===========================================
    const clusterUserData = ec2.UserData.forLinux();
    clusterUserData.addCommands(
      "set -ex",
      "",
      "# Install required packages",
      "yum update -y",
      "yum install -y docker amazon-efs-utils jq",
      "systemctl start docker",
      "systemctl enable docker",
      "usermod -aG docker ec2-user",
      "",
      "# Mount EFS using token substitution"
    );

    // Mount EFS for cluster
    clusterUserData.addCommands(
      "mkdir -p /mnt/efs",
      "",
      "# Create mount script"
    );

    clusterUserData.addCommands(
      cdk.Fn.sub(
        "cat > /tmp/mount-efs.sh << 'EOFSCRIPT'\n#!/bin/bash\nset -e\nmount -t efs -o tls,iam ${FileSystemId}:/ /mnt/efs\necho \"${FileSystemId}:/ /mnt/efs efs _netdev,tls,iam 0 0\" >> /etc/fstab\nEOFSCRIPT",
        {
          FileSystemId: fileSystem.fileSystemId,
        }
      )
    );

    clusterUserData.addCommands(
      "chmod +x /tmp/mount-efs.sh",
      "/tmp/mount-efs.sh",
      "",
      "# Create cluster user with UID 1001 to match Docker container",
      "groupadd -g 1001 cluster || true",
      "useradd -u 1001 -g 1001 -m cluster || true",
      "",
      "# Create data directories and set ownership",
      "mkdir -p /mnt/efs/wordlists /mnt/efs/instances /mnt/efs/jobs",
      "chown -R 1001:1001 /mnt/efs",
      ""
    );

    clusterUserData.addCommands(
      "# Get database credentials from Secrets Manager",
      `DB_SECRET_ARN=${dbCredentials.secretArn}`,
      `AWS_REGION=${this.region}`,
      "DB_SECRET=$(aws secretsmanager get-secret-value --secret-id $DB_SECRET_ARN --region $AWS_REGION --query SecretString --output text)",
      "DB_PASSWORD=$(echo $DB_SECRET | jq -r .password)",
      `DB_HOST=${dbCluster.clusterEndpoint.hostname}`,
      "",
      "# ECR Login and pull cluster image",
      `ECR_REGISTRY=${this.account}.dkr.ecr.${this.region}.amazonaws.com`,
      `IMAGE_TAG=${imageTag}`,
      "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY",
      "docker pull $ECR_REGISTRY/crackosaurus/cluster:$IMAGE_TAG",
      'DATABASE_URL="postgresql://crackosaurus:${DB_PASSWORD}@${DB_HOST}:5432/crackosaurus?schema=public"',
      "docker run -d \\",
      "  --name crackosaurus-cluster \\",
      "  --restart unless-stopped \\",
      "  -p 13337:13337 \\",
      "  -v /mnt/efs:/data \\",
      '  -e NODE_ENV="production" \\',
      '  -e DATABASE_PROVIDER="postgresql" \\',
      '  -e DATABASE_PATH="$DATABASE_URL" \\',
      '  -e STORAGE_TYPE="filesystem" \\',
      '  -e STORAGE_PATH="/data" \\',
      '  -e CLUSTER_TYPE="aws" \\',
      '  -e CLUSTER_HOST="0.0.0.0" \\',
      '  -e CLUSTER_PORT="13337" \\',
      '  -e AWS_REGION="$AWS_REGION" \\',
      `  -e CLUSTER_STEP_FUNCTION="${instanceStack.stepFunction.stateMachineArn}" \\`,
      `  -e CLUSTER_JOB_QUEUE_URL="${instanceStack.jobQueue.queueUrl}" \\`,
      '  -e CLUSTER_INSTANCE_ROOT="/data/instances" \\',
      '  -e CLUSTER_WORDLIST_ROOT="/data/wordlists" \\',
      '  -e CLUSTER_DISCOVERY_TYPE="cloud_map" \\',
      `  -e CLUSTER_DISCOVERY_NAMESPACE="${environmentName}.crackosaurus.local" \\`,
      '  -e CLUSTER_DISCOVERY_SERVICE="cluster" \\',
      '  -e CLUSTER_DISCOVERY_REGION="$AWS_REGION" \\',
      "  $ECR_REGISTRY/crackosaurus/cluster:$IMAGE_TAG",
      "",
      "# Register with Cloud Map",
      "INSTANCE_ID=$(ec2-metadata --instance-id | cut -d ' ' -f 2)",
      "PRIVATE_IP=$(ec2-metadata --local-ipv4 | cut -d ' ' -f 2)",
      `NAMESPACE_ID=$(aws servicediscovery list-namespaces --region $AWS_REGION --query "Namespaces[?Name=='${environmentName}.crackosaurus.local'].Id" --output text)`,
      `SERVICE_ID=$(aws servicediscovery list-services --region $AWS_REGION --filters Name=NAMESPACE_ID,Values=$NAMESPACE_ID,Condition=EQ --query "Services[?Name=='cluster'].Id" --output text)`,
      "aws servicediscovery register-instance --region $AWS_REGION \\",
      "  --service-id $SERVICE_ID \\",
      "  --instance-id $INSTANCE_ID \\",
      "  --attributes AWS_INSTANCE_IPV4=$PRIVATE_IP,AWS_INSTANCE_PORT=13337",
      "",
      "echo 'Cluster worker setup complete'"
    );

    const clusterLaunchTemplate = new ec2.LaunchTemplate(
      this,
      "ClusterLaunchTemplate",
      {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.SMALL
        ),
        machineImage: ec2.MachineImage.latestAmazonLinux2023(),
        securityGroup: clusterSecurityGroup, // Cluster security group
        role: clusterRole, // Cluster IAM role
        userData: clusterUserData,
        blockDevices: [
          {
            deviceName: "/dev/xvda",
            volume: ec2.BlockDeviceVolume.ebs(30, {
              volumeType: ec2.EbsDeviceVolumeType.GP3,
              encrypted: true, // CRITICAL: Required by SCP
              deleteOnTermination: true,
            }),
          },
        ],
        requireImdsv2: true,
      }
    );

    // Register cluster service with Cloud Map
    namespace.createService("ClusterService", {
      name: "cluster",
      dnsRecordType: cloudmap.DnsRecordType.A,
      dnsTtl: cdk.Duration.seconds(30),
    });

    // ===========================================
    // Auto Scaling Group for Cluster Workers (Spot)
    // ===========================================
    const clusterAsg = new autoscaling.AutoScalingGroup(this, "ClusterASG", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      mixedInstancesPolicy: {
        launchTemplate: clusterLaunchTemplate,
        instancesDistribution: {
          onDemandPercentageAboveBaseCapacity: 100, // 100% spot instances
          spotAllocationStrategy:
            autoscaling.SpotAllocationStrategy.PRICE_CAPACITY_OPTIMIZED,
        },
      },
      minCapacity: 0,
      maxCapacity: isProduction ? 10 : 3,
      desiredCapacity: 1, // Keep 1 cluster instance running
      updatePolicy: autoscaling.UpdatePolicy.rollingUpdate({
        maxBatchSize: 2,
        minInstancesInService: 0,
      }),
    });

    // ===========================================
    // Outputs
    // ===========================================
    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: alb.loadBalancerDnsName,
      description: "Application Load Balancer DNS name",
    });

    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: dbCluster.clusterEndpoint.hostname,
      description: "RDS cluster endpoint",
    });

    new cdk.CfnOutput(this, "FileSystemId", {
      value: fileSystem.fileSystemId,
      description: "EFS file system ID",
    });

    new cdk.CfnOutput(this, "ServerASGName", {
      value: serverAsg.autoScalingGroupName,
      description: "Server Auto Scaling Group name",
    });

    new cdk.CfnOutput(this, "ClusterASGName", {
      value: clusterAsg.autoScalingGroupName,
      description: "Cluster Auto Scaling Group name",
    });
  }
}
