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
import "./translation.ts";

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

const backendUrl = `${protocol}//${hostname}${port}`;

const App = () => {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <APIProvider url={backendUrl}>
        <RouterProvider router={router} />
      </APIProvider>
      <Toaster />
    </ThemeProvider>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
