import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./index.css";
import "@repo/shadcn/index.css";
import "@repo/ui/index.css";

import { ThemeProvider } from "@repo/shadcn/components/theme-provider";
import { Toaster } from "@repo/shadcn/components/ui/toaster";
import { APIProvider } from "@repo/ui/api";

import { router } from "./pages/index.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <APIProvider>
        <RouterProvider router={router} />
      </APIProvider>
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
);
