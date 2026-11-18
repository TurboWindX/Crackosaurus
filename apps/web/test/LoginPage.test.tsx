jest.mock("@repo/ui/api");
jest.mock("@repo/ui/auth");
jest.mock("@repo/ui/errors");

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { useErrors } from "@repo/ui/errors";

import { LoginPage } from "../src/pages/LoginPage";

// Without an i18n provider react-i18next's `t` echoes the key, so labels read as
// their translation keys (e.g. "item.username.singular").
const login = jest.fn();

beforeEach(() => {
  login.mockReset().mockResolvedValue({ status: "OK" });
  (useTRPC as jest.Mock).mockReturnValue({
    useContext: () => ({
      auth: { get: { fetch: jest.fn().mockResolvedValue(undefined) } },
    }),
    auth: { login: { useMutation: () => ({ mutateAsync: login }) } },
  });
  (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: false });
  (useErrors as jest.Mock).mockReturnValue({ handleError: jest.fn() });
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  it("renders username and password fields", () => {
    renderLogin();
    expect(
      screen.getByLabelText("item.username.singular")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("item.password.singular")
    ).toBeInTheDocument();
  });

  it("submits the entered credentials to the login mutation", async () => {
    const { container } = renderLogin();
    fireEvent.change(screen.getByLabelText("item.username.singular"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("item.password.singular"), {
      target: { value: "s3cret" },
    });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        username: "alice",
        password: "s3cret",
        mfaCode: undefined,
      })
    );
  });

  it("reveals the MFA code field when the server requires a second factor", async () => {
    login.mockResolvedValue({ status: "MFA_REQUIRED" });
    const { container } = renderLogin();
    fireEvent.change(screen.getByLabelText("item.username.singular"), {
      target: { value: "bob" },
    });
    fireEvent.change(screen.getByLabelText("item.password.singular"), {
      target: { value: "pw" },
    });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() =>
      expect(screen.getByLabelText("Authentication code")).toBeInTheDocument()
    );
  });
});
