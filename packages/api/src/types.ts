export interface ApiError {
  error: string;
}

export interface InitRequest {
  Body: {
    username: string;
    password: string;
  };
}

export interface InitResponse {
  response: string;
}

export interface LoginRequest {
  Body: {
    username: string;
    password: string;
  };
}

export interface LoginResponse {
  response: string;
}

export interface RegisterRequest {
  Body: {
    username: string;
    password: string;
    isAdmin?: boolean;
  };
}

export interface RegisterResponse {
  response: string;
}

export interface DeleteUserRequest {
  Body: {
    username: string;
  };
}

export interface DeleteUserResponse {
  response: string;
}

export interface AddHashRequest {
  Params: {
    projectID: number;
  };
  Body: {
    hash: string;
    hashType: string;
  };
}

export interface AddHashResponse {
  response: string;
}

export interface CreateProjectRequest {
  Body: {
    projectName: string;
  };
}

export interface CreateProjectResponse {
  response: string;
}

export interface AddUserToProjectRequest {
  Params: {
    projectID: number;
  };
  Body: {
    userID: number;
  };
}

export interface AddUserToProjectResponse {
  response: string;
}

export interface GetHashesRequest {
  Params: {
    projectID: number;
  };
}

export interface GetHashesResponse {
  response: {
    hash: string;
    hashType: string;
    cracked?: string;
  }[];
}

export interface ChangePasswordRequest {
  Params: {
    userID: number;
  };
  Body: {
    oldPassword: string;
    newPassword: string;
  };
}

export interface ChangePasswordResponse {
  response: string;
}

export interface AuthUserRequest {
  Body: {}
}

export interface AuthUserResponse {
  uid: string;
  username: string;
  isAdmin: boolean;
}
