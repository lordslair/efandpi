// Pattern A — context unit test (api module mocked, no network)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, requireAuthContext, useAuth } from "../src/hooks/useAuth";
import * as apiClient from "../src/api/client";

vi.mock("../src/api/client");

const mockedLogin = vi.mocked(apiClient.login);
const mockedRegister = vi.mocked(apiClient.register);

beforeEach(() => {
  mockedLogin.mockResolvedValue("test-token");
  mockedRegister.mockResolvedValue({ id: 1, email: "a@b.com", created_at: "" });
});

// Minimal consumer that exposes auth state for assertions
function Consumer() {
  const { token, login, register, logout } = useAuth();
  return (
    <>
      <span data-testid="token">{token ?? "none"}</span>
      <button onClick={() => login("a@b.com", "pw")}>Login</button>
      <button onClick={() => register("a@b.com", "pw")}>Register</button>
      <button onClick={logout}>Logout</button>
    </>
  );
}

function renderConsumer() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

describe("AuthProvider initial state", () => {
  it("token is null when localStorage is empty", () => {
    renderConsumer();
    expect(screen.getByTestId("token").textContent).toBe("none");
  });

  it("initializes token from localStorage", () => {
    localStorage.setItem("token", "stored-token");
    renderConsumer();
    expect(screen.getByTestId("token").textContent).toBe("stored-token");
  });
});

describe("login()", () => {
  it("calls api.login, stores token in localStorage and updates state", async () => {
    const user = userEvent.setup();
    renderConsumer();

    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() =>
      expect(screen.getByTestId("token").textContent).toBe("test-token")
    );
    expect(localStorage.getItem("token")).toBe("test-token");
    expect(mockedLogin).toHaveBeenCalledWith("a@b.com", "pw");
  });

  it("propagates errors thrown by api.login", async () => {
    mockedLogin.mockRejectedValue(new Error("Incorrect email or password"));
    const user = userEvent.setup();

    let caughtError: Error | null = null;
    function ErrorConsumer() {
      const { login } = useAuth();
      return (
        <button
          onClick={() => login("a@b.com", "pw").catch((e: Error) => { caughtError = e; })}
        >
          Login
        </button>
      );
    }

    render(<AuthProvider><ErrorConsumer /></AuthProvider>);
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => expect(caughtError?.message).toBe("Incorrect email or password"));
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("register()", () => {
  it("calls api.register then api.login, stores token and updates state", async () => {
    const user = userEvent.setup();
    renderConsumer();

    await user.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(screen.getByTestId("token").textContent).toBe("test-token")
    );
    expect(mockedRegister).toHaveBeenCalledWith("a@b.com", "pw");
    expect(mockedLogin).toHaveBeenCalledWith("a@b.com", "pw");
    expect(localStorage.getItem("token")).toBe("test-token");
  });
});

describe("logout()", () => {
  it("removes token from localStorage and resets state to null", async () => {
    localStorage.setItem("token", "existing-token");
    const user = userEvent.setup();
    renderConsumer();

    expect(screen.getByTestId("token").textContent).toBe("existing-token");
    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(screen.getByTestId("token").textContent).toBe("none");
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("requireAuthContext()", () => {
  it("throws when context is null", () => {
    expect(() => requireAuthContext(null)).toThrow(
      "useAuth must be used within AuthProvider"
    );
  });
});
