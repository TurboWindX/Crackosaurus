import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { ThemeProvider } from "@repo/shadcn/components/theme-provider";

import { router } from "./pages/index.tsx";

import "./index.css";
import "@repo/ui/index.css";
import "@repo/shadcn/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
);
