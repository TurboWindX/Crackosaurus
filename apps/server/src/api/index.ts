import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import {
  getAuthenticatedUser,
  AuthenticatedUser,
  createUser,
  deleteUser,
  changePassword,
  checkNoUsers,
} from "./users"; // Import the checkCreds function
import {
  AddHashRequest,
  AddHashResponse,
  AddUserToProjectRequest,
  AddUserToProjectResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteUserRequest,
  DeleteUserResponse,
  GetHashesRequest,
  GetHashesResponse,
  InitRequest,
  InitResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from "@repo/api";
import { addHash, getHashes } from "./hashes";
import { addUserToProject, createProject } from "./projects";
import { APIError, AuthError, errorHandler } from "../errors";

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

  instance.get("/auth/user", (request) => {
    return {
      uid: request.session.uid,
      username: request.session.username,
      isAdmin: request.session.isAdmin
    };
  });

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

      return { response: "The user has been created" } as RegisterResponse;
    }
  );

  instance.delete<DeleteUserRequest>(
    "/users",
    { preHandler: [checkAdmin] },
    async (request) => {
      const { username } = request.body;
      if (username === undefined) throw new APIError("Invalid username");

      await deleteUser(request.server.prisma, username);

      return { response: "The user has been obliterated into oblivion" } as DeleteUserResponse;
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

      await changePassword(
        request.server.prisma,
        userID,
        oldPassword,
        newPassword,
        request.session.isAdmin
      );

      return { response: "Password has been changed" } as ChangePasswordResponse;
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

      return { response: "The project has been created" } as CreateProjectResponse;
    }
  );

  instance.post<AddUserToProjectRequest>(
    "/projects/:projectID/users",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;
      const { userID } = request.body;
      if (userID === undefined) throw new APIError("Invalid user ID");

      await addUserToProject(
        request.server.prisma,
        request.session.uid,
        userID,
        projectID
      );

      return { response: "The user has been added to the project" } as AddUserToProjectResponse;
    }
  );

  instance.post<AddHashRequest>(
    "/projects/:projectID/hashes",
    { preHandler: [checkAuth] },
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
        request.session.isAdmin
      );

      return { response: "The hash has been added" } as AddHashResponse;
    }
  );

  instance.get<GetHashesRequest>(
    "/projects/:projectID/hashes",
    { preHandler: [checkAuth] },
    async (request) => {
      const { projectID } = request.params;

      const hashes = await getHashes(
        request.server.prisma,
        projectID,
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
