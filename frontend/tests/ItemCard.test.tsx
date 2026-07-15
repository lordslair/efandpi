// Pattern E — presentational component test (no network, no routing)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemCard from "../src/components/ItemCard";
import type { Item } from "../src/api/client";

const BASE_ITEM: Item = {
  id: 1,
  barcode: "3017620422003",
  name: "Nutella",
  brand: "Ferrero",
  quantity: 3,
  thumbnail_url: null,
  custom_image_url: null,
  starred: false,
  added_at: "2026-01-01T00:00:00Z",
};

function renderCard(overrides: Partial<Item> = {}) {
  const onQuantityChange = vi.fn();
  const onDelete = vi.fn();
  const item = { ...BASE_ITEM, ...overrides };
  render(
    <ItemCard item={item} onQuantityChange={onQuantityChange} onDelete={onDelete} />
  );
  return { onQuantityChange, onDelete };
}

describe("ItemCard — rendering", () => {
  it("displays the item name", () => {
    renderCard();
    expect(screen.getByText("Nutella")).toBeInTheDocument();
  });

  it("displays the barcode", () => {
    renderCard();
    expect(screen.getByText("3017620422003")).toBeInTheDocument();
  });

  it("displays the brand under the product name when present", () => {
    renderCard({ brand: "Ferrero" });
    expect(screen.getByText("Ferrero")).toBeInTheDocument();
  });

  it("does not render a brand line when brand is null", () => {
    renderCard({ brand: null });
    expect(screen.queryByText("Ferrero")).not.toBeInTheDocument();
  });

  it("displays the current quantity", () => {
    renderCard({ quantity: 5 });
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders the thumbnail image with the item name as alt text", () => {
    renderCard({ thumbnail_url: "https://example.com/img.jpg" });
    const img = screen.getByRole("img", { name: "Nutella" });
    expect(img).toHaveAttribute("src", "https://example.com/img.jpg");
  });

  it("prefers custom_image_url over thumbnail_url when both are set", () => {
    renderCard({
      thumbnail_url: "https://example.com/off.jpg",
      custom_image_url: "https://example.com/custom.jpg",
    });
    const img = screen.getByRole("img", { name: "Nutella" });
    expect(img).toHaveAttribute("src", "https://example.com/custom.jpg");
  });

  it("swaps to the fallback image when the src fails to load", () => {
    renderCard({ thumbnail_url: "https://example.com/broken.jpg" });
    const img = screen.getByRole("img", { name: "Nutella" });

    fireEvent.error(img);

    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });
});

describe("ItemCard — edit photo", () => {
  it("does not render an edit-photo button when onEditPhoto is not provided", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: "Edit photo" })).not.toBeInTheDocument();
  });

  it("does not render an edit-photo button in readOnly mode", () => {
    render(
      <ItemCard item={BASE_ITEM} readOnly onEditPhoto={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Edit photo" })).not.toBeInTheDocument();
  });

  it("calls onEditPhoto when the edit-photo button is clicked", async () => {
    const user = userEvent.setup();
    const onEditPhoto = vi.fn();
    render(
      <ItemCard
        item={BASE_ITEM}
        onQuantityChange={vi.fn()}
        onDelete={vi.fn()}
        onEditPhoto={onEditPhoto}
      />
    );
    await user.click(screen.getByRole("button", { name: "Edit photo" }));
    expect(onEditPhoto).toHaveBeenCalledOnce();
  });
});

describe("ItemCard — open detail", () => {
  it("does not render the name/brand/barcode as a button when onOpenDetail is not provided", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: "View product details" })).not.toBeInTheDocument();
  });

  it("does not render the name/brand/barcode as a button in readOnly mode", () => {
    render(<ItemCard item={BASE_ITEM} readOnly onOpenDetail={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "View product details" })).not.toBeInTheDocument();
  });

  it("calls onOpenDetail when the name/brand/barcode block is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();
    render(
      <ItemCard
        item={BASE_ITEM}
        onQuantityChange={vi.fn()}
        onDelete={vi.fn()}
        onOpenDetail={onOpenDetail}
      />
    );
    await user.click(screen.getByRole("button", { name: "View product details" }));
    expect(onOpenDetail).toHaveBeenCalledOnce();
  });
});

describe("ItemCard — star", () => {
  it("does not render a star button when onToggleStar is not provided", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: "Star item" })).not.toBeInTheDocument();
  });

  it("does not render a star button in readOnly mode", () => {
    render(<ItemCard item={BASE_ITEM} readOnly onToggleStar={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Star item" })).not.toBeInTheDocument();
  });

  it("shows an empty star and 'Star item' label when the item is not starred", () => {
    render(
      <ItemCard item={{ ...BASE_ITEM, starred: false }} onToggleStar={vi.fn()} />
    );
    const button = screen.getByRole("button", { name: "Star item" });
    expect(button).toHaveTextContent("☆");
  });

  it("shows a filled star and 'Unstar item' label when the item is starred", () => {
    render(
      <ItemCard item={{ ...BASE_ITEM, starred: true }} onToggleStar={vi.fn()} />
    );
    const button = screen.getByRole("button", { name: "Unstar item" });
    expect(button).toHaveTextContent("⭐");
  });

  it("calls onToggleStar when the star button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleStar = vi.fn();
    render(
      <ItemCard item={{ ...BASE_ITEM, starred: false }} onToggleStar={onToggleStar} />
    );

    await user.click(screen.getByRole("button", { name: "Star item" }));
    expect(onToggleStar).toHaveBeenCalledOnce();
  });
});

describe("ItemCard — quantity controls", () => {
  it("decrease button is enabled when quantity is 1", () => {
    renderCard({ quantity: 1 });
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeEnabled();
  });

  it("decrease button is disabled when quantity is 0", () => {
    renderCard({ quantity: 0 });
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  });

  it("decrease button is enabled when quantity is greater than 1", () => {
    renderCard({ quantity: 3 });
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeEnabled();
  });

  it("calls onQuantityChange(quantity - 1) when − is clicked", async () => {
    const user = userEvent.setup();
    const { onQuantityChange } = renderCard({ quantity: 1 });

    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(onQuantityChange).toHaveBeenCalledWith(0);
  });

  it("calls onQuantityChange(quantity + 1) when + is clicked", async () => {
    const user = userEvent.setup();
    const { onQuantityChange } = renderCard({ quantity: 3 });

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onQuantityChange).toHaveBeenCalledWith(4);
  });
});

describe("ItemCard — out of stock styling", () => {
  it("uses a grey background when outOfStock is true", () => {
    const { container } = render(
      <ItemCard
        item={BASE_ITEM}
        outOfStock
        onQuantityChange={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(container.firstChild).toHaveClass("bg-gray-100");
  });
});

describe("ItemCard — delete", () => {
  it("calls onDelete when the delete button is clicked", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderCard();

    await user.click(screen.getByRole("button", { name: "Delete item" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
