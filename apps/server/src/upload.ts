import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { PermissionType, hasPermission } from "@repo/api";

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

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

async function uploadFile(url: string, file: File): Promise<string | null> {
  const formData = new FormData();

  formData.set("file", file);

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  return await res.text();
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

      // Upload to remote and get wordlistID
      const fileBuffer = fs.readFileSync(tempPath); // Only if necessary for remote upload
      const wordlistID = await uploadFile(
        `${url}/upload/wordlist`,
        new File([fileBuffer], checksum, { type: "text/plain" })
      );

      fs.unlinkSync(tempPath); // Clean up

      if (!wordlistID) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return await prisma.$transaction(async (tx) => {
        await tx.wordlist.create({
          data: {
            WID: wordlistID,
            name: fileName,
            size: fileBuffer.length,
            checksum,
          },
        });

        return wordlistID;
      });
    }
  );

  next();
};
