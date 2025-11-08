import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudmap from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

export interface CrackosaurusFargateStackProps extends cdk.StackProps {
  environmentName: string;
  imageTag?: string;
  // Optional: reuse an existing VPC and namespace created by another stack
  vpc?: ec2.IVpc;
  namespace?: cloudmap.INamespace;
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
}

export class CrackosaurusFargateStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: CrackosaurusFargateStackProps
  ) {
    super(scope, id, props);

    const { environmentName } = props;
    const imageTag = props.imageTag || environmentName;
    const isProduction = environmentName === "prod";

    // VPC - reuse provided VPC if present
    const vpc =
      props.vpc ??
      new ec2.Vpc(this, "FargateVPC", {
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration: [
          { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
          {
            name: "Private",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 24,
          },
        ],
      });

    // Security groups
    const albSg = new ec2.SecurityGroup(this, "ALBSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP from internet"
    );

    const svcSg = new ec2.SecurityGroup(this, "ServiceSecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    svcSg.addIngressRule(
      albSg,
      ec2.Port.tcp(8080),
      "Allow ALB to talk to service"
    );

    // ECR repository for cluster
    const clusterRepo = ecr.Repository.fromRepositoryName(
      this,
      "ClusterRepo",
      "crackosaurus/cluster"
    );

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
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    // Create a Fargate service for the cluster API (no public ALB) and register it with Cloud Map
    const clusterTaskDef = new ecs.FargateTaskDefinition(
      this,
      "ClusterTaskDef",
      {
        cpu: 512,
        memoryLimitMiB: 1024,
        executionRole: execRole,
        taskRole,
      }
    );

    const clusterContainer = clusterTaskDef.addContainer("ClusterContainer", {
      image: ecs.ContainerImage.fromEcrRepository(clusterRepo, imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "cluster" }),
      environment: {
        NODE_ENV: "production",
        CLUSTER_HOST: "0.0.0.0",
        CLUSTER_PORT: String(13337),
        CLUSTER_DISCOVERY_TYPE: "cloud_map",
        CLUSTER_DISCOVERY_NAMESPACE: `${environmentName}.crackosaurus.local`,
        CLUSTER_DISCOVERY_SERVICE: "cluster",
        CLUSTER_DISCOVERY_REGION: this.region,
      },
    });

    clusterContainer.addPortMappings({ containerPort: 13337 });

    const clusterService = new ecs.FargateService(
      this,
      "ClusterFargateService",
      {
        cluster,
        taskDefinition: clusterTaskDef,
        desiredCount: isProduction ? 2 : 1,
        assignPublicIp: false,
        securityGroups: [svcSg],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        cloudMapOptions: props.namespace
          ? { name: "cluster", cloudMapNamespace: props.namespace }
          : { name: "cluster" },
      }
    );

    // Allow ECR pull for cluster tasks (execRole is used by the task execution role)
    // Note: using fromRepositoryName above doesn't require creating the repo here

    new cdk.CfnOutput(this, "ClusterServiceName", {
      value: clusterService.serviceName,
    });
  }
}
