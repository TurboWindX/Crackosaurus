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

export interface GetUserRequest {
  Params: {
    userID: string;
  };
}

export interface GetUserResponse {
  response: {
    ID: number;
    username: string;
    isAdmin: boolean;
    projects: {
      PID: number;
      name: string;
    }[];
  };
}

export interface GetUsersRequest {}

export interface GetUsersResponse {
  response: {
    ID: number;
    username: string;
    isAdmin: boolean;
  }[];
}

export interface GetUserListRequest {}

export interface GetUserListResponse {
  response: {
    ID: number;
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

export interface AuthUserRequest {
  Body: {};
}

export interface AuthUserResponse {
  uid: string;
  username: string;
  isAdmin: boolean;
}
