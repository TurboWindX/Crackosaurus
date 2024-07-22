/**
 * All contexts MUST BE in a separate file not to break Vite HMR.
 *
 * Avoid modifying this file while running the page (your browser will likely go in a very memory intensive error loop).
 *
 * https://github.com/vitejs/vite/issues/3301
 */
import { createContext } from "react";

import { type PermissionType } from "@repo/api";

export interface AuthInterface {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly uid: string;
  readonly username: string;
  readonly hasPermission: (permission: PermissionType) => boolean;
}

export const AuthContext = createContext<AuthInterface>({
  isLoading: true,
  isAuthenticated: false,
  uid: "",
  username: "",
  hasPermission: () => false,
});

export interface UploadInterface {
  readonly wordlist: (file: File) => Promise<string | null>;
}

export const UploadContext = createContext<UploadInterface>({
  wordlist: async () => null,
});
