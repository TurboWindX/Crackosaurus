export const HASH_TYPES = ["NTLM", "bcrypt"] as const;
export type HashType = (typeof HASH_TYPES)[number];

export const PERMISSIONS = [
  "*",
  "root",
  "hashes:*",
  "hashes:get",
  "hashes:add",
  "hashes:remove",
  "jobs:*",
  "jobs:get",
  "jobs:add",
  "jobs:start",
  "jobs:stop",
  "projects:*",
  "projects:get",
  "projects:add",
  "projects:remove",
  "projects:users:*",
  "projects:users:get",
  "projects:users:add",
  "projects:users:remove",
  "users:*",
  "users:get",
  "users:list",
  "users:add",
  "users:edit",
  "users:remove",
] as const;
export type PermissionType = (typeof PERMISSIONS)[number];

export const PERMISSION_PROFILES = {
  admin: ["*"],
  contributor: [
    "jobs:*",
    "projects:add",
    "projects:remove",
    "projects:users:*",
    "hashes:*",
    "users:list",
  ],
  viewer: ["hashes:get"],
} satisfies Record<string, PermissionType[]>;

export const DEFAULT_PERMISSION_PROFILE: keyof typeof PERMISSION_PROFILES =
  "viewer";

export const STATUSES = ["PENDING", "STARTED", "STOPPED", "COMPLETE", "ERROR"];
export type Status = (typeof STATUSES)[number];

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

export interface GetUserRequest {
  Params: {
    userID: string;
  };
}

export interface GetUserResponse {
  response: {
    ID: string;
    username: string;
    permissions: string;
    projects?: {
      PID: string;
      name: string;
    }[];
  };
}

export interface GetUsersRequest {}

export interface GetUsersResponse {
  response: {
    ID: string;
    username: string;
    permissions: string;
  }[];
}

export interface GetUserListRequest {}

export interface GetUserListResponse {
  response: {
    ID: string;
    username: string;
  }[];
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

export interface LogoutRequest {}

export interface LogoutResponse {
  response: string;
}

export interface RegisterRequest {
  Body: {
    username: string;
    password: string;
    permissions?: PermissionType[];
  };
}

export interface RegisterResponse {
  response: string;
}

export interface DeleteUserRequest {
  Params: {
    userID: string;
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

export interface RemoveHashRequest {
  Params: {
    projectID: string;
    hashID: string;
  };
}

export interface RemoveHashResponse {
  response: string;
}

export interface CreateProjectJobsRequest {
  Params: {
    projectID: string;
  };
  Body: {
    instanceType?: string;
    provider: string;
  };
}

export interface CreateProjectJobsResponse {
  response: string[];
}

export interface GetProjectRequest {
  Params: {
    projectID: string;
  };
}

export interface GetProjectJob {
  JID: string;
  status: string;
}

export interface GetProjectResponse {
  response: {
    PID: string;
    name: string;
    members?: {
      ID: string;
      username: string;
    }[];
    hashes?: {
      HID: string;
      hash: string;
      hashType: string;
      cracked: string | null;
      job?: GetProjectJob | null;
    }[];
  };
}

export interface GetProjectsRequest {}

export interface GetProjectsResponse {
  response: {
    PID: string;
    name: string;
    members?: {
      ID: string;
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
    userID: string;
  };
}

export interface AddUserToProjectResponse {
  response: string;
}

export interface RemoveUserFromProjectRequest {
  Params: {
    projectID: string;
    userID: string;
  };
}

export interface RemoveUserFromProjectResponse {
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

export interface AuthUserRequest {}

export interface AuthUserResponse {
  uid: string;
  username: string;
  permissions: PermissionType[];
}
