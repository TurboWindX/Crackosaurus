import { TRPCError } from "@trpc/server";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { Readable } from "node:stream";

import { Cluster } from "./cluster/cluster";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

export const upload: FastifyPluginCallback<{}> = (instance, _opts, next) => {
  instance.post("/wordlist", {}, async (request: FastifyRequest) => {
    const cluster = (request.server as any).cluster as Cluster<any>;

    if (!request.isMultipart()) throw new TRPCError({ code: "BAD_REQUEST" });

    const multipart = await request.file();
    if (!multipart) throw new TRPCError({ code: "BAD_REQUEST" });

    const buffer = await streamToBuffer(multipart.file);

    return await cluster.createWordlist(buffer);
  });

  next();
};
