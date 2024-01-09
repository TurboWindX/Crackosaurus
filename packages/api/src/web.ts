import { AddHashRequest, AddHashResponse, ApiError, AuthUserResponse, CreateProjectRequest, CreateProjectResponse, DeleteProjectResponse, GetProjectResponse, GetProjectsResponse, HashType, LoginRequest, LoginResponse } from ".";

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
    headers: {
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

export async function authUser(): ApiResponse<AuthUserResponse> {
  return apiGet("/auth/user");
}

export async function getProject(id: number): ApiResponse<GetProjectResponse> {
  return apiGet(`/projects/${id}`);
}

export async function getProjects(): ApiResponse<GetProjectsResponse>  {
  return apiGet("/projects");
}

export async function createProject(req: CreateProjectRequest["Body"]): ApiResponse<CreateProjectResponse> {
  return apiPost("/projects", req);
}

export async function deleteProject(id: number): ApiResponse<DeleteProjectResponse> {
  return apiDelete(`/projects/${id}`);
}

export async function addHashToProject(projectID: number, req: AddHashRequest["Body"]): ApiResponse<AddHashResponse> {
  return apiPost(`/projects/${projectID}/hashes`, req);
}
