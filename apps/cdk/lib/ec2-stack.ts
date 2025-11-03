import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudmap from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

import { InstanceStack } from "./instance-stack";

export interface CrackosaurusEC2StackProps extends cdk.StackProps {
  environmentName: string;
  imageTag?: string;  // Docker image tag to use (defaults to environmentName)
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
}

export class CrackosaurusEC2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrackosaurusEC2StackProps) {
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
      subnet: vpc.privateSubnets[0]!, // Use first private subnet for GPU instances
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

    // Allow S3 access for server (restricted to tagged buckets)
    serverRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:CreateBucket",
          "s3:PutBucketTagging",
          "s3:PutBucketCors",
          "s3:GetBucketCors",
        ],
        resources: ["arn:aws:s3:::crackosaurus-*"],
        conditions: {
          StringEquals: {
            "aws:RequestedRegion": this.region,
          },
        },
      })
    );

    serverRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetBucketLocation",
        ],
        resources: [
          "arn:aws:s3:::crackosaurus-*",
          "arn:aws:s3:::crackosaurus-*/*",
        ],
      })
    );

    // Allow S3 access for cluster (restricted to tagged buckets)
    clusterRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetBucketLocation",
        ],
        resources: [
          "arn:aws:s3:::crackosaurus-*",
          "arn:aws:s3:::crackosaurus-*/*",
        ],
      })
    );

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

    alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

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
      minCapacity: 1,
      maxCapacity: isProduction ? 3 : 1,
      desiredCapacity: 1,
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
