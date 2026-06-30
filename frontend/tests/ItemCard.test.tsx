// Pattern E — presentational component test (no network, no routing)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
