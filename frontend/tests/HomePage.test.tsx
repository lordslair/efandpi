// Pattern B/E — page integration test (real AuthProvider + MSW)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import { renderWithProviders } from "./test-utils";
import HomePage from "../src/pages/HomePage";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  // Pages behind ProtectedRoute are always rendered with a token
  localStorage.setItem("token", "test-token");
  mockNavigate.mockReset();
});

function renderHomePage() {
  return renderWithProviders(<HomePage />);
}

describe("HomePage — loading and empty state", () => {
  it("shows 'My Locations' heading", async () => {
    renderHomePage();
    expect(await screen.findByText("My Locations")).toBeInTheDocument();
  });

  it("shows empty state when there are no locations", async () => {
    renderHomePage();
    expect(await screen.findByText("No locations yet")).toBeInTheDocument();
  });
});

describe("HomePage — location list", () => {
  beforeEach(() => {
    server.use(
      http.get(api("/locations"), () =>
        HttpResponse.json([
          { id: 1, name: "Fridge", created_at: "2026-01-01T00:00:00Z" },
          { id: 2, name: "Pantry", created_at: "2026-01-01T00:00:00Z" },
        ])
      )
    );
  });

  it("renders a card for each location", async () => {
    renderHomePage();
    expect(await screen.findByText("Fridge")).toBeInTheDocument();
    expect(screen.getByText("Pantry")).toBeInTheDocument();
  });

  it("navigates to /location/:id when a location card is clicked", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("Fridge");
    await user.click(screen.getByRole("button", { name: /Fridge/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/location/1",
      expect.objectContaining({ state: { name: "Fridge" } })
    );
  });
});

describe("HomePage — add location modal", () => {
  it("opens the modal when Add is clicked", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("My Locations");

    await user.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.getByText("New Location")).toBeInTheDocument();
  });

  it("creates a new location and shows it in the list", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("My Locations");

    await user.click(screen.getByRole("button", { name: /\+ Add/i }));
    await user.type(screen.getByPlaceholderText(/Fridge, Pantry/i), "Cellar");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Cellar")).toBeInTheDocument();
    // Modal should close
    expect(screen.queryByText("New Location")).not.toBeInTheDocument();
  });

  it("disables Create when the name input is empty", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("My Locations");

    await user.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("closes the modal when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("My Locations");

    await user.click(screen.getByRole("button", { name: /\+ Add/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("New Location")).not.toBeInTheDocument();
  });
});

describe("HomePage — delete location", () => {
  beforeEach(() => {
    server.use(
      http.get(api("/locations"), () =>
        HttpResponse.json([{ id: 1, name: "Fridge", created_at: "2026-01-01T00:00:00Z" }])
      )
    );
  });

  it("shows the delete confirmation modal when ✕ is clicked", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("Fridge");

    await user.click(screen.getByRole("button", { name: "Delete location" }));
    expect(screen.getByText("Delete location?")).toBeInTheDocument();
  });

  it("removes the location from the list after confirming deletion", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("Fridge");

    await user.click(screen.getByRole("button", { name: "Delete location" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Fridge")).not.toBeInTheDocument()
    );
    expect(screen.getByText("No locations yet")).toBeInTheDocument();
  });

  it("cancels deletion and keeps the location", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("Fridge");

    await user.click(screen.getByRole("button", { name: "Delete location" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Fridge")).toBeInTheDocument();
    expect(screen.queryByText("Delete location?")).not.toBeInTheDocument();
  });
});

describe("HomePage — logout", () => {
  it("calls logout when Sign out is clicked", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await screen.findByText("My Locations");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    // Token is removed from localStorage after logout
    expect(localStorage.getItem("token")).toBeNull();
  });
});
