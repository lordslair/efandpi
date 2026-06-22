// Pattern B — form integration test (real AuthProvider + MSW)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import { renderWithProviders } from "./test-utils";
import LoginPage from "../src/pages/LoginPage";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

// Capture navigate calls without replacing the whole react-router-dom module
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  mockNavigate.mockReset();
});

function renderLoginPage() {
  return renderWithProviders(<LoginPage />);
}

// The page has two "Sign In" buttons: the tab and the form submit button.
// Use this helper to get the submit button unambiguously.
function getSubmitButton() {
  return screen.getAllByRole("button").find(
    (btn) => btn.getAttribute("type") === "submit"
  ) as HTMLButtonElement;
}

describe("LoginPage rendering", () => {
  it("shows Sign In tab active by default", () => {
    renderLoginPage();
    // In login mode: submit button says "Sign In", NOT "Create Account"
    expect(getSubmitButton().textContent).toBe("Sign In");
    expect(screen.queryByRole("button", { name: "Create Account" })).not.toBeInTheDocument();
  });

  it("shows email and password inputs", () => {
    renderLoginPage();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("switches to Sign Up mode when the tab is clicked", async () => {
    renderLoginPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(
      screen.getByRole("button", { name: "Create Account" })
    ).toBeInTheDocument();
  });
});

describe("Login flow", () => {
  it("stores the token and navigates to / on successful login", async () => {
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "secret");
    await user.click(getSubmitButton());

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    expect(localStorage.getItem("token")).toBe("test-access-token");
  });

  it("shows the server error message on 401", async () => {
    server.use(
      http.post(api("/auth/token"), () =>
        HttpResponse.json({ detail: "Incorrect email or password" }, { status: 401 })
      )
    );
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("you@example.com"), "bad@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "wrong");
    await user.click(getSubmitButton());

    expect(
      await screen.findByText("Incorrect email or password")
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows 'Please wait…' while loading", async () => {
    // Delay the response so we can observe the loading state
    server.use(
      http.post(api("/auth/token"), async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ access_token: "tok", token_type: "bearer" });
      })
    );
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");

    const submit = getSubmitButton();
    await user.click(submit);

    // Loading state
    expect(await screen.findByRole("button", { name: "Please wait…" })).toBeDisabled();
    // Then it resolves
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
  });
});

describe("Register flow", () => {
  it("creates an account, stores the token and navigates to /", async () => {
    renderLoginPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByPlaceholderText("you@example.com"), "new@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "secret");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    expect(localStorage.getItem("token")).toBe("test-access-token");
  });

  it("shows the server error on register failure", async () => {
    server.use(
      http.post(api("/auth/register"), () =>
        HttpResponse.json({ detail: "Email already registered" }, { status: 400 })
      )
    );
    renderLoginPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByPlaceholderText("you@example.com"), "dup@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "secret");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
