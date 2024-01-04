import {
  createBrowserRouter
} from "react-router-dom";

import { HomePage } from "./HomePage.tsx";
import { LoginPage } from "./LoginPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />
  },
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/projects",
    element: <ProjectsPage />
  }
]);
