import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";

import {
  HTTPMethod,
  PermissionType,
  Route,
  RouteRequest,
  RouteResponse,
  hasPermission,
} from "@repo/api";
import { ROUTES } from "@repo/api/server";
import { APIError, AuthError, errorHandler } from "@repo/plugins/error";

import { addHash, removeHash } from "./hashes";
import {
  createInstance,
  deleteInstance,
  getInstance,
  getInstanceList,
  getInstances,
} from "./instances";
import { createJob, deleteJob } from "./jobs";
import {
  addUserToProject,
  createProject,
  deleteProject,
  getUserProject,
  getUserProjectList,
  getUserProjects,
  removeUserFromProject,
} from "./projects";
import {
  AuthenticatedUser,
  changePassword,
  checkNoUsers,
  createUser,
  deleteUser,
  getAuthenticatedUser,
  getUser,
  getUserList,
  getUsers,
} from "./users";

declare module "fastify" {
  interface Session {
    uid: string;
    username: string;
    permissions: string;
  }
}

function setSession(
  request: FastifyRequest,
  authenticatedUser: AuthenticatedUser
) {
  request.session.uid = authenticatedUser.ID;
  request.session.username = authenticatedUser.username;
  request.session.permissions = authenticatedUser.permissions;
}

function checkAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
  next: (err?: Error | undefined) => void
) {
  if (request.session.uid === undefined)
    throw new AuthError("You need to be authenticated");

  next();
}

function checkPermission(permission: PermissionType) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    next: (err?: Error | undefined) => void
  ) => {
    if (!hasPermission(request.session.permissions, permission))
      throw new AuthError("Access denied");

    next();
  };
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

type RouteHandler<TRoute> = TRoute extends Route<
  infer TPath,
  infer TReq,
  infer TRes
>
  ? {
      checks?: ((...req: any) => void)[];
      handler: (
        request: FastifyRequest<RouteRequest<TRoute>>
      ) => Promise<RouteResponse<TRoute>["response"]>;
    }
  : never;

const ROUTER: {
  [key in keyof typeof ROUTES]: RouteHandler<(typeof ROUTES)[key]>;
} = {
  ping: {
    handler: async () => {
      return "pong";
    },
  },
  init: {
    handler: async (request) => {
      if (!(await checkNoUsers(request.server.prisma)))
        throw new APIError("App is already initiated");

      const { username, password } = request.body;

      await createUser(request.server.prisma, username, password, ["root"]);

      return "First admin user has been created";
    },
  },
  login: {
    handler: async (request) => {
      const { username, password } = request.body;

      const user = await getAuthenticatedUser(
        request.server.prisma,
        username,
        password
      );
      if (!user) throw new APIError("Login failed");

      await request.session.regenerate();
      setSession(request, user);

      return "Login successful";
    },
  },
  logout: {
    handler: async (request) => {
      await request.session.destroy();

      return "Logout successful";
    },
  },
  authUser: {
    checks: [checkAuth],
    handler: async (request) => {
      return {
        uid: request.session.uid,
        username: request.session.username,
        permissions: request.session.permissions.split(" ") as PermissionType[],
      };
    },
  },
  getUser: {
    checks: [checkAuth],
    handler: async (request) => {
      const { userID } = request.params;

      if (
        !hasPermission(request.session.permissions, "users:get") &&
        userID !== request.session.uid
      )
        throw new APIError("Cannot get user");

      return await getUser(
        request.server.prisma,
        userID,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:get")
      );
    },
  },
  getUsers: {
    checks: [checkAuth],
    handler: async (request) => {
      return await getUsers(request.server.prisma);
    },
  },
  getUserList: {
    checks: [checkPermission("users:list")],
    handler: async (request) => {
      return await getUserList(request.server.prisma);
    },
  },
  register: {
    checks: [checkPermission("users:add")],
    handler: async (request) => {
      const { username, password, permissions } = request.body;

      if (
        (permissions ?? []).some(
          (permission) =>
            !hasPermission(request.session.permissions, permission)
        )
      )
        throw new APIError(
          "You must have the permission to provide these permissions"
        );

      await createUser(
        request.server.prisma,
        username,
        password,
        permissions ?? []
      );

      return "User has been created";
    },
  },
  deleteUser: {
    checks: [checkAuth],
    handler: async (request) => {
      const { userID } = request.params;

      if (
        !hasPermission(request.session.permissions, "users:remove") &&
        userID !== request.session.uid
      )
        throw new APIError("Cannot remove user");

      await deleteUser(request.server.prisma, userID);

      return "User has been obliterated into oblivion";
    },
  },
  changePassword: {
    checks: [checkAuth],
    handler: async (request) => {
      const { userID } = request.params;
      const { oldPassword, newPassword } = request.body;

      const bypassCheck = hasPermission(
        request.session.permissions,
        "users:edit"
      );
      if (!bypassCheck && userID !== request.session.uid)
        throw new APIError("Cannot edit user");

      await changePassword(
        request.server.prisma,
        userID,
        oldPassword,
        newPassword,
        bypassCheck
      );

      return "Password has been changed";
    },
  },
  getProjects: {
    checks: [checkAuth],
    handler: async (request) => {
      const response = await getUserProjects(
        request.server.prisma,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:get")
      );

      let newResponse;
      if (!hasPermission(request.session.permissions, "projects:users:get"))
        newResponse = response.map((project) => ({
          ...project,
          members: undefined,
        }));
      else newResponse = response;

      return newResponse;
    },
  },
  getProjectList: {
    checks: [checkAuth],
    handler: async (request) => {
      return await getUserProjectList(
        request.server.prisma,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:get")
      );
    },
  },
  getProject: {
    checks: [checkAuth],
    handler: async (request) => {
      const { projectID } = request.params;

      const response = await getUserProject(
        request.server.prisma,
        projectID,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:get")
      );

      let newResponse;
      if (!hasPermission(request.session.permissions, "projects:users:get"))
        newResponse = {
          ...response,
          users: undefined,
        };
      else newResponse = response;

      if (!hasPermission(request.session.permissions, "hashes:get"))
        newResponse = {
          ...newResponse,
          hashes: undefined,
        };
      else if (
        !hasPermission(request.session.permissions, "instances:get") &&
        !hasPermission(request.session.permissions, "instances:jobs:get")
      )
        newResponse = {
          ...newResponse,
          hashes: newResponse.hashes?.map((hash) => ({
            ...hash,
            jobs: undefined,
          })),
        };

      return newResponse;
    },
  },
  createProject: {
    checks: [checkPermission("projects:add")],
    handler: async (request) => {
      const { projectName } = request.body;

      await createProject(
        request.server.prisma,
        projectName,
        request.session.uid
      );

      return "Project has been created";
    },
  },
  deleteProject: {
    checks: [checkAuth],
    handler: async (request) => {
      const { projectID } = request.params;

      await deleteProject(
        request.server.prisma,
        projectID,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:remove")
      );

      return "Project has been deleted";
    },
  },
  addUserToProject: {
    checks: [checkPermission("projects:users:add")],
    handler: async (request) => {
      const { projectID, userID } = request.params;

      await addUserToProject(
        request.server.prisma,
        request.session.uid,
        userID,
        projectID,
        hasPermission(request.session.permissions, "root")
      );

      return "User has been added to the project";
    },
  },
  removeUserFromProject: {
    checks: [checkPermission("projects:users:remove")],
    handler: async (request) => {
      const { projectID, userID } = request.params;

      await removeUserFromProject(
        request.server.prisma,
        request.session.uid,
        userID,
        projectID,
        hasPermission(request.session.permissions, "root")
      );

      return "User has been removed from the project";
    },
  },
  addHash: {
    checks: [checkPermission("hashes:add")],
    handler: async (request) => {
      const { projectID } = request.params;
      const { hash, hashType } = request.body;

      await addHash(
        request.server.prisma,
        request.session.uid,
        projectID,
        hash,
        hashType,
        hasPermission(request.session.permissions, "root")
      );

      return "Hash has been added";
    },
  },
  removeHash: {
    checks: [checkPermission("hashes:remove")],
    handler: async (request) => {
      const { projectID, hashID } = request.params;

      await removeHash(
        request.server.prisma,
        projectID,
        hashID,
        request.session.uid,
        hasPermission(request.session.permissions, "root")
      );

      return "Hash has been removed";
    },
  },
  getInstances: {
    checks: [checkPermission("instances:get")],
    handler: async (request) => {
      return await getInstances(request.server.prisma);
    },
  },
  getInstanceList: {
    checks: [checkPermission("instances:list")],
    handler: async (request) => {
      return await getInstanceList(request.server.prisma);
    },
  },
  createInstance: {
    checks: [checkPermission("instances:add")],
    handler: async (request) => {
      const { name, type } = request.body;

      return await createInstance(
        request.server.prisma,
        request.server.cluster,
        name,
        type
      );
    },
  },
  getInstance: {
    checks: [checkPermission("instances:get")],
    handler: async (request) => {
      const { instanceID } = request.params;

      return await getInstance(request.server.prisma, instanceID);
    },
  },
  deleteInstance: {
    checks: [checkPermission("instances:remove")],
    handler: async (request) => {
      const { instanceID } = request.params;

      await deleteInstance(
        request.server.prisma,
        request.server.cluster,
        instanceID
      );

      return "Instance has been destroy";
    },
  },
  createInstanceJob: {
    checks: [checkPermission("instances:jobs:add")],
    handler: async (request) => {
      const { instanceID } = request.params;
      const { hashType, projectIDs } = request.body;

      const jobID = await createJob(
        request.server.prisma,
        request.server.cluster,
        instanceID,
        hashType,
        projectIDs,
        request.session.uid,
        hasPermission(request.session.permissions, "root")
      );

      return jobID;
    },
  },
  deleteInstanceJob: {
    checks: [checkPermission("instances:jobs:remove")],
    handler: async (request) => {
      const { instanceID, jobID } = request.params;

      await deleteJob(
        request.server.prisma,
        request.server.cluster,
        instanceID,
        jobID
      );

      return "Job destroyed";
    },
  },
} as const;

export const api: FastifyPluginCallback<{}> = (instance, _opts, next) => {
  instance.setErrorHandler(errorHandler);

  for (const [key, route] of Object.entries(ROUTES)) {
    const method = route.method.toLowerCase() as Lowercase<HTTPMethod>;
    const router = ROUTER[key as keyof typeof ROUTES];

    instance[method](
      route.path,
      {
        preHandler: router.checks,
        preValidation: [validate(route.request)],
      },
      async (request: any) => ({ response: await router.handler(request) })
    );
  }

  next();
};
