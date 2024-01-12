import { Outlet, createBrowserRouter } from "react-router-dom";

import { ThemeProvider } from "@repo/shadcn/components/theme-provider";
import { Toaster } from "@repo/shadcn/components/ui/toaster";
import { APIProvider } from "@repo/ui/api";
import { AuthRoute, PermissionRoute } from "@repo/ui/auth";
import { Header } from "@repo/ui/header";

import { LoginPage } from "./LoginPage.tsx";
import { ProjectPage } from "./ProjectPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { UserPage } from "./UserPage.tsx";
import { UsersPage } from "./UsersPage.tsx";

export const router = createBrowserRouter([
  {
    errorElement: <h1>Something went wrong...</h1>,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/",
        element: (
          <>
            <Header />
            <Outlet />
          </>
        ),
        children: [
          {
            path: "",
            element: (
              <AuthRoute>
                <ProjectsPage />
              </AuthRoute>
            ),
          },
          {
            path: "projects",
            element: (
              <AuthRoute>
                <ProjectsPage />
              </AuthRoute>
            ),
          },
          {
            path: "projects/:projectID",
            element: (
              <AuthRoute>
                <ProjectPage />
              </AuthRoute>
            ),
          },
          {
            path: "users/:userID",
            element: (
              <AuthRoute>
                <UserPage />
              </AuthRoute>
            ),
          },
          {
            path: "users",
            element: (
              <PermissionRoute permission="users:get">
                <UsersPage />
              </PermissionRoute>
            ),
          },
        ],
      },
    ]
  }
]);
