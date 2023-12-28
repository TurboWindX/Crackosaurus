import {
  createBrowserRouter
} from "react-router-dom";

import { HomePage } from "./HomePage.tsx";

export const router = createBrowserRouter([
    {
      path: "/",
      element: <HomePage />
    }
]);
