import { TRPCError } from "@trpc/server";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";

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
    const chunks: any[] = [];

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

      const buffer = await streamToBuffer(multipart.file);
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

      if (
        await prisma.wordlist.findFirst({
          select: {
            WID: true,
          },
          where: {
            checksum,
          },
        })
      )
        throw new TRPCError({ code: "BAD_REQUEST" });

      const fileName = path.basename(multipart.filename);
      const size = buffer.length;

      const wordlistID = await uploadFile(
        `${url}/upload/wordlist`,
        new File([buffer], checksum, { type: "text/plain" })
      );
      if (!wordlistID) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return await prisma.$transaction(async (tx) => {
        await tx.wordlist.create({
          data: {
            WID: wordlistID,
            name: fileName,
            size,
            checksum,
          },
        });

        return wordlistID;
      });
    }
  );

  next();
};
