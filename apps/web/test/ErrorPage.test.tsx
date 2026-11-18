import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ErrorPage } from "../src/pages/ErrorPage";

// Without an i18n provider react-i18next's `t` echoes the key, so we assert on
// structure (a link back to the app root) rather than translated copy.
describe("ErrorPage", () => {
  it("renders a link back to the home route", () => {
    render(
      <MemoryRouter>
        <ErrorPage />
      </MemoryRouter>
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
  });
});
