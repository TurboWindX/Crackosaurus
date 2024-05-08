import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";

import { HTTPMethod, Route, RouteRequest, RouteResponse } from "@repo/api";
import { ROUTES } from "@repo/api/cluster";
import { APIError, errorHandler } from "@repo/plugins/error";

import { type Cluster } from "../cluster/cluster";

declare module "fastify" {
  interface FastifyInstance {
    cluster: Cluster<any>;
  }
}

function validate(validator: { parse?: (data: any) => any }) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    next: (err?: Error | undefined) => void
  ) => {
    try {
      if (validator.parse) validator.parse(request.body ?? {});
    } catch (e) {
      throw new APIError("Invalid input");
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
    const { hashType, hashes } = request.body;

    return request.server.cluster.createJob(
      instanceID,
      hashType as any,
      hashes
    );
  },
  deleteJob: async (request) => {
    const { instanceID, jobID } = request.params;

    return request.server.cluster.deleteJob(instanceID, jobID);
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
        preValidation: [validate(route.request)],
      },
      async (request: any) => ({ response: await router(request) })
    );
  }

  next();
};

export default api;
