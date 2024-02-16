import { z } from "zod";

import { APIHandler, Route } from "../routing";
import { HASH_TYPES } from "../types";

export const ROUTES = {
  ping: {
    method: "GET",
    path: "/ping",
    request: z.object({}).optional(),
    response: z.string(),
  },
  status: {
    method: "GET",
    path: "/status",
    request: z.object({}).optional(),
    response: z.object({
      instances: z.record(
        z.string(),
        z.object({
          status: z.string(),
          jobs: z.record(
            z.string(),
            z.object({
              status: z.string(),
              hashes: z.record(
                z.string(),
                z.object({
                  status: z.string(),
                  value: z.string().optional(),
                })
              ),
            })
          ),
        })
      ),
    }),
  },
  createInstance: {
    method: "POST",
    path: "/instances",
    request: z.object({
      instanceType: z.string().nullable().optional(),
    }),
    response: z.string().nullable(),
  },
  deleteInstance: {
    method: "DELETE",
    path: "/instances/:instanceID",
    request: z.object({}).optional(),
    response: z.boolean(),
  },
  createJob: {
    method: "POST",
    path: "/instances/:instanceID/jobs",
    request: z.object({
      hashType: z.enum(HASH_TYPES),
      hashes: z.string().array(),
    }),
    response: z.string().nullable(),
  },
  deleteJob: {
    method: "DELETE",
    path: "/instances/:instanceID/jobs/:jobID",
    request: z.object({}).optional(),
    response: z.boolean(),
  },
} as const satisfies Record<
  string,
  Route<string, z.ZodType<any, any, any>, z.ZodType<any, any, any>>
>;

export type APIType = {
  [TKey in keyof typeof ROUTES]: APIHandler<(typeof ROUTES)[TKey]>;
};
