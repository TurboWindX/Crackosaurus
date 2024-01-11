import { createBrowserRouter } from "react-router-dom";

import { AdminRoute, AuthRoute } from "@repo/ui/auth";

import { LoginPage } from "./LoginPage.tsx";
import { ProjectPage } from "./ProjectPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { UserPage } from "./UserPage.tsx";
import { UsersPage } from "./UsersPage.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthRoute>
        <ProjectsPage />
      </AuthRoute>
    ),
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/projects",
    element: (
      <AuthRoute>
        <ProjectsPage />
      </AuthRoute>
    ),
  },
  {
    path: "/projects/:projectID",
    element: (
      <AuthRoute>
        <ProjectPage />
      </AuthRoute>
    ),
  },
  {
    path: "/users/:userID",
    element: (
      <AuthRoute>
        <UserPage />
      </AuthRoute>
    ),
  },
  {
    path: "/users",
    element: (
      <AdminRoute>
        <UsersPage />
      </AdminRoute>
    ),
  },
]);
