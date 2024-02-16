import { z } from "zod";

import { PERMISSIONS } from "../auth";
import { APIHandler, Route } from "../routing";
import { HASH_TYPES } from "../types";

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
    request: z.object({}).optional(),
    response: z.string(),
  },
  init: {
    method: "POST",
    path: "/init",
    request: z.object({
      username: z.string(),
      password: z.string(),
    }),
    response: z.string(),
  },
  getUser: {
    method: "GET",
    path: "/users/:userID",
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
    request: z.object({
      username: z.string(),
      password: z.string(),
    }),
    response: z.string(),
  },
  logout: {
    method: "POST",
    path: "/auth/logout",
    request: z.object({}).optional(),
    response: z.string(),
  },
  register: {
    method: "POST",
    path: "/users",
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
    request: z.object({}).optional(),
    response: z.string(),
  },
  addHash: {
    method: "POST",
    path: "/projects/:projectID/hashes",
    request: z.object({
      hash: z.string(),
      hashType: z.enum(HASH_TYPES),
    }),
    response: z.string(),
  },
  removeHash: {
    method: "DELETE",
    path: "/projects/:projectID/hashes/:hashID",
    request: z.object({}).optional(),
    response: z.string(),
  },
  getInstance: {
    method: "GET",
    path: "/instances/:instanceID",
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
    request: z.object({}).optional(),
    response: z.string(),
  },
  createInstance: {
    method: "POST",
    path: "/instances",
    request: z.object({
      name: z.string().nullable(),
      type: z.string().nullable(),
    }),
    response: z.string(),
  },
  createInstanceJob: {
    method: "POST",
    path: "/instances/:instanceID/jobs",
    request: z.object({
      hashType: z.enum(HASH_TYPES),
      projectIDs: z.string().array(),
    }),
    response: z.string(),
  },
  deleteInstanceJob: {
    method: "DELETE",
    path: "/instances/:instanceID/jobs/:jobID",
    request: z.object({}).optional(),
    response: z.string(),
  },
  getProject: {
    method: "GET",
    path: "/projects/:projectID",
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
          jobs: PROJECT_JOB.array().optional(),
        })
        .array()
        .optional(),
    }),
  },
  getProjects: {
    method: "GET",
    path: "/projects",
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
    request: z.object({
      projectName: z.string(),
    }),
    response: z.string(),
  },
  deleteProject: {
    method: "DELETE",
    path: "/projects/:projectID",
    request: z.object({}).optional(),
    response: z.string(),
  },
  addUserToProject: {
    method: "POST",
    path: "/projects/:projectID/users/:userID",
    request: z.object({}).optional(),
    response: z.string(),
  },
  removeUserFromProject: {
    method: "DELETE",
    path: "/projects/:projectID/users/:userID",
    request: z.object({}).optional(),
    response: z.string(),
  },
  changePassword: {
    method: "PUT",
    path: "/users/:userID/password",
    request: z.object({
      oldPassword: z.string(),
      newPassword: z.string(),
    }),
    response: z.string(),
  },
  authUser: {
    method: "GET",
    path: "/auth/user",
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
