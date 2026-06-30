import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { routerFuture } from "../src/router";
import SharedLocationPage from "../src/pages/SharedLocationPage";
import { MOCK_SHARE_TOKEN } from "./msw/handlers";

function renderShared(token: string) {
  render(
    <MemoryRouter initialEntries={[`/share/${token}`]} future={routerFuture}>
      <Routes>
        <Route path="/share/:token" element={<SharedLocationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SharedLocationPage", () => {
  it("renders location name and items without authentication", async () => {
    renderShared(MOCK_SHARE_TOKEN);
    expect(await screen.findByText("Fridge")).toBeInTheDocument();
    expect(screen.getByText("Nutella")).toBeInTheDocument();
    expect(screen.getByText("3017620422003")).toBeInTheDocument();
  });

  it("shows quantity as static text without edit controls", async () => {
    renderShared(MOCK_SHARE_TOKEN);
    await screen.findByText("Fridge");
    expect(screen.queryByRole("button", { name: /increase quantity/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /decrease quantity/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete item/i })).toBeNull();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows a not-found message for an unknown token", async () => {
    renderShared("unknown-token-xyz");
    expect(await screen.findByText("Link not found")).toBeInTheDocument();
  });
});
