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

export const wordlistRouter = t.router({
  get: permissionProcedure(["wordlists:get"])
    .input(
      z.object({
        wordlistID: z.string(),
      })
    )
    .output(
      z.object({
        WID: z.string(),
        name: z.string().nullable(),
        size: z.number().int().min(0),
        checksum: z.string(),
        updatedAt: z.date(),
      })
    )
    .query(async (opts) => {
      const { wordlistID } = opts.input;

      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const row = await tx.wordlist.findUniqueOrThrow({
          select: {
            WID: true,
            name: true,
            size: true,
            checksum: true,
            updatedAt: true,
          },
          where: {
            WID: wordlistID,
          },
        });

        return {
          ...row,
          size: Number(row.size as unknown as bigint),
        };
      });
    }),
  getMany: permissionProcedure(["wordlists:get"])
    .output(
      z
        .object({
          WID: z.string(),
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
        const rows = await tx.wordlist.findMany({
          select: {
            WID: true,
            name: true,
            size: true,
            checksum: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return rows.map((row: any) => ({
          WID: row.WID,
          name: row.name || "Unnamed",
          size: Number(row.size),
          checksum: row.checksum,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      });
    }),
  getList: permissionProcedure(["wordlists:get"])
    .output(
      z
        .object({
          WID: z.string(),
          name: z.string().nullable(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        return tx.wordlist.findMany({
          select: {
            WID: true,
            name: true,
          },
        });
      });
    }),
  // create: permissionProcedure(["wordlists:add"]).mutation(async (opts) => {
  //   const { prisma, cluster } = opts.ctx;

  //   if (multipart === undefined) throw new APIError("input");

  //   const buffer = await streamToBuffer(multipart.file);
  //   const size = buffer.length;
  //   const checksum = crypto.createHash("md5").update(buffer).digest("hex");

  //   const wordlistID = await cluster.createWordlist(buffer);
  //   if (wordlistID === null) throw new APIError("internal");

  //   return prisma.$transaction(async (tx) => {
  //     const fileName = path.basename(multipart.filename);

  //     await tx.wordlist.create({
  //       data: {
  //         WID: wordlistID,
  //         name: fileName,
  //         size,
  //         checksum,
  //       },
  //     });

  //     return wordlistID;
  //   });
  // }),
  deleteMany: permissionProcedure(["wordlists:remove"])
    .input(
      z.object({
        wordlistIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { wordlistIDs } = opts.input;

      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        const result = await cluster.wordlist.deleteMany.mutate({
          wordlistIDs,
        });

        const deletedIDs = wordlistIDs.filter((_, index) => result[index]);

        const { count } = await tx.wordlist.deleteMany({
          where: {
            WID: {
              in: deletedIDs,
            },
          },
        });

        return count;
      });
    }),
  getUploadUrl: permissionProcedure(["wordlists:add"])
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
        wordlistId: z.string(),
        isMultipart: z.boolean(),
      })
    )
    .mutation(async (opts) => {
      const { fileName, fileSize, checksum } = opts.input;
      const { prisma } = opts.ctx;

      // Get bucket name (initialized at server startup)
      const bucketName = getInitializedBucketName();

      // Generate unique S3 key
      const wordlistId = `wl_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const s3Key = `uploads/${wordlistId}/${fileName}`;

      // Check for duplicate checksum
      const existingWordlist = await prisma.wordlist.findFirst({
        where: { checksum },
        select: { WID: true },
      });

      if (existingWordlist) {
        throw new Error("File with this checksum already exists");
      }

      // Create S3 clients for internal operations and presigned URLs
      const s3Client = createS3Client(config);
      const s3ClientForPresign = createS3Client(config, {
        usePublicEndpoint: true,
      });

      // Note: Do not create a DB record here. We will only create it after
      // the upload is completed successfully in the server complete handler.

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
          wordlistId,
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
          wordlistId,
          isMultipart: false,
        };
      }
    }),
  completeMultipartUpload: permissionProcedure(["wordlists:add"])
    .input(
      z.object({
        uploadId: z.string(),
        s3Key: z.string(),
        wordlistId: z.string(),
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

export type WordlistRouter = typeof wordlistRouter;
