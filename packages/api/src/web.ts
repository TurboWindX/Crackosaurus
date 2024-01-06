import { ApiError, AuthUserResponse, LoginRequest, LoginResponse } from ".";

const API_URL = "http://localhost:8000/api";

type ApiResponse<T> = Promise<T & ApiError>;

async function apiMethod<Req, Res>(
  method: string,
  path: string,
  body: Req
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

async function apiPost<Req, Res>(path: string, body: Req): ApiResponse<Res> {
  return apiMethod("POST", path, body);
}

export async function login(
  req: LoginRequest["Body"]
): ApiResponse<LoginResponse> {
  return apiPost("/auth/login", req);
}

export async function authUser(): ApiResponse<AuthUserResponse> {
  return apiGet("/auth/user");
}
