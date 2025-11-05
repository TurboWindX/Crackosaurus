import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import config from "../config";
import {
  createS3Client,
  ensureBucketExists,
  generateBucketName,
  getBucketName,
} from "../utils/s3";

/**
 * Global bucket name storage
 * Once initialized, this will hold the actual bucket name being used
 */
let globalBucketName: string | null = null;

/**
 * Gets the initialized bucket name
 * @returns The bucket name
 * @throws Error if bucket hasn't been initialized yet
 */
export function getInitializedBucketName(): string {
  if (!globalBucketName) {
    throw new Error(
      "S3 bucket not initialized. Ensure server has started properly."
    );
  }
  return globalBucketName;
}

/**
 * Fastify plugin that initializes S3 storage on server startup
 * - Gets or generates bucket name
 * - Creates bucket if it doesn't exist
 * - Stores bucket name globally for use by other parts of the app
 */
async function s3InitPlugin(fastify: FastifyInstance) {
  fastify.log.info("[S3 Init] Initializing S3 storage...");

  try {
    // Get or generate bucket name
    let bucketName: string;

    if (config.s3.bucketName) {
      bucketName = config.s3.bucketName;
      fastify.log.info(`[S3 Init] Using configured bucket: ${bucketName}`);
    } else if (config.s3.bucketArn) {
      bucketName = getBucketName(config);
      fastify.log.info(`[S3 Init] Using bucket from ARN: ${bucketName}`);
    } else {
      // In production we require an explicit pre-provisioned bucket to avoid
      // granting the runtime permission to create buckets. This prevents
      // accidental resource creation and AccessDenied runtime errors.
      if (config.environment === "production") {
        const msg =
          "No S3 bucket configured for production. Please pre-create a bucket and set S3_BUCKET_NAME (or S3_BUCKET_ARN). Example: aws s3 mb s3://crackosaurus-wordlists --region <region>";
        fastify.log.error(`[S3 Init] ${msg}`);
        throw new Error(msg);
      }

      // Non-production (dev/test): generate a bucket name and create it
      bucketName = generateBucketName();
      fastify.log.info(`[S3 Init] Generated new bucket name: ${bucketName}`);
    }

    // Create S3 client
    const s3Client = createS3Client(config);

    // Ensure bucket exists
    await ensureBucketExists(s3Client, bucketName);

    // Store globally
    globalBucketName = bucketName;

    fastify.log.info(
      `[S3 Init] S3 storage initialized with bucket: ${bucketName}`
    );
  } catch (error) {
    fastify.log.error("[S3 Init] Failed to initialize S3 storage:", error);
    throw error;
  }
}

export default fp(s3InitPlugin, {
  name: "s3-init",
});
