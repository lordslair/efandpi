// Pattern B — component integration test (real api/client.ts + MSW)
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import ItemDetailModal from "../src/components/ItemDetailModal";
import type { Item } from "../src/api/client";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

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

function renderModal(itemOverrides: Partial<Item> = {}) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onEditPhoto = vi.fn();
  const onDelete = vi.fn();
  const item = { ...BASE_ITEM, ...itemOverrides };
  render(
    <ItemDetailModal
      locationId={1}
      item={item}
      onClose={onClose}
      onUpdated={onUpdated}
      onEditPhoto={onEditPhoto}
      onDelete={onDelete}
    />
  );
  return { onClose, onUpdated, onEditPhoto, onDelete, item };
}

describe("ItemDetailModal — rendering", () => {
  it("pre-fills the name, brand, barcode, and quantity fields", () => {
    renderModal();
    expect(screen.getByDisplayValue("Nutella")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ferrero")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3017620422003")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("leaves the brand field empty when brand is null", () => {
    renderModal({ brand: null });
    expect(screen.getByPlaceholderText("Brand (optional)")).toHaveValue("");
  });

  it("disables Save until a field is changed", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("ItemDetailModal — quantity controls", () => {
  it("increments and decrements the quantity and enables Save", async () => {
    const user = userEvent.setup();
    renderModal({ quantity: 3 });

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("disables the decrease button at 0", async () => {
    const user = userEvent.setup();
    renderModal({ quantity: 1 });

    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  });
});

describe("ItemDetailModal — edit fields", () => {
  it("disables Save when the name is cleared", async () => {
    const user = userEvent.setup();
    renderModal();

    const nameInput = screen.getByDisplayValue("Nutella");
    await user.clear(nameInput);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("disables Save when the barcode is cleared", async () => {
    const user = userEvent.setup();
    renderModal();

    const barcodeInput = screen.getByDisplayValue("3017620422003");
    await user.clear(barcodeInput);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("ItemDetailModal — save flow", () => {
  it("PATCHes the edited fields and reports the updated item on success", async () => {
    let patchedBody: unknown;
    server.use(
      http.patch(api("/locations/:id/items/:itemId"), async ({ request }) => {
        patchedBody = await request.json();
        return HttpResponse.json({ ...BASE_ITEM, name: "Nutella Spread" });
      })
    );
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal();

    const nameInput = screen.getByDisplayValue("Nutella");
    await user.clear(nameInput);
    await user.type(nameInput, "Nutella Spread");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(patchedBody).toEqual({
      name: "Nutella Spread",
      brand: "Ferrero",
      barcode: "3017620422003",
      quantity: 3,
    });
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Nutella Spread" })
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a Saving… state while the update is in flight", async () => {
    server.use(
      http.patch(api("/locations/:id/items/:itemId"), async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(BASE_ITEM);
      })
    );
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows an error and keeps the modal open when the barcode already exists", async () => {
    server.use(
      http.patch(api("/locations/:id/items/:itemId"), () =>
        HttpResponse.json(
          { detail: "Another item with this barcode already exists" },
          { status: 409 }
        )
      )
    );
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal();

    const barcodeInput = screen.getByDisplayValue("3017620422003");
    await user.clear(barcodeInput);
    await user.type(barcodeInput, "1234567890123");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Another item with this barcode already exists")
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("ItemDetailModal — sync across locations", () => {
  it("does not show the Sync all button when the item is unique", async () => {
    renderModal();
    await waitFor(() => expect(screen.queryByText(/Also in/)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Sync all" })).not.toBeInTheDocument();
  });

  it("shows the Sync all button and the other locations when duplicates exist", async () => {
    server.use(
      http.get(api("/items/by-barcode/:barcode"), () =>
        HttpResponse.json([
          { location_id: 2, location_name: "Pantry" },
          { location_id: 3, location_name: "Garage" },
        ])
      )
    );
    renderModal();

    expect(await screen.findByText("Also in Pantry, Garage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync all" })).toBeInTheDocument();
  });

  it("PATCHes with sync: true and reports the updated item on success", async () => {
    let patchedBody: unknown;
    server.use(
      http.get(api("/items/by-barcode/:barcode"), () =>
        HttpResponse.json([{ location_id: 2, location_name: "Pantry" }])
      ),
      http.patch(api("/locations/:id/items/:itemId"), async ({ request }) => {
        patchedBody = await request.json();
        return HttpResponse.json({ ...BASE_ITEM, name: "Nutella Spread" });
      })
    );
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal();

    await screen.findByRole("button", { name: "Sync all" });
    const nameInput = screen.getByDisplayValue("Nutella");
    await user.clear(nameInput);
    await user.type(nameInput, "Nutella Spread");
    await user.click(screen.getByRole("button", { name: "Sync all" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(patchedBody).toEqual({
      name: "Nutella Spread",
      brand: "Ferrero",
      barcode: "3017620422003",
      quantity: 3,
      sync: true,
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an error and keeps the modal open when the sync request fails", async () => {
    server.use(
      http.get(api("/items/by-barcode/:barcode"), () =>
        HttpResponse.json([{ location_id: 2, location_name: "Pantry" }])
      ),
      http.patch(api("/locations/:id/items/:itemId"), () =>
        HttpResponse.json({ detail: "Item not found" }, { status: 404 })
      )
    );
    const user = userEvent.setup();
    const { onClose, onUpdated } = renderModal();

    await user.click(await screen.findByRole("button", { name: "Sync all" }));

    expect(await screen.findByText("Item not found")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("ItemDetailModal — photo and delete", () => {
  it("calls onEditPhoto when the thumbnail is clicked", async () => {
    const user = userEvent.setup();
    const { onEditPhoto } = renderModal();

    await user.click(screen.getByRole("button", { name: "Change photo" }));
    expect(onEditPhoto).toHaveBeenCalledOnce();
  });

  it("calls onDelete when Delete this item is clicked", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderModal();

    await user.click(screen.getByRole("button", { name: "Delete this item" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe("ItemDetailModal — cancel", () => {
  it("calls onClose without calling the API when Cancel is clicked", async () => {
    let patchCalled = false;
    server.use(
      http.patch(api("/locations/:id/items/:itemId"), () => {
        patchCalled = true;
        return HttpResponse.json(BASE_ITEM);
      })
    );
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(patchCalled).toBe(false);
  });
});
