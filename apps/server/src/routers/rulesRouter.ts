import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import config from "../config";
import { getInitializedBucketName } from "../plugins/s3Init";
import { permissionProcedure, t } from "../plugins/trpc";
import { createS3Client } from "../utils/s3";

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export const rulesRouter = t.router({
  get: permissionProcedure(["wordlists:get"]) // reuse same permission
    .input(
      z.object({
        ruleID: z.string(),
      })
    )
    .output(
      z.object({
        RID: z.string(),
        name: z.string().nullable(),
        size: z.number().int().min(0),
        checksum: z.string(),
        updatedAt: z.date(),
      })
    )
    .query(async (opts) => {
      const { ruleID } = opts.input;

      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const row = await tx.rule.findUniqueOrThrow({
          select: {
            RID: true,
            name: true,
            size: true,
            checksum: true,
            updatedAt: true,
          },
          where: {
            RID: ruleID,
          },
        });

        return {
          ...row,
          size: Number(row.size as unknown as bigint),
        };
      });
    }),
  getMany: permissionProcedure(["wordlists:get"]) // reuse same permission
    .output(
      z
        .object({
          RID: z.string(),
          name: z.string().nullable(),
          size: z.number().int().min(0),
          checksum: z.string(),
          updatedAt: z.date(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const rows = await tx.rule.findMany({
          select: {
            RID: true,
            name: true,
            size: true,
            checksum: true,
            updatedAt: true,
          },
        });

        return rows.map((row: any) => ({
          ...row,
          size: Number(row.size as unknown as bigint),
        }));
      });
    }),
  getList: permissionProcedure(["wordlists:get"]) // reuse same permission
    .output(
      z
        .object({
          RID: z.string(),
          name: z.string().nullable(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        return tx.rule.findMany({
          select: {
            RID: true,
            name: true,
          },
        });
      });
    }),
  deleteMany: permissionProcedure(["wordlists:remove"]) // reuse same permission
    .input(
      z.object({
        ruleIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { ruleIDs } = opts.input;

      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const result = await cluster.wordlist.deleteMany.mutate({
          wordlistIDs: ruleIDs,
        });

        const deletedIDs = ruleIDs.filter((_, index) => result[index]);

        const { count } = await tx.rule.deleteMany({
          where: {
            RID: {
              in: deletedIDs,
            },
          },
        });

        return count;
      });
    }),
  getUploadUrl: permissionProcedure(["wordlists:add"]) // reuse same permission
    .input(
      z.object({
        fileName: z.string(),
        fileSize: z.number().int().min(0),
        checksum: z.string(),
      })
    )
    .output(
      z.object({
        uploadUrl: z.string().optional(),
        uploadId: z.string().optional(),
        partUrls: z
          .array(z.object({ partNumber: z.number(), url: z.string() }))
          .optional(),
        s3Key: z.string(),
        ruleId: z.string(),
        isMultipart: z.boolean(),
      })
    )
    .mutation(async (opts) => {
      const { fileName, fileSize, checksum } = opts.input;
      const { prisma } = opts.ctx;

      // Get bucket name (initialized at server startup)
      const bucketName = getInitializedBucketName();

      // Generate unique S3 key
      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const s3Key = `uploads/${ruleId}/${fileName}`;

      // Check for duplicate checksum
      const existingRule = await prisma.rule.findFirst({
        where: { checksum },
        select: { RID: true },
      });

      if (existingRule) {
        throw new Error("File with this checksum already exists");
      }

      // Create S3 clients for internal operations and presigned URLs
      const s3Client = createS3Client(config);
      const s3ClientForPresign = createS3Client(config, {
        usePublicEndpoint: true,
      });

      // Use multipart upload for files larger than 5GB
      const useMultipart = fileSize > 5 * 1024 * 1024 * 1024; // 5GB

      if (useMultipart) {
        // Create multipart upload
        const createCommand = new CreateMultipartUploadCommand({
          Bucket: bucketName,
          Key: s3Key,
          ContentType: "application/octet-stream",
          Metadata: {
            checksum,
            originalName: fileName,
            size: fileSize.toString(),
          },
        });

        const multipartUpload = await s3Client.send(createCommand);
        const uploadId = multipartUpload.UploadId!;

        // Calculate number of parts (each part 100MB, minimum 5MB required by S3)
        const partSize = 100 * 1024 * 1024; // 100MB per part
        const numParts = Math.ceil(fileSize / partSize);

        // Generate presigned URLs for each part
        const partUrls = [];
        for (let partNumber = 1; partNumber <= numParts; partNumber++) {
          const uploadPartCommand = new UploadPartCommand({
            Bucket: bucketName,
            Key: s3Key,
            PartNumber: partNumber,
            UploadId: uploadId,
          });

          const partUrl = await getSignedUrl(
            s3ClientForPresign,
            uploadPartCommand,
            {
              expiresIn: 3600, // 1 hour
            }
          );

          partUrls.push({ partNumber, url: partUrl });
        }

        return {
          uploadId,
          partUrls,
          s3Key,
          ruleId,
          isMultipart: true,
        };
      } else {
        // Use single-part upload for smaller files
        const putCommand = new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          ContentType: "application/octet-stream",
          Metadata: {
            checksum,
            originalName: fileName,
            size: fileSize.toString(),
          },
        });

        // Generate presigned URL (expires in 1 hour)
        const uploadUrl = await getSignedUrl(s3ClientForPresign, putCommand, {
          expiresIn: 3600,
        });

        return {
          uploadUrl,
          s3Key,
          ruleId,
          isMultipart: false,
        };
      }
    }),
  completeMultipartUpload: permissionProcedure(["wordlists:add"]) // reuse same permission
    .input(
      z.object({
        uploadId: z.string(),
        s3Key: z.string(),
        ruleId: z.string(),
        parts: z.array(
          z.object({
            partNumber: z.number(),
            etag: z.string(),
          })
        ),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async (opts) => {
      const { uploadId, s3Key, parts } = opts.input;

      // Get bucket name (initialized at server startup)
      const bucketName = getInitializedBucketName();

      // Create S3 client
      const s3Client = createS3Client(config);

      try {
        // Complete the multipart upload
        const completeCommand = new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: s3Key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map(({ partNumber, etag }) => ({
              PartNumber: partNumber,
              ETag: etag,
            })),
          },
        });

        await s3Client.send(completeCommand);

        return { success: true };
      } catch (error) {
        console.error("Failed to complete multipart upload:", error);
        throw new Error("Failed to complete multipart upload");
      }
    }),
});

export type RulesRouter = typeof rulesRouter;
