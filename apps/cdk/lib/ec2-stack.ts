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
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
}

export class CrackosaurusEC2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrackosaurusEC2StackProps) {
    super(scope, id, props);

    const { environmentName } = props;
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
        name: "crackosaurus.local",
        vpc,
      }
    );

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

    const ec2SecurityGroup = new ec2.SecurityGroup(this, "EC2SecurityGroup", {
      vpc,
      description: "Security group for EC2 instances",
      allowAllOutbound: true,
    });
    ec2SecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(8080),
      "Allow traffic from ALB to server"
    );
    ec2SecurityGroup.addIngressRule(
      ec2SecurityGroup,
      ec2.Port.tcp(13337),
      "Allow cluster communication"
    );
    ec2SecurityGroup.addIngressRule(
      ec2SecurityGroup,
      ec2.Port.tcp(2049),
      "Allow NFS traffic for EFS"
    );

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DBSecurityGroup", {
      vpc,
      description: "Security group for RDS database",
      allowAllOutbound: false,
    });
    dbSecurityGroup.addIngressRule(
      ec2SecurityGroup,
      ec2.Port.tcp(5432),
      "Allow PostgreSQL traffic from EC2"
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
      encrypted: true, // Encrypt EFS as well
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: isProduction
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      securityGroup: ec2SecurityGroup,
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
      cooldown: 60, // seconds to wait before checking job status
      interval: 10, // seconds between checks
    });

    // ===========================================
    // IAM Role for EC2 Instances
    // ===========================================
    const ec2Role = new iam.Role(this, "EC2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
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
    dbCredentials.grantRead(ec2Role);

    // Allow EFS access - including root access for mounting
    fileSystem.grant(
      ec2Role,
      "elasticfilesystem:ClientRootAccess",
      "elasticfilesystem:ClientMount",
      "elasticfilesystem:ClientWrite"
    );

    // Allow ECR access
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"], // GetAuthorizationToken doesn't support resource-level permissions
      })
    );

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ],
        resources: [
          `arn:aws:ecr:${this.region}:${this.account}:repository/crackosaurus/*`,
        ],
      })
    );

    // Allow CloudWatch Logs
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/crackosaurus/*`,
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/crackosaurus/*:log-stream:*`,
        ],
      })
    );

    // Allow S3 access for uploads/downloads
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:CreateBucket",
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetBucketLocation",
          "s3:PutBucketCors",
          "s3:GetBucketCors",
        ],
        resources: [
          "arn:aws:s3:::crackosaurus-*",
          "arn:aws:s3:::crackosaurus-*/*",
        ],
      })
    );

    // Allow Service Discovery for Cloud Map registration
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["servicediscovery:ListServices"],
        resources: ["*"], // ListServices doesn't support resource-level permissions
      })
    );

    ec2Role.addToPolicy(
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
          `arn:aws:servicediscovery:${this.region}:${this.account}:namespace/*`,
          `arn:aws:servicediscovery:${this.region}:${this.account}:service/*`,
        ],
      })
    );

    // Allow Step Functions execution for GPU instance deployment
    instanceStack.stepFunction.grantStartExecution(ec2Role);

    // Allow SQS send messages for job notifications
    instanceStack.jobQueue.grantSendMessages(ec2Role);

    // Allow EC2 terminate for cluster to delete GPU instances
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:DescribeInstances"],
        resources: ["*"], // DescribeInstances doesn't support resource-level permissions
      })
    );

    ec2Role.addToPolicy(
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
      "# ECR Login",
      `ECR_REGISTRY=${this.account}.dkr.ecr.${this.region}.amazonaws.com`,
      "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY",
      "",
      "# Pull server and prisma images",
      "docker pull $ECR_REGISTRY/crackosaurus/server:latest",
      "docker pull $ECR_REGISTRY/crackosaurus/prisma:latest",
      "",
      "# Run Prisma migrations",
      'echo "Running Prisma migrations..."',
      'PRISMA_DB_URL="postgresql://crackosaurus:${DB_PASSWORD}@${DB_HOST}:5432/crackosaurus?schema=public"',
      'docker run --rm -e DATABASE_PROVIDER=postgresql -e DATABASE_PATH="${PRISMA_DB_URL}" $ECR_REGISTRY/crackosaurus/prisma:latest || echo "WARNING: Prisma migration failed, continuing..."',
      'echo "Prisma migrations complete"',
      "",
      "# Run server container",
      "docker run -d --name crackosaurus-server --restart unless-stopped -p 8080:8080 -v /mnt/efs:/data -e NODE_ENV=production -e DATABASE_PROVIDER=postgresql -e DATABASE_HOST=${DB_HOST} -e DATABASE_PORT=5432 -e DATABASE_NAME=crackosaurus -e DATABASE_USER=crackosaurus -e DATABASE_PASSWORD=${DB_PASSWORD} -e STORAGE_TYPE=filesystem -e STORAGE_PATH=/data -e CLUSTER_TYPE=external -e CLUSTER_DISCOVERY_TYPE=cloud_map -e CLUSTER_DISCOVERY_NAMESPACE=crackosaurus.local -e CLUSTER_DISCOVERY_SERVICE=cluster -e CLUSTER_DISCOVERY_REGION=${AWS_REGION} -e CLUSTER_HOST=cluster.crackosaurus.local -e CLUSTER_PORT=13337 -e USE_WEB_HOST=true $ECR_REGISTRY/crackosaurus/server:latest",
      "",
      "echo 'EC2 instance setup complete'"
    );

    // ===========================================
    // Launch Template with Encrypted EBS
    // ===========================================
    const launchTemplate = new ec2.LaunchTemplate(this, "LaunchTemplate", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
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
      launchTemplate,
      minCapacity: 1,
      maxCapacity: isProduction ? 3 : 1,
      desiredCapacity: 1,
      healthCheck: autoscaling.HealthCheck.elb({
        grace: cdk.Duration.minutes(30), // Extended to debug EFS mount issues
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
      "# ECR Login",
      `ECR_REGISTRY=${this.account}.dkr.ecr.${this.region}.amazonaws.com`,
      "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY",
      "",
      "# Pull and run cluster container",
      "docker pull $ECR_REGISTRY/crackosaurus/cluster:latest",
      "docker run -d \\",
      "  --name crackosaurus-cluster \\",
      "  --restart unless-stopped \\",
      "  -p 13337:13337 \\",
      "  -v /mnt/efs:/data \\",
      '  -e NODE_ENV="production" \\',
      '  -e DATABASE_PROVIDER="postgresql" \\',
      '  -e DATABASE_HOST="$DB_HOST" \\',
      '  -e DATABASE_PORT="5432" \\',
      '  -e DATABASE_NAME="crackosaurus" \\',
      '  -e DATABASE_USER="crackosaurus" \\',
      '  -e DATABASE_PASSWORD="$DB_PASSWORD" \\',
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
      '  -e CLUSTER_DISCOVERY_NAMESPACE="crackosaurus.local" \\',
      '  -e CLUSTER_DISCOVERY_SERVICE="cluster" \\',
      '  -e CLUSTER_DISCOVERY_REGION="$AWS_REGION" \\',
      "  $ECR_REGISTRY/crackosaurus/cluster:latest",
      "",
      "# Register with Cloud Map",
      "INSTANCE_ID=$(ec2-metadata --instance-id | cut -d ' ' -f 2)",
      "PRIVATE_IP=$(ec2-metadata --local-ipv4 | cut -d ' ' -f 2)",
      "SERVICE_ID=$(aws servicediscovery list-services --region $AWS_REGION --query \"Services[?Name=='cluster'].Id\" --output text)",
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
        securityGroup: ec2SecurityGroup,
        role: ec2Role,
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
