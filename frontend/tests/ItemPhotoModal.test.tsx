// Pattern B — component integration test (real api/client.ts + MSW)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import ItemPhotoModal from "../src/components/ItemPhotoModal";
import type { Item } from "../src/api/client";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

// ImageCropModal has its own dedicated test suite (ImageCropModal.test.tsx);
// here we only care that selecting a file routes through it before the final
// file is used, so it's stubbed with a minimal confirm/cancel UI.
vi.mock("../src/components/ImageCropModal", () => ({
  default: ({
    file,
    onCancel,
    onComplete,
  }: {
    file: File;
    onCancel: () => void;
    onComplete: (f: File) => void;
  }) => (
    <div>
      <p>Mock crop modal</p>
      <button onClick={() => onComplete(file)}>Confirm crop (mock)</button>
      <button onClick={onCancel}>Cancel crop (mock)</button>
    </div>
  ),
}));

const BASE_ITEM: Item = {
  id: 1,
  barcode: "3017620422003",
  name: "Nutella",
  brand: "Ferrero",
  quantity: 3,
  thumbnail_url: "https://example.com/off-thumb.jpg",
  custom_image_url: null,
  starred: false,
  added_at: "2026-01-01T00:00:00Z",
};

const originalCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-preview");
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
});

function renderModal(itemOverrides: Partial<Item> = {}) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const item = { ...BASE_ITEM, ...itemOverrides };
  render(
    <ItemPhotoModal locationId={1} item={item} onClose={onClose} onUpdated={onUpdated} />
  );
  return { onClose, onUpdated, item };
}

async function selectPhoto(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByLabelText("Product photo"), file);
  // Selecting a file opens the (mocked) crop modal; confirm through it.
  await user.click(screen.getByRole("button", { name: "Confirm crop (mock)" }));
  return file;
}

// The preview <img> has alt="" (decorative), so it has no accessible "img"
// role — query it directly instead of via screen.getByRole.
function getPreviewImg(): HTMLImageElement {
  return document.querySelector("img") as HTMLImageElement;
}

describe("ItemPhotoModal — rendering", () => {
  it("shows the thumbnail_url as the preview when there is no custom photo", () => {
    renderModal();
    expect(getPreviewImg()).toHaveAttribute(
      "src",
      "https://example.com/off-thumb.jpg"
    );
  });

  it("shows the custom_image_url as the preview when one is already set", () => {
    renderModal({ custom_image_url: "https://example.com/custom.jpg" });
    expect(getPreviewImg()).toHaveAttribute(
      "src",
      "https://example.com/custom.jpg"
    );
  });

  it("does not show a Remove button when there is no custom photo yet", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows a Remove button when a custom photo is already set", () => {
    renderModal({ custom_image_url: "https://example.com/custom.jpg" });
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("disables Save until a file is chosen", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("ItemPhotoModal — choosing a file", () => {
  it("opens the crop modal instead of immediately updating the preview", async () => {
    const user = userEvent.setup();
    renderModal();

    const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Product photo"), file);

    expect(screen.getByText("Mock crop modal")).toBeInTheDocument();
    // The whole photo modal (and its Save button) is swapped out while cropping
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("enables Save and swaps the preview once cropping is confirmed", async () => {
    const user = userEvent.setup();
    renderModal();

    await selectPhoto(user);

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(getPreviewImg()).toHaveAttribute("src", "blob:mock-preview");
  });

  it("leaves the photo unchanged when the crop step is cancelled", async () => {
    const user = userEvent.setup();
    renderModal();

    const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Product photo"), file);
    await user.click(screen.getByRole("button", { name: "Cancel crop (mock)" }));

    expect(screen.queryByText("Mock crop modal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("ItemPhotoModal — save flow", () => {
  it("uploads the photo and reports the updated item on success", async () => {
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal();

    await selectPhoto(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ custom_image_url: "https://example.com/custom.jpg" })
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a Saving… state while the upload is in flight", async () => {
    server.use(
      http.post(api("/locations/:id/items/:itemId/image"), async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ ...BASE_ITEM, custom_image_url: "https://example.com/custom.jpg" });
      })
    );
    const user = userEvent.setup();
    renderModal();

    await selectPhoto(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows an error and keeps the modal open when the upload fails", async () => {
    server.use(
      http.post(api("/locations/:id/items/:itemId/image"), () =>
        HttpResponse.json({ detail: "Unsupported image type. Use JPEG, PNG, or WebP." }, { status: 400 })
      )
    );
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal();

    await selectPhoto(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Unsupported image type. Use JPEG, PNG, or WebP.")
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("ItemPhotoModal — remove flow", () => {
  it("removes the photo and reports the updated item on success", async () => {
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal({
      custom_image_url: "https://example.com/custom.jpg",
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ custom_image_url: null })
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an error and keeps the modal open when removal fails", async () => {
    server.use(
      http.delete(api("/locations/:id/items/:itemId/image"), () =>
        HttpResponse.json({ detail: "Item not found" }, { status: 404 })
      )
    );
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal({
      custom_image_url: "https://example.com/custom.jpg",
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Item not found")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("ItemPhotoModal — cancel", () => {
  it("calls onClose without calling the API when Cancel is clicked", async () => {
    let uploadCalled = false;
    server.use(
      http.post(api("/locations/:id/items/:itemId/image"), () => {
        uploadCalled = true;
        return HttpResponse.json(BASE_ITEM);
      })
    );
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await selectPhoto(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(uploadCalled).toBe(false);
  });
});
