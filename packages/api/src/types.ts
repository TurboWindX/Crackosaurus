export const HASH_TYPES = ["NTLM", "bcrypt"] as const;
export type HashType = (typeof HASH_TYPES)[number];

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
    projectID: string;
  };
  Body: {
    hash: string;
    hashType: string;
  };
}

export interface AddHashResponse {
  response: string;
}

export interface GetProjectRequest {
  Params: {
    projectID: string;
  };
}

export interface GetProjectResponse {
  response: {
    PID: number;
    name: string;
    members: {
      ID: number;
      username: string;
    }[];
    hashes: {
      HID: number;
      hash: string;
      hashType: string;
      cracked: string | null;
    }[];
  };
}

export interface GetProjectsRequest {
  Body: {};
}

export interface GetProjectsResponse {
  response: {
    PID: number;
    name: string;
    members: {
      ID: number;
      username: string;
    }[];
  }[];
}

export interface CreateProjectRequest {
  Body: {
    projectName: string;
  };
}

export interface CreateProjectResponse {
  response: string;
}

export interface DeleteProjectRequest {
  Params: {
    projectID: string;
  };
}

export interface DeleteProjectResponse {
  response: string;
}

export interface AddUserToProjectRequest {
  Params: {
    projectID: string;
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
    projectID: string;
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
    userID: string;
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
  Body: {};
}

export interface AuthUserResponse {
  uid: string;
  username: string;
  isAdmin: boolean;
}
