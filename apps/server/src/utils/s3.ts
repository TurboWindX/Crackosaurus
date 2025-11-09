import {
  CreateBucketCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import crypto from "crypto";

import type { BackendConfig } from "@repo/app-config/server";

/**
 * Creates an S3 client configured for either production (AWS) or development (LocalStack)
 *
 * In production:
 * - Uses standard AWS S3 endpoints
 * - Credentials come from IAM role (EC2/ECS instance profile)
 * - No need for explicit credentials or custom endpoints
 *
 * In development:
 * - Uses LocalStack endpoint (http://localstack:4566)
 * - Uses test credentials
 * - Uses path-style bucket access (required for LocalStack)
 *
 * @param config - Backend configuration
 * @param options - Additional S3 client options
 * @returns Configured S3Client instance
 */
export function createS3Client(
  config: BackendConfig,
  options?: {
    /** Use public endpoint for presigned URLs (dev only) */
    usePublicEndpoint?: boolean;
  }
): S3Client {
  const isProduction = config.environment === "production";

  const s3Config: S3ClientConfig = {
    region: process.env.AWS_REGION || "ca-central-1",
  };

  if (!isProduction) {
    // Development: Use LocalStack
    const endpoint = options?.usePublicEndpoint
      ? config.s3.publicEndpoint || process.env.AWS_ENDPOINT_URL
      : process.env.AWS_ENDPOINT_URL;

    s3Config.endpoint = endpoint;
    // Only set explicit credentials if both values are provided.
    // Avoid embedding test credentials in source; local dev may set these in a .env file.
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (accessKeyId && secretAccessKey) {
      s3Config.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }
    s3Config.forcePathStyle = true; // Required for LocalStack
  }
  // Production: Use AWS SDK defaults (IAM role credentials from instance metadata)

  return new S3Client(s3Config);
}

/**
 * Extracts the bucket name from an S3 bucket ARN
 * @param bucketArn - S3 bucket ARN (e.g., arn:aws:s3:::my-bucket)
 * @returns Bucket name
 * @throws Error if ARN is invalid
 */
export function getBucketNameFromArn(bucketArn: string): string {
  const bucketName = bucketArn.split(":").pop();
  if (!bucketName) {
    throw new Error(`Invalid S3 bucket ARN: ${bucketArn}`);
  }
  return bucketName;
}

/**
 * Gets the bucket name from config, with fallback to ARN or generation
 * @param config - Backend configuration
 * @returns Bucket name
 */
export function getBucketName(config: BackendConfig): string {
  // Prefer explicit bucket name
  if (config.s3.bucketName) {
    return config.s3.bucketName;
  }

  // Fallback to extracting from ARN (for backward compatibility)
  if (config.s3.bucketArn) {
    return getBucketNameFromArn(config.s3.bucketArn);
  }

  // If neither provided, generate one
  return generateBucketName();
}

/**
 * Generates a unique S3 bucket name with the crackosaurus- prefix
 * @returns Generated bucket name (e.g., crackosaurus-a1b2c3d4)
 */
export function generateBucketName(): string {
  const randomId = crypto.randomBytes(4).toString("hex");
  return `crackosaurus-${randomId}`;
}

/**
 * Ensures an S3 bucket exists, creating it if necessary, and configures CORS
 * @param s3Client - Configured S3 client
 * @param bucketName - Name of the bucket to ensure exists
 * @returns Promise that resolves when bucket is ready
 */
export async function ensureBucketExists(
  s3Client: S3Client,
  bucketName: string
): Promise<void> {
  try {
    // Check if bucket exists
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`[S3] Bucket ${bucketName} already exists`);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error.name === "NotFound" ||
        ("$metadata" in error &&
          error.$metadata &&
          typeof error.$metadata === "object" &&
          "httpStatusCode" in error.$metadata &&
          error.$metadata.httpStatusCode === 404))
    ) {
      // Bucket doesn't exist, create it
      console.log(`[S3] Creating bucket ${bucketName}...`);
      try {
        await s3Client.send(
          new CreateBucketCommand({
            Bucket: bucketName,
          })
        );
        console.log(`[S3] Bucket ${bucketName} created successfully`);
      } catch (createError: unknown) {
        // Handle race condition where bucket was created between check and create
        if (
          createError &&
          typeof createError === "object" &&
          "name" in createError &&
          (createError.name === "BucketAlreadyOwnedByYou" ||
            createError.name === "BucketAlreadyExists")
        ) {
          console.log(
            `[S3] Bucket ${bucketName} already exists (race condition)`
          );
        } else {
          throw createError;
        }
      }
    } else {
      // Some other error occurred
      throw error;
    }
  }

  // Ensure CORS is configured (always check, even for existing buckets)
  try {
    // Check if CORS is already configured
    try {
      await s3Client.send(new GetBucketCorsCommand({ Bucket: bucketName }));
      console.log(`[S3] CORS already configured for bucket ${bucketName}`);
    } catch (corsError: unknown) {
      if (
        corsError &&
        typeof corsError === "object" &&
        "name" in corsError &&
        corsError.name === "NoSuchCORSConfiguration"
      ) {
        // CORS not configured, set it up
        console.log(`[S3] Configuring CORS for bucket ${bucketName}...`);
        await s3Client.send(
          new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ["*"],
                  AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                  AllowedOrigins: ["*"],
                  ExposeHeaders: ["ETag", "x-amz-version-id"],
                  MaxAgeSeconds: 3000,
                },
              ],
            },
          })
        );
        console.log(
          `[S3] CORS configured successfully for bucket ${bucketName}`
        );
      } else {
        // Some other CORS-related error
        console.warn(
          `[S3] Could not check/configure CORS: ${
            corsError && typeof corsError === "object" && "message" in corsError
              ? String(corsError.message)
              : "Unknown error"
          }`
        );
      }
    }
  } catch (corsConfigError: unknown) {
    console.warn(
      `[S3] Failed to configure CORS: ${
        corsConfigError &&
        typeof corsConfigError === "object" &&
        "message" in corsConfigError
          ? String(corsConfigError.message)
          : "Unknown error"
      }`
    );
    // Don't fail the entire operation if CORS configuration fails
  }
}
