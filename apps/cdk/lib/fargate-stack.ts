import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export interface CrackosaurusFargateStackProps extends cdk.StackProps {
  environmentName: string;
  imageTag?: string;
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
}

export class CrackosaurusFargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrackosaurusFargateStackProps) {
    super(scope, id, props);

    const { environmentName } = props;
    const imageTag = props.imageTag || environmentName;
    const isProduction = environmentName === "prod";

    // VPC
    const vpc = new ec2.Vpc(this, "FargateVPC", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "Private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // Security groups
    const albSg = new ec2.SecurityGroup(this, "ALBSecurityGroup", { vpc, allowAllOutbound: true });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP from internet");

    const svcSg = new ec2.SecurityGroup(this, "ServiceSecurityGroup", { vpc, allowAllOutbound: true });
    svcSg.addIngressRule(albSg, ec2.Port.tcp(8080), "Allow ALB to talk to service");

    // ECR repository for server (create if not exists)
    const serverRepo = new ecr.Repository(this, "ServerRepo", {
      repositoryName: "crackosaurus/server",
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ECS cluster
    const cluster = new ecs.Cluster(this, "FargateCluster", {
      vpc,
      clusterName: `crackosaurus-${environmentName}`,
    });

    // Task role and execution role
    const taskRole = new iam.Role(this, "ServerTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    const execRole = new iam.Role(this, "ServerExecRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });

    // Fargate service with ALB
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "FargateService", {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: isProduction ? 2 : 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(serverRepo, imageTag),
        containerPort: 8080,
        executionRole: execRole,
        taskRole,
      },
      publicLoadBalancer: true,
      securityGroups: [svcSg, albSg],
      listenerPort: 80,
      domainName: props.domainName,
    });

    // Health check path
    fargateService.targetGroup.configureHealthCheck({ path: "/api/health", interval: cdk.Duration.seconds(30) });

    // Allow pull from ECR for tasks
    serverRepo.grantPull(execRole);

    // Output ALB DNS
    new cdk.CfnOutput(this, "ALBDns", { value: fargateService.loadBalancer.loadBalancerDnsName });
  }
}
