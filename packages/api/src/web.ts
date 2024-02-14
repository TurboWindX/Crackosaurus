import {
  APIError,
  AddHashRequest,
  AddHashResponse,
  AddUserToProjectResponse,
  AuthUserResponse,
  CreateInstanceRequest,
  CreateInstanceResponse,
  CreateProjectJobsResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteInstanceResponse,
  DeleteProjectJobResponse,
  DeleteProjectResponse,
  DeleteUserResponse,
  GetInstanceListResponse,
  GetInstanceResponse,
  GetInstancesResponse,
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

export type APIResponse<T> = Promise<T & APIError>;

async function handleRes<Res>(res: Response): Promise<Res> {
  let json = await res.json();
  if (json.error) {
    json.error = {
      code: res.status,
      message: json.error,
    };
  }

  return json as APIResponse<Res>;
}

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

  return handleRes(res);
}

async function apiGet<Res>(path: string): APIResponse<Res> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
  });

  return handleRes(res);
}

async function apiPost<Req, Res>(path: string, body?: Req): APIResponse<Res> {
  return apiMethod("POST", path, body);
}

async function apiDelete<Req, Res>(path: string, body?: Req): APIResponse<Res> {
  return apiMethod("DELETE", path, body);
}

export async function login(
  req: LoginRequest["Body"]
): APIResponse<LoginResponse> {
  return apiPost("/auth/login", req);
}

export async function logout(): APIResponse<LogoutResponse> {
  return apiGet("/auth/logout");
}

export async function authUser(): APIResponse<AuthUserResponse> {
  return apiGet("/auth/user");
}

export async function getUser(id: string): APIResponse<GetUserResponse> {
  return apiGet(`/users/${id}`);
}

export async function getUsers(): APIResponse<GetUsersResponse> {
  return apiGet("/users");
}

export async function getUserList(): APIResponse<GetUserListResponse> {
  return apiGet("/users/list");
}

export async function registerUser(
  req: RegisterRequest["Body"]
): APIResponse<RegisterResponse> {
  return apiPost("/users", req);
}

export async function getInstance(
  instanceID: string
): APIResponse<GetInstanceResponse> {
  return apiGet(`/instances/${instanceID}`);
}

export async function getInstances(): APIResponse<GetInstancesResponse> {
  return apiGet("/instances");
}

export async function getInstanceList(): APIResponse<GetInstanceListResponse> {
  return apiGet("/instances/list");
}

export async function createInstance(
  req: CreateInstanceRequest["Body"]
): APIResponse<CreateInstanceResponse> {
  return apiPost("/instances", req);
}

export async function deleteInstance(
  instanceID: string
): APIResponse<DeleteInstanceResponse> {
  return apiDelete(`/instances/${instanceID}`);
}

export async function addProjectJobs(
  id: string,
  instanceID: string
): APIResponse<CreateProjectJobsResponse> {
  return apiPost(`/projects/${id}/jobs`, {
    instanceID,
  });
}

export async function deleteProjectJobs(
  id: string
): APIResponse<DeleteProjectJobResponse> {
  return apiDelete(`/projects/${id}/jobs`);
}

export async function deleteUser(id: string): APIResponse<DeleteUserResponse> {
  return apiDelete(`/users/${id}`);
}

export async function getProject(id: string): APIResponse<GetProjectResponse> {
  return apiGet(`/projects/${id}`);
}

export async function getProjects(): APIResponse<GetProjectsResponse> {
  return apiGet("/projects");
}

export async function createProject(
  req: CreateProjectRequest["Body"]
): APIResponse<CreateProjectResponse> {
  return apiPost("/projects", req);
}

export async function deleteProject(
  id: string
): APIResponse<DeleteProjectResponse> {
  return apiDelete(`/projects/${id}`);
}

export async function addHashToProject(
  projectID: string,
  req: AddHashRequest["Body"]
): APIResponse<AddHashResponse> {
  return apiPost(`/projects/${projectID}/hashes`, req);
}

export async function removeHashFromProject(
  projectID: string,
  hashID: string
): APIResponse<RemoveHashResponse> {
  return apiDelete(`/projects/${projectID}/hashes/${hashID}`);
}

export async function addUserToProject(
  projectID: string,
  userID: string
): APIResponse<AddUserToProjectResponse> {
  return apiPost(`/projects/${projectID}/users/${userID}`);
}

export async function removeUserFromProject(
  projectID: string,
  userID: string
): APIResponse<RemoveUserFromProjectResponse> {
  return apiDelete(`/projects/${projectID}/users/${userID}`);
}
