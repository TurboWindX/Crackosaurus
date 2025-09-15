import { Duration } from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
} from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface S3StackConfig {
  removalPolicy?: RemovalPolicy;
}

export interface S3StackProps extends S3StackConfig {
  prefix?: string;
}

export class S3Stack extends Construct {
  public readonly uploadsBucket: Bucket;
  public readonly uploadsBucketArn: string;

  public static readonly NAME = "s3";

  constructor(scope: Construct, props: S3StackProps) {
    const id = `${S3Stack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) => (prefix !== undefined ? `${prefix}-${v}` : v);

    // Create uploads bucket
    this.uploadsBucket = new Bucket(this, "uploads-bucket", {
      bucketName: tag("crackosaurus-uploads"),
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [HttpMethods.PUT, HttpMethods.POST, HttpMethods.GET],
          allowedOrigins: ["*"],
          exposedHeaders: ["ETag", "x-amz-version-id"],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          // Clean up incomplete multipart uploads after 1 day
          abortIncompleteMultipartUploadAfter: Duration.days(1),
          // Delete files after 30 days (adjust as needed)
          expiration: Duration.days(30),
        },
      ],
    });

    // Note: Bucket contents must be emptied before destroy. We'll handle purge in tooling.

    this.uploadsBucketArn = this.uploadsBucket.bucketArn;

    // Create IAM role for server to generate presigned URLs
    const s3PresignedUrlRole = new Role(this, "s3-presigned-role", {
      roleName: tag("s3-presigned-role"),
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // Allow the role to put objects and get objects from the uploads bucket
    s3PresignedUrlRole.addToPolicy(
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
        resources: [
          this.uploadsBucket.bucketArn,
          `${this.uploadsBucket.bucketArn}/*`,
        ],
      })
    );

    // Store the role ARN as a construct property for use by other stacks
    this.s3PresignedUrlRoleArn = s3PresignedUrlRole.roleArn;
  }

  public readonly s3PresignedUrlRoleArn: string;
}
