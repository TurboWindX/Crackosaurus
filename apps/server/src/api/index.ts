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
  GetHashesRequest,
  GetHashesResponse,
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
  RegisterRequest,
  RegisterResponse,
  RemoveHashRequest,
  RemoveUserFromProjectRequest,
  RemoveUserFromProjectResponse,
} from "@repo/api";

import { APIError, AuthError, errorHandler } from "../errors";
import { addHash, getHashes, removeHash } from "./hashes";
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
    isAdmin: boolean;
  }
}

function setSession(
  request: FastifyRequest,
  authenticatedUser: AuthenticatedUser
) {
  request.session.uid = authenticatedUser.uid;
  request.session.username = authenticatedUser.username;
  request.session.isAdmin = authenticatedUser.isAdmin === 1;
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

function checkAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
  next: (err?: Error | undefined) => void
) {
  if (request.session.isAdmin !== true)
    throw new AuthError("You need to be admin");

  next();
}

export const api: FastifyPluginCallback<{}> = (instance, _opts, next) => {
  instance.setErrorHandler(errorHandler);

  instance.post<InitRequest>("/init", async (request) => {
    if (!(await checkNoUsers(request.server.prisma)))
      throw new APIError("App is already initiated");

    const { username, password } = request.body;
    if (username === undefined || password === undefined)
      throw new APIError("Invalid user config");

    await createUser(request.server.prisma, username, password, true);

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

  instance.get("/auth/user", { preHandler: [checkAuth] }, (request) => {
    return {
      uid: request.session.uid,
      username: request.session.username,
      isAdmin: request.session.isAdmin,
    };
  });

  instance.get<GetUserRequest>(
    "/users/:userID",
    { preHandler: [checkAuth] },
    async (request) => {
      return {
        response: await getUser(
          request.server.prisma,
          request.session.uid,
          request.session.isAdmin
        ),
      } as GetUserResponse;
    }
  );

  instance.get<GetUsersRequest>(
    "/users",
    { preHandler: [checkAdmin] },
    async (request) => {
      return {
        response: await getUsers(request.server.prisma),
      } as GetUsersResponse;
    }
  );

  instance.get<GetUserListRequest>(
    "/users/list",
    { preHandler: [checkAuth] },
    async (request) => {
      return {
        response: await getUserList(request.server.prisma),
      } as GetUserListResponse;
    }
  );

  instance.post<RegisterRequest>(
    "/users",
    { preHandler: [checkAdmin] },
    async (request) => {
      const { username, password, isAdmin } = request.body;
      if (username === undefined || password === undefined)
        throw new APIError("Invalid user config");

      await createUser(
        request.server.prisma,
        username,
        password,
        isAdmin ?? false
      );

      return { response: "User has been created" } as RegisterResponse;
    }
  );

  instance.delete<DeleteUserRequest>(
    "/users/:userID",
    { preHandler: [checkAdmin] },
    async (request) => {
      const { userID } = request.params;

      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

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

      await changePassword(
        request.server.prisma,
        parseInt(userID),
        oldPassword,
        newPassword,
        request.session.isAdmin
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
      return {
        response: await getUserProjects(
          request.server.prisma,
          request.session.uid,
          request.session.isAdmin
        ),
      } as GetProjectsResponse;
    }
  );

  instance.get<GetProjectRequest>(
    "/projects/:projectID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");

      return {
        response: await getUserProject(
          request.server.prisma,
          parseInt(projectID),
          request.session.uid,
          request.session.isAdmin
        ),
      } as GetProjectResponse;
    }
  );

  instance.post<CreateProjectRequest>(
    "/projects",
    { preHandler: [checkAdmin] },
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
        request.session.uid
      );

      return {
        response: "Project has been deleted",
      } as DeleteProjectResponse;
    }
  );

  instance.post<AddUserToProjectRequest>(
    "/projects/:projectID/users/:userID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID, userID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");
      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

      await addUserToProject(
        request.server.prisma,
        request.session.uid,
        parseInt(userID),
        parseInt(projectID),
        request.session.isAdmin
      );

      return {
        response: "User has been added to the project",
      } as AddUserToProjectResponse;
    }
  );

  instance.delete<RemoveUserFromProjectRequest>(
    "/projects/:projectID/users/:userID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID, userID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");
      if (isNaN(parseInt(userID))) throw new APIError("Invalid userID");

      await removeUserFromProject(
        request.server.prisma,
        request.session.uid,
        parseInt(userID),
        parseInt(projectID),
        request.session.isAdmin
      );

      return {
        response: "User has been removed from the project",
      } as RemoveUserFromProjectResponse;
    }
  );

  instance.post<AddHashRequest>(
    "/projects/:projectID/hashes",
    { preHandler: [checkAuth] },
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
        request.session.isAdmin
      );

      return { response: "Hash has been added" } as AddHashResponse;
    }
  );

  instance.delete<RemoveHashRequest>(
    "/projects/:projectID/hashes/:hashID",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID, hashID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");
      if (isNaN(parseInt(hashID))) throw new APIError("Invalid hashID");

      await removeHash(
        request.server.prisma,
        parseInt(projectID),
        parseInt(hashID),
        request.session.uid,
        request.session.isAdmin
      );

      return { response: "Hash has been removed" } as AddHashResponse;
    }
  );

  instance.get<GetHashesRequest>(
    "/projects/:projectID/hashes",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;

      if (isNaN(parseInt(projectID))) throw new APIError("Invalid projectID");

      const hashes = await getHashes(
        request.server.prisma,
        parseInt(projectID),
        request.session.uid,
        request.session.isAdmin
      );

      return { response: hashes } as GetHashesResponse;
    }
  );

  //Epic GigaCHAD route holding the whole app together. Should not be deleted under any circumstance.
  instance.get("/ping", () => "pong");

  next();
};
