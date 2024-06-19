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
    type: "json",
    permissions: [],
    request: z.object({}).optional(),
    response: z.string(),
  },
  init: {
    method: "POST",
    path: "/init",
    type: "json",
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
    type: "json",
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
    type: "json",
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
    type: "json",
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
    type: "json",
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
    type: "json",
    permissions: ["auth"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  register: {
    method: "POST",
    path: "/users",
    type: "json",
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
    type: "json",
    permissions: ["users:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  addUserPermissions: {
    method: "POST",
    path: "/users/:userID/permissions",
    type: "json",
    permissions: ["users:edit"],
    request: z.object({
      permissions: z.enum(PERMISSIONS).array(),
    }),
    response: z.string(),
  },
  removeUserPermissions: {
    method: "DELETE",
    path: "/users/:userID/permissions",
    type: "json",
    permissions: ["users:edit"],
    request: z.object({
      permissions: z.enum(PERMISSIONS).array(),
    }),
    response: z.string(),
  },
  addHash: {
    method: "POST",
    path: "/projects/:projectID/hashes",
    type: "json",
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
    type: "json",
    permissions: ["hashes:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  viewHash: {
    method: "GET",
    path: "/projects/:projectID/hashes/:hashID/view",
    type: "json",
    permissions: ["hashes:view"],
    request: z.object({}).optional(),
    response: z.string().nullable(),
  },
  getInstance: {
    method: "GET",
    path: "/instances/:instanceID",
    type: "json",
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
    type: "json",
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
    type: "json",
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
    type: "json",
    permissions: ["instances:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  createInstance: {
    method: "POST",
    path: "/instances",
    type: "json",
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
    type: "json",
    permissions: ["instances:jobs:add"],
    request: z.object({
      wordlistID: z.string(),
      hashType: z.enum(HASH_TYPES),
      projectIDs: z.string().array(),
    }),
    response: z.string(),
  },
  deleteInstanceJob: {
    method: "DELETE",
    path: "/instances/:instanceID/jobs/:jobID",
    type: "json",
    permissions: ["instances:jobs:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  getProject: {
    method: "GET",
    path: "/projects/:projectID",
    type: "json",
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
    type: "json",
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
    type: "json",
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
    type: "json",
    permissions: ["projects:add"],
    request: z.object({
      projectName: z.string(),
    }),
    response: z.string(),
  },
  deleteProject: {
    method: "DELETE",
    path: "/projects/:projectID",
    type: "json",
    permissions: ["projects:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  getWordlist: {
    method: "GET",
    path: "/wordlists/:wordlistID",
    type: "json",
    permissions: ["wordlists:get"],
    request: z.object({}).optional(),
    response: z.object({
      WID: z.string(),
      name: z.string().nullable(),
      size: z.number(),
      checksum: z.string(),
      updatedAt: z.date(),
    }),
  },
  getWordlists: {
    method: "GET",
    path: "/wordlists",
    type: "json",
    permissions: ["wordlists:get"],
    request: z.object({}).optional(),
    response: z
      .object({
        WID: z.string(),
        name: z.string().nullable(),
        size: z.number(),
        checksum: z.string(),
        updatedAt: z.date(),
      })
      .array(),
  },
  getWordlistList: {
    method: "GET",
    path: "/wordlists/list",
    type: "json",
    permissions: ["wordlists:list"],
    request: z.object({}).optional(),
    response: z
      .object({
        WID: z.string(),
        name: z.string().nullable(),
      })
      .array(),
  },
  createWordlist: {
    method: "POST",
    path: "/wordlists",
    type: "multipart",
    permissions: ["wordlists:add"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  deleteWordlist: {
    method: "DELETE",
    path: "/wordlists/:wordlistID",
    type: "json",
    permissions: ["wordlists:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  addUserToProject: {
    method: "POST",
    path: "/projects/:projectID/users/:userID",
    type: "json",
    permissions: ["projects:users:add"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  removeUserFromProject: {
    method: "DELETE",
    path: "/projects/:projectID/users/:userID",
    type: "json",
    permissions: ["projects:users:remove"],
    request: z.object({}).optional(),
    response: z.string(),
  },
  changePassword: {
    method: "PUT",
    path: "/users/:userID/password",
    type: "json",
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
    type: "json",
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
