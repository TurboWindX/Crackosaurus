import { z } from "zod";

import { HASH_TYPES } from "@repo/hashcat/data";

import { PERMISSIONS } from "../auth";
import { APIHandler, Route } from "../routing";

export const PROJECT_JOB = z.object({
  JID: z.string(),
  status: z.string(),
  updatedAt: z.date(),
  instance: z.object({
    IID: z.string(),
    name: z.string().nullable(),
  }),
});
export type ProjectJob = z.infer<typeof PROJECT_JOB>;

export const ROUTES = {
  ping: {
    method: "GET",
    path: "/ping",
    permissions: [],
    request: z.object({}).optional(),
    response: z.string(),
  },
  init: {
    method: "POST",
    path: "/init",
    permissions: [],
    request: z.object({
      username: z.string(),
      password: z.string(),
    }),
    response: z.string(),
  },
  getUser: {
    method: "GET",
    path: "/users/:userID",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z.object({
      ID: z.string(),
      username: z.string(),
      permissions: z.string(),
      projects: z
        .object({
          PID: z.string(),
          name: z.string(),
        })
        .array()
        .nullable(),
    }),
  },
  getUsers: {
    method: "GET",
    path: "/users",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z
      .object({
        ID: z.string(),
        username: z.string(),
        permissions: z.string(),
      })
      .array(),
  },
  getUserList: {
    method: "GET",
    path: "/users/list",
    permissions: ["users:list"],
    request: z.object({}).optional(),
    response: z
      .object({
        ID: z.string(),
        username: z.string(),
      })
      .array(),
  },
  login: {
    method: "POST",
    path: "/auth/login",
    permissions: [],
    request: z.object({
      username: z.string(),
      password: z.string(),
    }),
    response: z.string(),
  },
  logout: {
    method: "POST",
    path: "/auth/logout",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  register: {
    method: "POST",
    path: "/users",
    permissions: ["users:add"],
    request: z.object({
      username: z.string(),
      password: z.string(),
      permissions: z.enum(PERMISSIONS).array().nullable(),
    }),
    response: z.string(),
  },
  deleteUser: {
    method: "DELETE",
    path: "/users/:userID",
    permissions: ["users:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  addUserPermissions: {
    method: "POST",
    path: "/users/:userID/permissions",
    permissions: ["users:edit"],
    request: z.object({
      permissions: z.enum(PERMISSIONS).array(),
    }),
    response: z.string(),
  },
  removeUserPermissions: {
    method: "DELETE",
    path: "/users/:userID/permissions",
    permissions: ["users:edit"],
    request: z.object({
      permissions: z.enum(PERMISSIONS).array(),
    }),
    response: z.string(),
  },
  addHash: {
    method: "POST",
    path: "/projects/:projectID/hashes",
    permissions: ["hashes:add"],
    request: z.object({
      hash: z.string(),
      hashType: z.enum(HASH_TYPES),
    }),
    response: z.string(),
  },
  removeHash: {
    method: "DELETE",
    path: "/projects/:projectID/hashes/:hashID",
    permissions: ["hashes:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  viewHash: {
    method: "GET",
    path: "/projects/:projectID/hashes/:hashID/view",
    permissions: ["hashes:view"],
    request: z.object({}).optional(),
    response: z.string().nullable(),
  },
  getInstance: {
    method: "GET",
    path: "/instances/:instanceID",
    permissions: ["instances:get"],
    request: z.object({}).optional(),
    response: z.object({
      IID: z.string(),
      name: z.string().nullable(),
      tag: z.string(),
      status: z.string(),
      updatedAt: z.date(),
      jobs: z
        .object({
          JID: z.string(),
          status: z.string(),
          updatedAt: z.date(),
        })
        .array(),
    }),
  },
  getInstances: {
    method: "GET",
    path: "/instances",
    permissions: ["instances:get"],
    request: z.object({}).optional(),
    response: z
      .object({
        IID: z.string(),
        name: z.string().nullable(),
        status: z.string(),
        updatedAt: z.date(),
      })
      .array(),
  },
  getInstanceList: {
    method: "GET",
    path: "/instances/list",
    permissions: ["instances:list"],
    request: z.object({}).optional(),
    response: z
      .object({
        IID: z.string(),
        name: z.string().nullable(),
      })
      .array(),
  },
  deleteInstance: {
    method: "DELETE",
    path: "/instances/:instanceID",
    permissions: ["instances:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  createInstance: {
    method: "POST",
    path: "/instances",
    permissions: ["instances:add"],
    request: z.object({
      name: z.string().nullable(),
      type: z.string().nullable(),
    }),
    response: z.string(),
  },
  createInstanceJob: {
    method: "POST",
    path: "/instances/:instanceID/jobs",
    permissions: ["instances:jobs:add"],
    request: z.object({
      wordlist: z.string(),
      hashType: z.enum(HASH_TYPES),
      projectIDs: z.string().array(),
    }),
    response: z.string(),
  },
  deleteInstanceJob: {
    method: "DELETE",
    permissions: ["instances:jobs:remove"],
    path: "/instances/:instanceID/jobs/:jobID",
    request: z.object({}).optional(),
    response: z.string(),
  },
  getProject: {
    method: "GET",
    path: "/projects/:projectID",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z.object({
      PID: z.string(),
      name: z.string(),
      updatedAt: z.date(),
      members: z
        .object({
          ID: z.string(),
          username: z.string(),
        })
        .array()
        .optional(),
      hashes: z
        .object({
          HID: z.string(),
          hash: z.string(),
          hashType: z.string(),
          status: z.string(),
          updatedAt: z.date(),
          jobs: PROJECT_JOB.array().optional(),
        })
        .array()
        .optional(),
    }),
  },
  getProjects: {
    method: "GET",
    path: "/projects",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z
      .object({
        PID: z.string(),
        name: z.string(),
        updatedAt: z.date(),
        members: z
          .object({
            ID: z.string(),
            username: z.string(),
          })
          .array()
          .optional(),
      })
      .array(),
  },
  getProjectList: {
    method: "GET",
    path: "/projects/list",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z
      .object({
        PID: z.string(),
        name: z.string(),
      })
      .array(),
  },
  createProject: {
    method: "POST",
    path: "/projects",
    permissions: ["projects:add"],
    request: z.object({
      projectName: z.string(),
    }),
    response: z.string(),
  },
  deleteProject: {
    method: "DELETE",
    path: "/projects/:projectID",
    permissions: ["projects:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  addUserToProject: {
    method: "POST",
    path: "/projects/:projectID/users/:userID",
    permissions: ["projects:users:add"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  removeUserFromProject: {
    method: "DELETE",
    path: "/projects/:projectID/users/:userID",
    permissions: ["projects:users:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  changePassword: {
    method: "PUT",
    path: "/users/:userID/password",
    permissions: ["auth"],
    request: z.object({
      oldPassword: z.string(),
      newPassword: z.string(),
    }),
    response: z.string(),
  },
  authUser: {
    method: "GET",
    path: "/auth/user",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z.object({
      uid: z.string(),
      username: z.string(),
      permissions: z.enum(PERMISSIONS).array(),
    }),
  },
} as const satisfies Record<
  string,
  Route<string, z.ZodType<any, any, any>, z.ZodType<any, any, any>>
>;

export type APIType = {
  [TKey in keyof typeof ROUTES]: APIHandler<(typeof ROUTES)[TKey]>;
};
