import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";

// Import the checkCreds function
import {
  AddHashRequest,
  AddHashResponse,
  AddUserToProjectRequest,
  AddUserToProjectResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  CreateInstanceRequest,
  CreateInstanceResponse,
  CreateProjectJobsRequest,
  CreateProjectJobsResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteInstanceRequest,
  DeleteInstanceResponse,
  DeleteProjectJobRequest,
  DeleteProjectJobResponse,
  DeleteProjectRequest,
  DeleteProjectResponse,
  DeleteUserRequest,
  DeleteUserResponse,
  GetInstanceListRequest,
  GetInstanceListResponse,
  GetInstanceRequest,
  GetInstanceResponse,
  GetInstancesRequest,
  GetInstancesResponse,
  GetProjectRequest,
  GetProjectResponse,
  GetProjectsRequest,
  GetProjectsResponse,
  GetUserListRequest,
  GetUserListResponse,
  GetUserRequest,
  GetUserResponse,
  GetUsersRequest,
  GetUsersResponse,
  InitRequest,
  InitResponse,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  PermissionType,
  Provider,
  RegisterRequest,
  RegisterResponse,
  RemoveHashRequest,
  RemoveUserFromProjectRequest,
  RemoveUserFromProjectResponse,
  hasPermission,
} from "@repo/api";

import { APIError, AuthError, errorHandler } from "../plugins/errors";
import { addHash, removeHash } from "./hashes";
import {
  createInstance,
  deleteInstance,
  getInstance,
  getInstanceList,
  getInstances,
} from "./instances";
import { createProjectJobs, deleteProjectJobs } from "./jobs";
import {
  addUserToProject,
  createProject,
  deleteProject,
  getUserProject,
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

export const api: FastifyPluginCallback<{}> = (instance, _opts, next) => {
  instance.setErrorHandler(errorHandler);

  instance.post<InitRequest>("/init", async (request) => {
    if (!(await checkNoUsers(request.server.prisma)))
      throw new APIError("App is already initiated");

    const { username, password } = request.body;
    if (username === undefined || password === undefined)
      throw new APIError("Invalid user config");

    await createUser(request.server.prisma, username, password, ["root"]);

    return {
      response: "First admin user has been created",
    } satisfies InitResponse;
  });

  instance.post<LoginRequest>("/auth/login", async (request) => {
    const { username, password } = request.body;
    if (username === undefined || password === undefined)
      throw new AuthError("Login failed");

    const user = await getAuthenticatedUser(
      request.server.prisma,
      username,
      password
    );
    if (!user) throw new APIError("Login failed");

    setSession(request, user);

    return { response: "Login successful" } satisfies LoginResponse;
  });

  instance.get<LogoutRequest>("/auth/logout", async (request) => {
    await request.session.destroy();

    return {
      response: "Logout successful",
    } satisfies LogoutResponse;
  });

  instance.get("/auth/user", { preHandler: [checkAuth] }, (request) => {
    return {
      uid: request.session.uid,
      username: request.session.username,
      permissions: request.session.permissions.split(" "),
    };
  });

  instance.get<GetUserRequest>(
    "/users/:userID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { userID } = request.params;

      if (
        !hasPermission(request.session.permissions, "users:get") &&
        userID !== request.session.uid
      )
        throw new APIError("Cannot get user");

      return {
        response: await getUser(
          request.server.prisma,
          userID,
          request.session.uid,
          hasPermission(request.session.permissions, "projects:get")
        ),
      } satisfies GetUserResponse;
    }
  );

  instance.get<GetUsersRequest>(
    "/users",
    { preHandler: [checkPermission("users:get")] },
    async (request) => {
      return {
        response: await getUsers(request.server.prisma),
      } satisfies GetUsersResponse;
    }
  );

  instance.get<GetUserListRequest>(
    "/users/list",
    { preHandler: [checkPermission("users:list")] },
    async (request) => {
      return {
        response: await getUserList(request.server.prisma),
      } satisfies GetUserListResponse;
    }
  );

  instance.post<RegisterRequest>(
    "/users",
    { preHandler: [checkPermission("users:add")] },
    async (request) => {
      const { username, password, permissions } = request.body;
      if (username === undefined || password === undefined)
        throw new APIError("Invalid user config");

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

      return { response: "User has been created" } satisfies RegisterResponse;
    }
  );

  instance.delete<DeleteUserRequest>(
    "/users/:userID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { userID } = request.params;

      if (
        !hasPermission(request.session.permissions, "users:remove") &&
        userID !== request.session.uid
      )
        throw new APIError("Cannot remove user");

      await deleteUser(request.server.prisma, userID);

      return {
        response: "User has been obliterated into oblivion",
      } satisfies DeleteUserResponse;
    }
  );

  instance.put<ChangePasswordRequest>(
    "/users/:userID/password",
    { preHandler: [checkAuth] },
    async (request) => {
      const { userID } = request.params;

      const { oldPassword, newPassword } = request.body;
      if (oldPassword === undefined || newPassword === undefined)
        throw new APIError("Invalid user config");

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

      return {
        response: "Password has been changed",
      } satisfies ChangePasswordResponse;
    }
  );

  instance.get<GetProjectsRequest>(
    "/projects",
    { preHandler: [checkAuth] },
    async (request) => {
      let response: GetProjectsResponse["response"] = await getUserProjects(
        request.server.prisma,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:get")
      );

      if (!hasPermission(request.session.permissions, "projects:users:get"))
        response = response.map((project) => ({
          ...project,
          members: undefined,
        }));

      return { response } satisfies GetProjectsResponse;
    }
  );

  instance.get<GetProjectRequest>(
    "/projects/:projectID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;

      let response: GetProjectResponse["response"] = await getUserProject(
        request.server.prisma,
        projectID,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:get")
      );

      if (!hasPermission(request.session.permissions, "projects:users:get"))
        delete response.members;

      if (!hasPermission(request.session.permissions, "hashes:get"))
        delete response.hashes;
      else if (
        !hasPermission(request.session.permissions, "instances:get") &&
        !hasPermission(request.session.permissions, "instances:jobs:get")
      )
        response.hashes = response.hashes?.map((hash) => {
          delete hash.job;
          return hash;
        });

      return { response } satisfies GetProjectResponse;
    }
  );

  instance.post<CreateProjectRequest>(
    "/projects",
    { preHandler: [checkPermission("projects:add")] },
    async (request) => {
      const { projectName } = request.body;
      if (projectName === undefined) throw new APIError("Invalid project name");

      await createProject(
        request.server.prisma,
        projectName,
        request.session.uid
      );

      return {
        response: "Project has been created",
      } satisfies CreateProjectResponse;
    }
  );

  instance.delete<DeleteProjectRequest>(
    "/projects/:projectID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;

      await deleteProject(
        request.server.prisma,
        projectID,
        request.session.uid,
        hasPermission(request.session.permissions, "projects:remove")
      );

      return {
        response: "Project has been deleted",
      } satisfies DeleteProjectResponse;
    }
  );

  instance.post<AddUserToProjectRequest>(
    "/projects/:projectID/users/:userID",
    { preHandler: [checkPermission("projects:users:add")] },
    async (request) => {
      const { projectID, userID } = request.params;

      await addUserToProject(
        request.server.prisma,
        request.session.uid,
        userID,
        projectID,
        hasPermission(request.session.permissions, "root")
      );

      return {
        response: "User has been added to the project",
      } satisfies AddUserToProjectResponse;
    }
  );

  instance.delete<RemoveUserFromProjectRequest>(
    "/projects/:projectID/users/:userID",
    { preHandler: [checkPermission("projects:users:remove")] },
    async (request) => {
      const { projectID, userID } = request.params;

      await removeUserFromProject(
        request.server.prisma,
        request.session.uid,
        userID,
        projectID,
        hasPermission(request.session.permissions, "root")
      );

      return {
        response: "User has been removed from the project",
      } satisfies RemoveUserFromProjectResponse;
    }
  );

  instance.post<AddHashRequest>(
    "/projects/:projectID/hashes",
    { preHandler: [checkPermission("hashes:add")] },
    async (request) => {
      const { projectID } = request.params;

      const { hash, hashType } = request.body;
      if (hash === undefined || hashType === undefined)
        throw new APIError("Invalid hash config");

      await addHash(
        request.server.prisma,
        request.session.uid,
        projectID,
        hash,
        hashType,
        hasPermission(request.session.permissions, "root")
      );

      return { response: "Hash has been added" } satisfies AddHashResponse;
    }
  );

  instance.delete<RemoveHashRequest>(
    "/projects/:projectID/hashes/:hashID",
    { preHandler: [checkPermission("hashes:remove")] },
    async (request) => {
      const { projectID, hashID } = request.params;

      await removeHash(
        request.server.prisma,
        projectID,
        hashID,
        request.session.uid,
        hasPermission(request.session.permissions, "root")
      );

      return { response: "Hash has been removed" } satisfies AddHashResponse;
    }
  );

  instance.get<GetInstancesRequest>(
    "/instances",
    {
      preHandler: [checkPermission("instances:get")],
    },
    async (request) => {
      const response = await getInstances(request.server.prisma);

      return { response } satisfies GetInstancesResponse;
    }
  );

  instance.get<GetInstanceListRequest>(
    "/instances/list",
    {
      preHandler: [checkPermission("instances:list")],
    },
    async (request) => {
      const response = await getInstanceList(request.server.prisma);

      return { response } satisfies GetInstanceListResponse;
    }
  );

  instance.post<CreateInstanceRequest>(
    "/instances",
    {
      preHandler: [checkPermission("instances:add")],
    },
    async (request) => {
      const { name, provider, type } = request.body;

      if (provider === undefined) throw new APIError("Invalid instance config");

      const instanceID = await createInstance(
        request.server.prisma,
        request.server.instances,
        provider,
        name,
        type
      );

      return { response: instanceID } satisfies CreateInstanceResponse;
    }
  );

  instance.get<GetInstanceRequest>(
    "/instances/:instanceID",
    {
      preHandler: [checkPermission("instances:get")],
    },
    async (request) => {
      const { instanceID } = request.params;

      const response = await getInstance(request.server.prisma, instanceID);

      return {
        response,
      } satisfies GetInstanceResponse;
    }
  );

  instance.delete<DeleteInstanceRequest>(
    "/instances/:instanceID",
    {
      preHandler: [checkPermission("instances:remove")],
    },
    async (request) => {
      const { instanceID } = request.params;

      await deleteInstance(
        request.server.prisma,
        request.server.instances,
        instanceID
      );

      return {
        response: "Instance has been destroy",
      } satisfies DeleteInstanceResponse;
    }
  );

  instance.post<CreateProjectJobsRequest>(
    "/projects/:projectID/jobs",
    {
      preHandler: [checkPermission("hashes:get"), checkPermission("jobs:add")],
    },
    async (request) => {
      const { projectID } = request.params;

      const { instanceID } = request.body;
      if (instanceID === undefined)
        throw new APIError("Invalid project jobs config");

      const jobIDs = await createProjectJobs(
        request.server.prisma,
        request.server.instances,
        projectID,
        instanceID,
        request.session.uid,
        hasPermission(request.session.permissions, "root")
      );

      return { response: jobIDs } satisfies CreateProjectJobsResponse;
    }
  );

  instance.delete<DeleteProjectJobRequest>(
    "/projects/:projectID/jobs",
    {
      preHandler: [checkPermission("jobs:remove")],
    },
    async (request) => {
      const { projectID } = request.params;

      await deleteProjectJobs(
        request.server.prisma,
        request.server.instances,
        projectID,
        request.session.uid,
        hasPermission(request.session.permissions, "root")
      );

      return {
        response: "Deleted project jobs",
      } satisfies DeleteProjectJobResponse;
    }
  );

  //Epic GigaCHAD route holding the whole app together. Should not be deleted under any circumstance.
  instance.get("/ping", () => "pong");

  next();
};
