import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./index.css";
import "@repo/shadcn/index.css";
import "@repo/ui/index.css";

import { ThemeProvider } from "@repo/shadcn/components/theme-provider";
import { Toaster } from "@repo/shadcn/components/ui/toaster";
import { APIProvider } from "@repo/ui/api";

import config from "./config.ts";
import { router } from "./pages/index.tsx";

const queryClient = new QueryClient();

const App = () => {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <QueryClientProvider client={queryClient}>
        <APIProvider
          url={`http://${config.backend.name}:${config.backend.port}/api`}
        >
          <RouterProvider router={router} />
        </APIProvider>
      </QueryClientProvider>
      <Toaster />
    </ThemeProvider>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
