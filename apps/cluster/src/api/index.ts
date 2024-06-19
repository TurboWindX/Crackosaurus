import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { type Readable } from "node:stream";

import { HTTPMethod, Route, RouteRequest, RouteResponse } from "@repo/api";
import { ROUTES } from "@repo/api/cluster";
import { APIError, errorHandler } from "@repo/plugins/error";

import { type Cluster } from "../cluster/cluster";

declare module "fastify" {
  interface FastifyInstance {
    cluster: Cluster<any>;
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

function validate(
  validator: { parse?: (data: any) => any },
  type: "json" | "multipart"
) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    next: (err?: Error | undefined) => void
  ) => {
    if (type === "json") {
      if (request.isMultipart())
        throw new APIError("Only supports application/json");

      try {
        if (validator.parse) validator.parse(request.body ?? {});
      } catch (e) {
        throw new APIError("Invalid input");
      }
    } else if (type === "multipart") {
      if (!request.isMultipart())
        throw new APIError("Only supports multipart/form-data");

      // TODO: Validate body.
    }

    next();
  };
}

type RouteHandler<TRoute> =
  TRoute extends Route<infer TPath, infer TReq, infer TRes>
    ? (
        request: FastifyRequest<RouteRequest<TRoute>>
      ) => Promise<RouteResponse<TRoute>["response"]>
    : never;

const ROUTER: {
  [key in keyof typeof ROUTES]: RouteHandler<(typeof ROUTES)[key]>;
} = {
  ping: async () => "pong",
  status: async (request) => request.server.cluster.getStatus(),
  createInstance: async (request) => {
    const { instanceType } = request.body;

    return request.server.cluster.createInstance(instanceType);
  },
  deleteInstance: async (request) => {
    const { instanceID } = request.params;

    return request.server.cluster.deleteInstance(instanceID);
  },
  createJob: async (request) => {
    const { instanceID } = request.params;
    const { wordlist, hashType, hashes } = request.body;

    return request.server.cluster.createJob(
      instanceID,
      wordlist,
      hashType,
      hashes
    );
  },
  deleteJob: async (request) => {
    const { instanceID, jobID } = request.params;

    return request.server.cluster.deleteJob(instanceID, jobID);
  },
  createWordlist: async (request) => {
    const multipart = await request.file();
    if (multipart === undefined) throw new APIError("Unable to read file");

    const buffer = await streamToBuffer(multipart.file);

    return request.server.cluster.createWordlist(buffer);
  },
  deleteWordlist: async (request) => {
    const { wordlistID } = request.params;

    return request.server.cluster.deleteWordlist(wordlistID);
  },
};

const api: FastifyPluginCallback = (instance, _options, next) => {
  instance.setErrorHandler(errorHandler);

  for (const [key, route] of Object.entries(ROUTES)) {
    const method = route.method.toLowerCase() as Lowercase<HTTPMethod>;
    const router = ROUTER[key as keyof typeof ROUTES];

    instance[method](
      route.path,
      {
        preValidation: [validate(route.request, route.type)],
      },
      async (request: any) => ({ response: await router(request) })
    );
  }

  next();
};

export default api;
