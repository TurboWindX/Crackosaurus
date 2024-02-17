/**
 * All contexts MUST BE in a separate file not to break Vite HMR.
 *
 * Avoid modifying this file while running the page (your browser will likely go in a very memory intensive error loop).
 *
 * https://github.com/vitejs/vite/issues/3301
 */
import { createContext } from "react";

import { type PermissionType } from "@repo/api";
import { type APIType } from "@repo/api/server";
import { REQ } from "@repo/api/server/client/web";

export interface AuthInterface {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly uid: string;
  readonly username: string;
  readonly init: (req: REQ<APIType["init"]>) => Promise<any>;
  readonly login: (req: REQ<APIType["login"]>) => Promise<any>;
  readonly logout: (req: REQ<APIType["logout"]>) => Promise<any>;
  readonly hasPermission: (permission: PermissionType) => boolean;
}

export const AuthContext = createContext<AuthInterface>({
  isLoading: true,
  isAuthenticated: false,
  uid: "",
  username: "",
  init: async () => false,
  login: async () => false,
  logout: async () => false,
  hasPermission: () => false,
});

export const APIContext = createContext<APIType>(undefined as any);
