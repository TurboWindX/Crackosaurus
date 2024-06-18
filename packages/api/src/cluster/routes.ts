import { z } from "zod";

import { HASH_TYPES } from "@repo/hashcat/data";

import { APIHandler, Route } from "../routing";
import { STATUSES } from "../types";

export const ROUTES = {
  ping: {
    method: "GET",
    path: "/ping",
    type: "json",
    permissions: [],
    request: z.object({}).optional(),
    response: z.string(),
  },
  status: {
    method: "GET",
    path: "/status",
    type: "json",
    permissions: [],
    request: z.object({}).optional(),
    response: z.object({
      instances: z.record(
        z.string(),
        z.object({
          status: z.enum(STATUSES),
          jobs: z.record(
            z.string(),
            z.object({
              status: z.enum(STATUSES),
              hashes: z.record(z.string(), z.string()),
            })
          ),
        })
      ),
    }),
  },
  createInstance: {
    method: "POST",
    path: "/instances",
    type: "json",
    permissions: [],
    request: z.object({
      instanceType: z.string().nullable().optional(),
    }),
    response: z.string().nullable(),
  },
  deleteInstance: {
    method: "DELETE",
    path: "/instances/:instanceID",
    type: "json",
    permissions: [],
    request: z.object({}).optional(),
    response: z.boolean(),
  },
  createJob: {
    method: "POST",
    path: "/instances/:instanceID/jobs",
    type: "json",
    permissions: [],
    request: z.object({
      wordlist: z.string(),
      hashType: z.enum(HASH_TYPES),
      hashes: z.string().array(),
    }),
    response: z.string().nullable(),
  },
  deleteJob: {
    method: "DELETE",
    path: "/instances/:instanceID/jobs/:jobID",
    type: "json",
    permissions: [],
    request: z.object({}).optional(),
    response: z.boolean(),
  },
  createWordlist: {
    method: "POST",
    path: "/wordlists",
    type: "multipart",
    permissions: [],
    request: z.object({
      data: z.string(),
    }),
    response: z.string().nullable(),
  },
  deleteWordlist: {
    method: "DELETE",
    path: "/wordlists/:wordlistID",
    type: "json",
    permissions: [],
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
