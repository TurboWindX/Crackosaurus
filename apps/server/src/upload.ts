import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { PermissionType, hasPermission } from "@repo/api";

import config from "./config";
import { getInitializedBucketName } from "./plugins/s3Init";
import { createS3Client } from "./utils/s3";

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function checkPermission(permission: PermissionType) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    next: (err?: Error | undefined) => void
  ) => {
    if (!hasPermission(request.session.permissions, permission))
      throw new TRPCError({ code: "UNAUTHORIZED" });

    next();
  };
}

async function uploadRawToCluster(
  url: string,
  stream: Readable,
  size?: number,
  origin?: { bucket?: string; key?: string }
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };
  if (size !== undefined) headers["Content-Length"] = String(size);
  if (origin?.bucket) headers["x-origin-s3-bucket"] = origin.bucket;
  if (origin?.key) headers["x-origin-s3-key"] = origin.key;

  console.log("[uploadRawToCluster] starting request", {
    url,
    size,
    sizeGB: size ? (size / (1024 * 1024 * 1024)).toFixed(2) : "unknown",
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      // send Node.js Readable stream directly
      body: stream as unknown as BodyInit,
      // Add timeout for large file uploads (60 minutes - within ALB limit)
      signal: AbortSignal.timeout(60 * 60 * 1000),
      // undici/Node fetch requires duplex when streaming a request body
      duplex: "half",
    } as RequestInit & { duplex: string });

    console.log("[uploadRawToCluster] response received", {
      status: res.status,
      statusText: res.statusText,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[uploadRawToCluster] failed", {
        status: res.status,
        statusText: res.statusText,
        body: text,
      });
      throw new Error(
        `Cluster upload failed: ${res.status} ${res.statusText} ${text}`
      );
    }

    const result = await res.text();
    console.log("[uploadRawToCluster] success", { result });
    return result;
  } catch (error) {
    console.error("[uploadRawToCluster] exception caught", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      code:
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined,
      type: typeof error,
    });
    throw error;
  }
}

export const upload: FastifyPluginCallback<{ url: string }> = (
  instance,
  { url },
  next
) => {
  instance.post(
    "/wordlist",
    {
      preHandler: checkPermission("wordlists:add"),
    },
    async (request: FastifyRequest) => {
      const { prisma } = request.server;

      if (!request.isMultipart()) throw new TRPCError({ code: "BAD_REQUEST" });

      const multipart = await request.file();
      if (multipart === undefined) throw new TRPCError({ code: "BAD_REQUEST" });

      const fileName = path.basename(multipart.filename);
      const tempPath = path.join("/tmp", `upload-${Date.now()}-${fileName}`);

      // Stream file to disk
      await pipeline(multipart.file, fs.createWriteStream(tempPath));

      // Compute checksum from file stream (optional: stream again, or use hashing stream during first write)
      const hash = crypto.createHash("sha256");
      const fileStream = fs.createReadStream(tempPath);
      for await (const chunk of fileStream) {
        hash.update(chunk);
      }
      const checksum = hash.digest("hex");

      // Check for duplicate
      if (
        await prisma.wordlist.findFirst({
          select: { WID: true },
          where: { checksum },
        })
      ) {
        fs.unlinkSync(tempPath);
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const readStream = fs.createReadStream(tempPath);
      const stat = fs.statSync(tempPath);
      const wordlistID = await uploadRawToCluster(
        `${url}/upload/wordlist/raw`,
        readStream,
        stat.size
      );

      fs.unlinkSync(tempPath); // Clean up

      if (!wordlistID) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        await tx.wordlist.create({
          data: {
            WID: wordlistID,
            name: fileName,
            size: BigInt(stat.size),
            checksum,
          },
        });

        return wordlistID;
      });
    }
  );

  // Handler for confirming S3 upload completion and triggering   cluster processing
  const completeHandler = async (request: FastifyRequest) => {
    const { prisma } = request.server;
    const { wordlistId, s3Key } = request.body as {
      wordlistId: string;
      s3Key: string;
    };

    if (!wordlistId || !s3Key) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }

    // Get bucket name (initialized at server startup)
    const bucketName = getInitializedBucketName();

    // Create S3 client
    const s3Client = createS3Client(config);

    try {
      console.log("[upload.complete] start", { bucketName, s3Key, wordlistId });

      // Step 1: Download from S3
      console.log("[upload.complete] downloading from S3...");
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const response = await s3Client.send(getCommand);

      if (!response.Body) {
        console.error("[upload.complete] empty body from S3", {
          bucketName,
          s3Key,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      // Extract checksum from S3 object metadata (set during upload request)
      const checksum =
        (response.Metadata?.checksum as string | undefined) ?? "";

      // Check file size and decide approach
      const contentLength = response.ContentLength || 0;
      const fileSizeGB = contentLength / (1024 * 1024 * 1024);
      const isLargeFile = fileSizeGB > 2; // Files over 2GB use direct S3 approach

      console.log("[upload.complete] file analysis", {
        fileSize: contentLength,
        fileSizeGB: fileSizeGB.toFixed(2),
        isLargeFile,
        approach: isLargeFile ? "direct-s3" : "streaming",
      });

      let wordlistID: string;
      // Create DB entry only after we have the final ID (post-processing)

      if (isLargeFile) {
        // For large files, create the DB record immediately using the
        // temporary upload ID so we can respond quickly to the client and
        // avoid request timeouts (504). Then trigger the S3->EFS copy in the
        // background, asking the cluster to write the file using the same
        // target ID so DB and EFS stay consistent.
        console.log(
          "[upload.complete] large file - creating DB record and scheduling S3->EFS copy"
        );

        wordlistID = wordlistId;

        await prisma.$transaction(async (tx: PrismaTransaction) => {
          await tx.wordlist.create({
            data: {
              WID: wordlistID,
              name: s3Key.split("/").pop() ?? wordlistID,
              size: BigInt(contentLength),
              checksum,
            },
          });
        });

        // Fire-and-forget the copy request so the HTTP client isn't blocked.
        (async () => {
          try {
            const copyResponse = await fetch(
              `${url}/upload/wordlist/copy-from-s3`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  bucket: bucketName,
                  key: s3Key,
                  targetID: wordlistID,
                }),
              }
            );

            if (!copyResponse.ok) {
              console.error(
                "[upload.complete] background S3 copy failed",
                await copyResponse.text()
              );
            } else {
              console.log("[upload.complete] background S3 copy triggered");
            }
          } catch (err) {
            console.error(
              "[upload.complete] error triggering background S3 copy",
              err
            );
          }
        })();

        // Respond now; the copy will continue asynchronously
        return { wordlistID };
      } else {
        // For smaller files, use streaming approach
        console.log("[upload.complete] streaming to cluster for small file");
        const nodeStream = response.Body as Readable;

        wordlistID = await uploadRawToCluster(
          `${url}/upload/wordlist/raw`,
          nodeStream,
          contentLength
        );

        // Create the wordlist record only now that we have a final ID
        await prisma.$transaction(async (tx: PrismaTransaction) => {
          await tx.wordlist.create({
            data: {
              WID: wordlistID,
              name: s3Key.split("/").pop() ?? wordlistID,
              size: BigInt(contentLength),
              checksum,
            },
          });
        });

        // We no longer delete the S3 object here. The cluster (consumer)
        // will delete the original S3 object after it confirms the file was
        // written to EFS successfully. To enable that, include origin
        // headers when streaming the object to the cluster below.
      }

      console.log("[upload.complete] processing complete", {
        wordlistID,
        approach: isLargeFile ? "direct-s3" : "streaming",
      });

      if (!wordlistID) {
        console.error("[upload.complete] no wordlist ID generated", {
          wordlistId,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      console.debug("[upload.complete] success", {
        original: wordlistId,
        final: wordlistID,
      });
      return { wordlistID };
    } catch (error) {
      console.error("[upload.complete] error", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
  };

  // Accept both singular and plural path variants for compatibility
  instance.post(
    "/wordlist/complete",
    { preHandler: checkPermission("wordlists:add") },
    completeHandler
  );

  instance.post(
    "/wordlists/complete",
    { preHandler: checkPermission("wordlists:add") },
    completeHandler
  );

  // === Rules upload endpoints (mirror wordlist behavior) ===
  instance.post(
    "/rule",
    {
      preHandler: checkPermission("rules:add"),
    },
    async (request: FastifyRequest) => {
      const { prisma } = request.server;

      if (!request.isMultipart()) throw new TRPCError({ code: "BAD_REQUEST" });

      const multipart = await request.file();
      if (multipart === undefined) throw new TRPCError({ code: "BAD_REQUEST" });

      const fileName = path.basename(multipart.filename);
      const tempPath = path.join("/tmp", `upload-${Date.now()}-${fileName}`);

      // Stream file to disk
      await pipeline(multipart.file, fs.createWriteStream(tempPath));

      // Compute checksum
      const hash = crypto.createHash("sha256");
      const fileStream = fs.createReadStream(tempPath);
      for await (const chunk of fileStream) {
        hash.update(chunk);
      }
      const checksum = hash.digest("hex");

      // Check for duplicate
      if (
        await prisma.rule.findFirst({
          select: { RID: true },
          where: { checksum },
        })
      ) {
        fs.unlinkSync(tempPath);
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const readStream = fs.createReadStream(tempPath);
      const stat = fs.statSync(tempPath);
      const ruleID = await uploadRawToCluster(
        `${url}/upload/rules/raw`,
        readStream,
        stat.size
      );

      fs.unlinkSync(tempPath);

      if (!ruleID) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return await prisma.$transaction(async (tx: PrismaTransaction) => {
        await tx.rule.create({
          data: {
            RID: ruleID,
            name: fileName,
            size: BigInt(stat.size),
            checksum,
          },
        });

        return ruleID;
      });
    }
  );

  // S3-complete handler for rules
  const completeRuleHandler = async (request: FastifyRequest) => {
    const { prisma } = request.server;
    const { ruleId, s3Key } = request.body as {
      ruleId: string;
      s3Key: string;
    };

    if (!ruleId || !s3Key) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }

    const bucketName = getInitializedBucketName();
    const s3Client = createS3Client(config);

    try {
      console.log("[upload.rule.complete] start", {
        bucketName,
        s3Key,
        ruleId,
      });

      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const response = await s3Client.send(getCommand);

      if (!response.Body) {
        console.error("[upload.rule.complete] empty body from S3", {
          bucketName,
          s3Key,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const checksum =
        (response.Metadata?.checksum as string | undefined) ?? "";
      const contentLength = response.ContentLength || 0;
      const fileSizeGB = contentLength / (1024 * 1024 * 1024);
      const isLargeFile = fileSizeGB > 2;

      console.log("[upload.rule.complete] file analysis", {
        fileSize: contentLength,
        fileSizeGB: fileSizeGB.toFixed(2),
        isLargeFile,
        approach: isLargeFile ? "direct-s3" : "streaming",
      });

      let finalRuleID: string;

      if (isLargeFile) {
        finalRuleID = ruleId;
        await prisma.$transaction(async (tx: PrismaTransaction) => {
          await tx.rule.create({
            data: {
              RID: finalRuleID,
              name: s3Key.split("/").pop() ?? finalRuleID,
              size: BigInt(contentLength),
              checksum,
            },
          });
        });

        // Trigger S3 -> EFS copy on cluster side
        try {
          const copyResponse = await fetch(`${url}/upload/rules/copy-from-s3`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: bucketName, key: s3Key }),
          });
          if (!copyResponse.ok) {
            console.error(
              "[upload.rule.complete] failed to trigger S3 copy",
              await copyResponse.text()
            );
          } else {
            const copiedRuleID = await copyResponse.json();
            console.log("[upload.rule.complete] S3 copy completed", {
              copiedRuleID,
            });
          }
        } catch (err) {
          console.error("[upload.rule.complete] error triggering S3 copy", err);
        }
      } else {
        const nodeStream = response.Body as Readable;
        finalRuleID = await uploadRawToCluster(
          `${url}/upload/rules/raw`,
          nodeStream,
          contentLength
        );

        await prisma.$transaction(async (tx: PrismaTransaction) => {
          await tx.rule.create({
            data: {
              RID: finalRuleID,
              name: s3Key.split("/").pop() ?? finalRuleID,
              size: BigInt(contentLength),
              checksum,
            },
          });
        });
      }

      console.log("[upload.rule.complete] processing complete", {
        finalRuleID,
        approach: isLargeFile ? "direct-s3" : "streaming",
      });

      if (!finalRuleID) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return { ruleID: finalRuleID };
    } catch (error) {
      console.error("[upload.rule.complete] error", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
  };

  instance.post(
    "/rule/complete",
    { preHandler: checkPermission("rules:add") },
    completeRuleHandler
  );

  instance.post(
    "/rules/complete",
    { preHandler: checkPermission("rules:add") },
    completeRuleHandler
  );

  next();
};
