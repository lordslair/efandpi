// Pattern B — component integration test (real api/client.ts + MSW)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import ShareModal from "../src/components/ShareModal";
import { MOCK_SHARE_TOKEN } from "./msw/handlers";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

function renderModal() {
  const onClose = vi.fn();
  render(<ShareModal locationId={1} onClose={onClose} />);
  return { onClose };
}

describe("ShareModal — loading and rendering", () => {
  it("shows a loading state before the share link resolves", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: "Copy share link" })).not.toBeInTheDocument();
  });

  it("shows the share URL once the link is created", async () => {
    renderModal();
    expect(await screen.findByText(new RegExp(MOCK_SHARE_TOKEN))).toBeInTheDocument();
  });

  it("shows an error message when creating the share link fails", async () => {
    server.use(
      http.post(api("/locations/:id/share"), () =>
        HttpResponse.json({ detail: "Location not found" }, { status: 404 })
      )
    );
    renderModal();

    expect(await screen.findByText("Location not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy share link" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Regenerate link/)).not.toBeInTheDocument();
    // Close is still available so the user isn't stuck
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("ShareModal — copy link", () => {
  const originalClipboard = navigator.clipboard;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
  });

  function stubClipboard() {
    // userEvent.setup() lazily initializes jsdom's own Clipboard implementation,
    // which clobbers any stub assigned beforehand — so this must run *after* setup().
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  it("copies the share URL to the clipboard and shows a confirmation", async () => {
    const user = userEvent.setup();
    stubClipboard();
    renderModal();
    await screen.findByText(new RegExp(MOCK_SHARE_TOKEN));

    await user.click(screen.getByRole("button", { name: "Copy share link" }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/share/${MOCK_SHARE_TOKEN}`
    );
    expect(await screen.findByText("✓ Copied!")).toBeInTheDocument();
  });
});

describe("ShareModal — regenerate link", () => {
  it("replaces the share URL with the new token on success", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText(new RegExp(MOCK_SHARE_TOKEN));

    await user.click(screen.getByRole("button", { name: /Regenerate link/i }));

    expect(
      await screen.findByText(/11111111-2222-3333-4444-555555555555/)
    ).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(MOCK_SHARE_TOKEN))).not.toBeInTheDocument();
  });

  it("shows a Regenerating… state while the request is in flight", async () => {
    server.use(
      http.post(api("/locations/:id/share/regenerate"), async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ token: "11111111-2222-3333-4444-555555555555" });
      })
    );
    const user = userEvent.setup();
    renderModal();
    await screen.findByText(new RegExp(MOCK_SHARE_TOKEN));

    await user.click(screen.getByRole("button", { name: /Regenerate link/i }));

    expect(await screen.findByRole("button", { name: "Regenerating…" })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText(/11111111-2222-3333-4444-555555555555/)).toBeInTheDocument()
    );
  });

  it("shows an error message in place of the link when regeneration fails", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText(new RegExp(MOCK_SHARE_TOKEN));

    server.use(
      http.post(api("/locations/:id/share/regenerate"), () =>
        HttpResponse.json({ detail: "Could not regenerate link" }, { status: 500 })
      )
    );
    await user.click(screen.getByRole("button", { name: /Regenerate link/i }));

    expect(await screen.findByText("Could not regenerate link")).toBeInTheDocument();
    // The component swaps the whole panel to the error view — the old link is no longer shown
    expect(screen.queryByText(new RegExp(MOCK_SHARE_TOKEN))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("ShareModal — close", () => {
  it("calls onClose when Close is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByText(new RegExp(MOCK_SHARE_TOKEN));

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
