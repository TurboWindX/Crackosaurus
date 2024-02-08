import {
  AddHashRequest,
  AddHashResponse,
  AddUserToProjectResponse,
  ApiError,
  AuthUserResponse,
  CreateProjectJobsResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  DeleteUserResponse,
  GetProjectResponse,
  GetProjectsResponse,
  GetUserListResponse,
  GetUserResponse,
  GetUsersResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  RegisterRequest,
  RegisterResponse,
  RemoveHashResponse,
  RemoveUserFromProjectResponse,
} from ".";

const API_URL = "http://localhost:8000/api";

type ApiResponse<T> = Promise<T & ApiError>;

async function apiMethod<Req, Res>(
  method: string,
  path: string,
  body?: Req
): Promise<Res> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers:
      body === undefined
        ? undefined
        : {
            "Content-Type": "application/json",
          },
    body: body ? JSON.stringify(body) : undefined,
  });

  return res.json() as ApiResponse<Res>;
}

async function apiGet<Res>(path: string): ApiResponse<Res> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
  });

  return res.json() as ApiResponse<Res>;
}

async function apiPost<Req, Res>(path: string, body?: Req): ApiResponse<Res> {
  return apiMethod("POST", path, body);
}

async function apiDelete<Req, Res>(path: string, body?: Req): ApiResponse<Res> {
  return apiMethod("DELETE", path, body);
}

export async function login(
  req: LoginRequest["Body"]
): ApiResponse<LoginResponse> {
  return apiPost("/auth/login", req);
}

export async function logout(): ApiResponse<LogoutResponse> {
  return apiGet("/auth/logout");
}

export async function authUser(): ApiResponse<AuthUserResponse> {
  return apiGet("/auth/user");
}

export async function getUser(id: string): ApiResponse<GetUserResponse> {
  return apiGet(`/users/${id}`);
}

export async function getUsers(): ApiResponse<GetUsersResponse> {
  return apiGet("/users");
}

export async function getUserList(): ApiResponse<GetUserListResponse> {
  return apiGet("/users/list");
}

export async function registerUser(
  req: RegisterRequest["Body"]
): ApiResponse<RegisterResponse> {
  return apiPost("/users", req);
}

export async function addProjectJobs(
  id: string,
  provider: string,
  instanceType?: string
): ApiResponse<CreateProjectJobsResponse> {
  return apiPost(`/projects/${id}/jobs`, {
    provider,
    instanceType,
  });
}

export async function deleteUser(id: string): ApiResponse<DeleteUserResponse> {
  return apiDelete(`/users/${id}`);
}

export async function getProject(id: string): ApiResponse<GetProjectResponse> {
  return apiGet(`/projects/${id}`);
}

export async function getProjects(): ApiResponse<GetProjectsResponse> {
  return apiGet("/projects");
}

export async function createProject(
  req: CreateProjectRequest["Body"]
): ApiResponse<CreateProjectResponse> {
  return apiPost("/projects", req);
}

export async function deleteProject(
  id: string
): ApiResponse<DeleteProjectResponse> {
  return apiDelete(`/projects/${id}`);
}

export async function addHashToProject(
  projectID: string,
  req: AddHashRequest["Body"]
): ApiResponse<AddHashResponse> {
  return apiPost(`/projects/${projectID}/hashes`, req);
}

export async function removeHashFromProject(
  projectID: string,
  hashID: string
): ApiResponse<RemoveHashResponse> {
  return apiDelete(`/projects/${projectID}/hashes/${hashID}`);
}

export async function addUserToProject(
  projectID: string,
  userID: string
): ApiResponse<AddUserToProjectResponse> {
  return apiPost(`/projects/${projectID}/users/${userID}`);
}

export async function removeUserFromProject(
  projectID: string,
  userID: string
): ApiResponse<RemoveUserFromProjectResponse> {
  return apiDelete(`/projects/${projectID}/users/${userID}`);
}
