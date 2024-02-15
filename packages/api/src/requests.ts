import { PermissionType } from "./auth";

export interface APIError {
  error: {
    code: number;
    message: string;
  };
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

export interface GetInstanceRequest {
  Params: {
    instanceID: string;
  };
}

export interface GetInstanceResponse {
  response: {
    IID: string;
    name?: string | null;
    tag: string;
    status: string;
    updatedAt: Date;
    jobs: {
      JID: string;
      status: string;
      updatedAt: Date;
    }[];
  };
}

export interface GetInstancesRequest {}

export interface GetInstancesResponse {
  response: {
    IID: string;
    name?: string | null;
    status: string;
    updatedAt: Date;
  }[];
}

export interface GetInstanceListRequest {}

export interface GetInstanceListResponse {
  response: {
    IID: string;
    name?: string | null;
  }[];
}

export interface DeleteInstanceRequest {
  Params: {
    instanceID: string;
  };
}

export interface DeleteInstanceResponse {
  response: any;
}

export interface CreateInstanceRequest {
  Body: {
    name?: string;
    type?: string;
  };
}

export interface CreateInstanceResponse {
  response: string;
}

export interface CreateInstanceJobRequest {
  Params: {
    instanceID: string;
  };
  Body: {
    hashType: string;
    projectIDs: string[];
  };
}

export interface CreateInstanceJobsResponse {
  response: string;
}

export interface DeleteInstanceJobRequest {
  Params: {
    instanceID: string;
    jobID: string;
  };
  Body: {};
}

export interface DeleteInstanceJobResponse {
  response: string;
}

export interface GetProjectRequest {
  Params: {
    projectID: string;
  };
}

export interface GetProjectJob {
  JID: string;
  status: string;
  updatedAt: Date;
  instance: {
    IID: string;
    name?: string | null;
  };
}

export interface GetProjectResponse {
  response: {
    PID: string;
    name: string;
    updatedAt: Date;
    members?: {
      ID: string;
      username: string;
    }[];
    hashes?: {
      HID: string;
      hash: string;
      hashType: string;
      status: string;
      jobs: GetProjectJob[];
    }[];
  };
}

export interface GetProjectsRequest {}

export interface GetProjectsResponse {
  response: {
    PID: string;
    name: string;
    updatedAt: Date;
    members?: {
      ID: string;
      username: string;
    }[];
  }[];
}

export interface GetProjectListRequest {}

export interface GetProjectListResponse {
  response: {
    PID: string;
    name: string;
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
