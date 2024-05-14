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

const protocol = window.location.protocol;

let hostname: string;
if (config.backend.name.length > 0 && config.backend.name !== "USE_WEB_HOST") {
  hostname = config.backend.name;
} else {
  hostname = window.location.hostname;
}

let port = "";
if (config.backend.name.length > 0 && config.backend.name !== "USE_WEB_HOST") {
  port = `:${config.backend.port}`;
} else if (window.location.port.length > 0) {
  port = `:${window.location.port}`;
}

const backendUrl = `${protocol}//${hostname}${port}/api`;

const App = () => {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <QueryClientProvider client={new QueryClient()}>
        <APIProvider url={backendUrl}>
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
