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
