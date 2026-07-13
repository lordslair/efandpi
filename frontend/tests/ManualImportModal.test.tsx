// Pattern B — component integration test (real api/client.ts + MSW)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import ManualImportModal from "../src/components/ManualImportModal";
import type { Item } from "../src/api/client";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

// ImageCropModal has its own dedicated test suite (ImageCropModal.test.tsx);
// here we only care that selecting a photo routes through it before the final
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

function renderModal() {
  const onClose = vi.fn();
  const onAdded = vi.fn();
  render(<ManualImportModal locationId={1} onClose={onClose} onAdded={onAdded} />);
  return { onClose, onAdded };
}

async function searchAndSelect(user: ReturnType<typeof userEvent.setup>, query = "Nutella") {
  await user.type(screen.getByPlaceholderText(/Nutella, pasta/i), query);
  await user.click(screen.getByRole("button", { name: /Search Open Food Facts/i }));
  await screen.findByText("Nutella");
  await user.click(screen.getByRole("button", { name: /Nutella/i }));
}

async function choosePhoto(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByLabelText("Custom photo (optional)"), file);
  // Selecting a file opens the (mocked) crop modal; confirm through it.
  await user.click(screen.getByRole("button", { name: "Confirm crop (mock)" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ManualImportModal — rendering", () => {
  it("shows the Manual Import heading", () => {
    renderModal();
    expect(screen.getByText("Manual Import", { selector: "h3" })).toBeInTheDocument();
  });

  it("disables the search button when the query is empty", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /Search Open Food Facts/i })).toBeDisabled();
  });

  it("does not show the custom photo input before a product is selected", () => {
    renderModal();
    expect(screen.queryByLabelText("Custom photo (optional)")).not.toBeInTheDocument();
  });

  it("disables Add before a product is selected", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /^Add$/ })).toBeDisabled();
  });
});

describe("ManualImportModal — search", () => {
  it("shows a 'no products found' message when the search returns nothing", async () => {
    server.use(
      http.get(api("/locations/:id/items/search"), () => HttpResponse.json([]))
    );
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByPlaceholderText(/Nutella, pasta/i), "zzz");
    await user.click(screen.getByRole("button", { name: /Search Open Food Facts/i }));

    expect(
      await screen.findByText("No products found. Try a different name.")
    ).toBeInTheDocument();
  });

  it("shows an error message when the search request fails", async () => {
    server.use(
      http.get(api("/locations/:id/items/search"), () =>
        HttpResponse.json({ detail: "Product search unavailable" }, { status: 502 })
      )
    );
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByPlaceholderText(/Nutella, pasta/i), "Nutella");
    await user.click(screen.getByRole("button", { name: /Search Open Food Facts/i }));

    expect(await screen.findByText("Product search unavailable")).toBeInTheDocument();
  });

  it("reveals the custom photo input and enables Add once a result is selected", async () => {
    const user = userEvent.setup();
    renderModal();

    await searchAndSelect(user);

    expect(screen.getByLabelText("Custom photo (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add$/ })).toBeEnabled();
  });
});

describe("ManualImportModal — add without a photo", () => {
  it("adds the item and closes the modal", async () => {
    const user = userEvent.setup();
    const { onClose, onAdded } = renderModal();

    await searchAndSelect(user);
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    const added = onAdded.mock.calls[0][0] as Item;
    expect(added.name).toBe("Nutella");
    expect(added.custom_image_url).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an error and does not close the modal when adding fails", async () => {
    server.use(
      http.post(api("/locations/:id/items"), () =>
        HttpResponse.json({ detail: "Something went wrong" }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    const { onClose, onAdded } = renderModal();

    await searchAndSelect(user);
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ManualImportModal — cropping a photo", () => {
  it("opens the crop modal instead of immediately attaching the file", async () => {
    const user = userEvent.setup();
    renderModal();

    await searchAndSelect(user);
    const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Custom photo (optional)"), file);

    expect(screen.getByText("Mock crop modal")).toBeInTheDocument();
    // The whole modal (and its Add button) is swapped out while cropping
    expect(screen.queryByRole("button", { name: /^Add$/ })).not.toBeInTheDocument();
  });

  it("returns to the modal, photo unset, when the crop step is cancelled", async () => {
    const user = userEvent.setup();
    renderModal();

    await searchAndSelect(user);
    const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Custom photo (optional)"), file);
    await user.click(screen.getByRole("button", { name: "Cancel crop (mock)" }));

    expect(screen.queryByText("Mock crop modal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add$/ })).toBeEnabled();
  });
});

describe("ManualImportModal — add with a photo", () => {
  it("uploads the chosen photo after creating the item", async () => {
    const user = userEvent.setup();
    const { onClose, onAdded } = renderModal();

    await searchAndSelect(user);
    await choosePhoto(user);
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    const added = onAdded.mock.calls[0][0] as Item;
    expect(added.custom_image_url).toBe("https://example.com/custom.jpg");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("still adds the item and closes when the photo upload fails (best-effort)", async () => {
    server.use(
      http.post(api("/locations/:id/items/:itemId/image"), () =>
        HttpResponse.json({ detail: "Failed to upload image" }, { status: 502 })
      )
    );
    const user = userEvent.setup();
    const { onClose, onAdded } = renderModal();

    await searchAndSelect(user);
    await choosePhoto(user);
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    const added = onAdded.mock.calls[0][0] as Item;
    expect(added.custom_image_url).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ManualImportModal — cancel", () => {
  it("calls onClose without adding anything", async () => {
    const user = userEvent.setup();
    const { onClose, onAdded } = renderModal();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
