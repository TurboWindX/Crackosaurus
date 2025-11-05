import { TRPCError } from "@trpc/server";
import { FastifyPluginCallback, FastifyRequest } from "fastify";
import { Readable } from "stream";

import { Cluster } from "./cluster/cluster";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

export const upload: FastifyPluginCallback = (instance, _opts, next) => {
  instance.post("/wordlist", {}, async (request: FastifyRequest) => {
    const cluster = (
      request.server as unknown as Record<string, Cluster<unknown>>
    ).cluster!;

    if (!request.isMultipart()) throw new TRPCError({ code: "BAD_REQUEST" });

    const multipart = await request.file();
    if (!multipart) throw new TRPCError({ code: "BAD_REQUEST" });

    const buffer = await streamToBuffer(multipart.file);

    return await cluster.createWordlist(buffer);
  });

  // Raw octet-stream alternative to avoid multipart limits for very large files
  instance.post("/wordlist/raw", {}, async (request: FastifyRequest) => {
    const cluster = (
      request.server as unknown as Record<string, Cluster<unknown>>
    ).cluster!;

    // request.body is a Readable stream thanks to the content type parser
    const raw = request.body as unknown as Readable;

    // Read optional origin headers set by the server when streaming from S3
    const originBucket = (request.headers["x-origin-s3-bucket"] as string) || undefined;
    const originKey = (request.headers["x-origin-s3-key"] as string) || undefined;

    return await cluster.createWordlistFromStream(raw, {
      originBucket,
      originKey,
    });
  });

  next();
};
