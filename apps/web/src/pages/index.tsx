import { Outlet, createBrowserRouter } from "react-router-dom";

import { AuthProvider, AuthRoute, PermissionRoute } from "@repo/ui/auth";
import { Header } from "@repo/ui/header";

import { HomePage } from "./HomePage.tsx";
import { InstancePage } from "./InstancePage.tsx";
import { InstancesPage } from "./InstancesPage.tsx";
import { LoginPage } from "./LoginPage.tsx";
import { ProjectPage } from "./ProjectPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { SetupPage } from "./SetupPage.tsx";
import { UserPage } from "./UserPage.tsx";
import { UsersPage } from "./UsersPage.tsx";

export const router = createBrowserRouter([
  {
    errorElement: <h1>Something went wrong...</h1>,
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      {
        path: "/setup",
        element: <SetupPage />,
      },
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
                <HomePage />
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
          {
            path: "instances",
            element: (
              <PermissionRoute permission="instances:get">
                <InstancesPage />
              </PermissionRoute>
            ),
          },
          {
            path: "instances/:instanceID",
            element: (
              <PermissionRoute permission="instances:get">
                <InstancePage />
              </PermissionRoute>
            ),
          },
        ],
      },
    ],
  },
]);
