import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";

// Import the checkCreds function
import {
  AddHashRequest,
  AddHashResponse,
  AddUserToProjectRequest,
  AddUserToProjectResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectRequest,
  DeleteProjectResponse,
  DeleteUserRequest,
  DeleteUserResponse,
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
  RegisterRequest,
  RegisterResponse,
  RemoveHashRequest,
  RemoveUserFromProjectRequest,
  RemoveUserFromProjectResponse,
  hasPermission,
} from "@repo/api";

import { APIError, AuthError, errorHandler } from "../errors";
import { addHash, removeHash } from "./hashes";
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
    uid: number;
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

    return { response: "First admin user has been created" } as InitResponse;
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

    return { response: "Login successful" } as LoginResponse;
  });

  instance.get<LogoutRequest>("/auth/logout", async (request) => {
    await request.session.destroy();

    return {
      response: "Logout successful",
    } as LogoutResponse;
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

      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

      if (
        !hasPermission(request.session.permissions, "users:get") &&
        parseInt(userID) !== request.session.uid
      )
        throw new APIError("Cannot get user");

      return {
        response: await getUser(
          request.server.prisma,
          parseInt(userID),
          request.session.uid,
          hasPermission(request.session.permissions, "projects:get")
        ),
      } as GetUserResponse;
    }
  );

  instance.get<GetUsersRequest>(
    "/users",
    { preHandler: [checkPermission("users:get")] },
    async (request) => {
      return {
        response: await getUsers(request.server.prisma),
      } as GetUsersResponse;
    }
  );

  instance.get<GetUserListRequest>(
    "/users/list",
    { preHandler: [checkPermission("users:list")] },
    async (request) => {
      return {
        response: await getUserList(request.server.prisma),
      } as GetUserListResponse;
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

      return { response: "User has been created" } as RegisterResponse;
    }
  );

  instance.delete<DeleteUserRequest>(
    "/users/:userID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { userID } = request.params;

      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

      if (
        !hasPermission(request.session.permissions, "users:remove") &&
        parseInt(userID) !== request.session.uid
      )
        throw new APIError("Cannot remove user");

      await deleteUser(request.server.prisma, parseInt(userID));

      return {
        response: "User has been obliterated into oblivion",
      } as DeleteUserResponse;
    }
  );

  instance.put<ChangePasswordRequest>(
    "/users/:userID/password",
    { preHandler: [checkAuth] },
    async (request) => {
      const { userID } = request.params;

      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

      const { oldPassword, newPassword } = request.body;
      if (oldPassword === undefined || newPassword === undefined)
        throw new APIError("Invalid user config");

      const bypassCheck = hasPermission(
        request.session.permissions,
        "users:edit"
      );
      if (!bypassCheck && parseInt(userID) !== request.session.uid)
        throw new APIError("Cannot edit user");

      await changePassword(
        request.server.prisma,
        parseInt(userID),
        oldPassword,
        newPassword,
        bypassCheck
      );

      return {
        response: "Password has been changed",
      } as ChangePasswordResponse;
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

      return { response } as GetProjectsResponse;
    }
  );

  instance.get<GetProjectRequest>(
    "/projects/:projectID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");

      let response: GetProjectResponse["response"] = await getUserProject(
        request.server.prisma,
        parseInt(projectID),
        request.session.uid,
        hasPermission(request.session.permissions, "projects:get")
      );

      if (!hasPermission(request.session.permissions, "projects:users:get"))
        delete response["members"];
      if (!hasPermission(request.session.permissions, "projects:hashes:get"))
        delete response["hashes"];

      return { response } as GetProjectResponse;
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
      } as CreateProjectResponse;
    }
  );

  instance.delete<DeleteProjectRequest>(
    "/projects/:projectID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");

      await deleteProject(
        request.server.prisma,
        parseInt(projectID as string),
        request.session.uid,
        hasPermission(request.session.permissions, "projects:remove")
      );

      return {
        response: "Project has been deleted",
      } as DeleteProjectResponse;
    }
  );

  instance.post<AddUserToProjectRequest>(
    "/projects/:projectID/users/:userID",
    { preHandler: [checkPermission("projects:users:add")] },
    async (request) => {
      const { projectID, userID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");
      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

      await addUserToProject(
        request.server.prisma,
        request.session.uid,
        parseInt(userID),
        parseInt(projectID),
        hasPermission(request.session.permissions, "root")
      );

      return {
        response: "User has been added to the project",
      } as AddUserToProjectResponse;
    }
  );

  instance.delete<RemoveUserFromProjectRequest>(
    "/projects/:projectID/users/:userID",
    { preHandler: [checkPermission("projects:users:remove")] },
    async (request) => {
      const { projectID, userID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");
      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

      await removeUserFromProject(
        request.server.prisma,
        request.session.uid,
        parseInt(userID),
        parseInt(projectID),
        hasPermission(request.session.permissions, "root")
      );

      return {
        response: "User has been removed from the project",
      } as RemoveUserFromProjectResponse;
    }
  );

  instance.post<AddHashRequest>(
    "/projects/:projectID/hashes",
    { preHandler: [checkPermission("projects:hashes:add")] },
    async (request) => {
      const { projectID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");

      const { hash, hashType } = request.body;
      if (hash === undefined || hashType === undefined)
        throw new APIError("Invalid hash config");

      await addHash(
        request.server.prisma,
        request.session.uid,
        parseInt(projectID),
        hash,
        hashType,
        hasPermission(request.session.permissions, "root")
      );

      return { response: "Hash has been added" } as AddHashResponse;
    }
  );

  instance.delete<RemoveHashRequest>(
    "/projects/:projectID/hashes/:hashID",
    { preHandler: [checkPermission("projects:hashes:remove")] },
    async (request) => {
      const { projectID, hashID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");
      if (isNaN(parseInt(hashID))) throw new APIError("Invalid hashID");

      await removeHash(
        request.server.prisma,
        parseInt(projectID),
        parseInt(hashID),
        request.session.uid,
        hasPermission(request.session.permissions, "root")
      );

      return { response: "Hash has been removed" } as AddHashResponse;
    }
  );

  //Epic GigaCHAD route holding the whole app together. Should not be deleted under any circumstance.
  instance.get("/ping", () => "pong");

  next();
};
