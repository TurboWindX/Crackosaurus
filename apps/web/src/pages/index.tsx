import { createBrowserRouter } from "react-router-dom";

import { LoginPage } from "./LoginPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { AuthRoute } from "@repo/ui/auth";
import { AccountPage } from "./AccountPage.tsx";

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
    path: "/account",
    element: (
      <AuthRoute>
        <AccountPage />
      </AuthRoute>
    ),
  },
  {
    path: "/projects",
    element: (
      <AuthRoute>
        <ProjectsPage />
      </AuthRoute>
    ),
  },
]);
