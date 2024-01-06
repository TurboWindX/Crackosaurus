import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "@repo/ui/auth";
import { ThemeProvider } from "@repo/shadcn/components/theme-provider";
import { Toaster } from "@repo/shadcn/components/ui/toaster";

import { router } from "./pages/index.tsx";

import "./index.css";
import "@repo/ui/index.css";
import "@repo/shadcn/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
        <RouterProvider router={router} />
        <Toaster />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
