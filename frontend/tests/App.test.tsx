// Pattern D — routing tests (real AuthProvider + real MSW)
//
// App uses BrowserRouter internally; jsdom's window.location is shared across
// tests in the same file, so we reset it to "/" in beforeEach.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App";

beforeEach(() => {
  // Reset jsdom's URL to "/" so BrowserRouter always starts at the home route.
  window.history.pushState({}, "", "/");
});

describe("App routing — unauthenticated", () => {
  it("redirects / to /login and shows the login form", () => {
    render(<App />);
    // LoginPage has a branded heading and the sign-in form
    expect(screen.getByRole("heading", { name: "EfanDpi" })).toBeInTheDocument();
    // email input is unique to LoginPage
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("shows both Sign In and Sign Up tabs", () => {
    render(<App />);
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toContain("Sign In");
    expect(labels).toContain("Sign Up");
  });
});

describe("App routing — authenticated", () => {
  it("renders the home page (My Locations) when a token is set", async () => {
    localStorage.setItem("token", "test-token");
    render(<App />);
    expect(await screen.findByText("My Locations")).toBeInTheDocument();
  });
});

describe("App routing — public share", () => {
  it("renders SharedLocationPage at /share/:token without auth", async () => {
    window.history.pushState({}, "", "/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    render(<App />);
    expect(await screen.findByText("Fridge")).toBeInTheDocument();
    expect(screen.getByText("Nutella")).toBeInTheDocument();
  });

  it("shows not-found state for an unknown token", async () => {
    window.history.pushState({}, "", "/share/unknown-token-xyz");
    render(<App />);
    expect(await screen.findByText("Link not found")).toBeInTheDocument();
  });
});
