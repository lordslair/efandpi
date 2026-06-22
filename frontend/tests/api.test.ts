// Pattern C — service unit tests (no React, pure fetch through MSW)
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import {
  login,
  register,
  getLocations,
  createLocation,
  deleteLocation,
  getItems,
  addItem,
  updateItemQuantity,
  deleteItem,
  lookupBarcode,
} from "../src/api/client";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

describe("login()", () => {
  it("returns the access_token string on success", async () => {
    const token = await login("a@b.com", "pass");
    expect(token).toBe("test-access-token");
  });

  it("throws with the server detail message on 401", async () => {
    server.use(
      http.post(api("/auth/token"), () =>
        HttpResponse.json({ detail: "Incorrect email or password" }, { status: 401 })
      )
    );
    await expect(login("bad@b.com", "wrong")).rejects.toThrow(
      "Incorrect email or password"
    );
  });

  it("throws a fallback message when detail is absent", async () => {
    server.use(
      http.post(api("/auth/token"), () =>
        HttpResponse.json({}, { status: 401 })
      )
    );
    await expect(login("a@b.com", "pw")).rejects.toThrow("Login failed");
  });
});

describe("register()", () => {
  it("POSTs to /auth/register and returns the created user", async () => {
    const user = await register("new@b.com", "pass") as { email: string };
    expect(user).toMatchObject({ email: "new@b.com" });
  });

  it("throws on 400 duplicate email", async () => {
    server.use(
      http.post(api("/auth/register"), () =>
        HttpResponse.json({ detail: "Email already registered" }, { status: 400 })
      )
    );
    await expect(register("dup@b.com", "pass")).rejects.toThrow(
      "Email already registered"
    );
  });
});

describe("getLocations()", () => {
  it("returns an empty array by default", async () => {
    const locs = await getLocations();
    expect(locs).toEqual([]);
  });

  it("returns the location list from the server", async () => {
    server.use(
      http.get(api("/locations"), () =>
        HttpResponse.json([{ id: 1, name: "Fridge", created_at: "2026-01-01T00:00:00Z" }])
      )
    );
    const locs = await getLocations();
    expect(locs).toHaveLength(1);
    expect(locs[0].name).toBe("Fridge");
  });

  it("attaches the Authorization header when a token is in localStorage", async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(api("/locations"), ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json([]);
      })
    );
    localStorage.setItem("token", "my-token");
    await getLocations();
    expect(capturedAuth).toBe("Bearer my-token");
  });
});

describe("createLocation()", () => {
  it("POSTs the name and returns the new location", async () => {
    const loc = await createLocation("Pantry");
    expect(loc.name).toBe("Pantry");
    expect(loc.id).toBeDefined();
  });
});

describe("deleteLocation()", () => {
  it("sends DELETE and resolves without a value", async () => {
    const result = await deleteLocation(1);
    expect(result).toBeUndefined();
  });
});

describe("getItems()", () => {
  it("returns items for a location", async () => {
    const items = await getItems(1);
    expect(Array.isArray(items)).toBe(true);
  });
});

describe("lookupBarcode()", () => {
  it("returns found=false for an unknown barcode (default handler)", async () => {
    const result = await lookupBarcode(1, "0000000000000");
    expect(result.found).toBe(false);
    expect(result.barcode).toBe("0000000000000");
    expect(result.name).toBeNull();
  });

  it("returns the product name when found", async () => {
    server.use(
      http.get(api("/locations/:id/items/lookup"), () =>
        HttpResponse.json({
          barcode: "3017620422003",
          name: "Nutella",
          thumbnail_url: null,
          found: true,
        })
      )
    );
    const result = await lookupBarcode(1, "3017620422003");
    expect(result.found).toBe(true);
    expect(result.name).toBe("Nutella");
  });
});

describe("addItem()", () => {
  it("POSTs the item payload and returns the created item", async () => {
    const item = await addItem(1, {
      barcode: "1234567890",
      name: "Pasta",
      quantity: 3,
      thumbnail_url: null,
    });
    expect(item.name).toBe("Pasta");
    expect(item.quantity).toBe(3);
  });
});

describe("updateItemQuantity()", () => {
  it("PATCHes the quantity and returns the updated item", async () => {
    const item = await updateItemQuantity(1, 1, 5);
    expect(item.quantity).toBe(5);
  });
});

describe("deleteItem()", () => {
  it("sends DELETE and resolves without a value", async () => {
    const result = await deleteItem(1, 1);
    expect(result).toBeUndefined();
  });
});

describe("request() error handling", () => {
  it("throws with fallback 'Request failed' when detail is absent on non-ok response", async () => {
    server.use(
      http.get(api("/locations"), () =>
        HttpResponse.json({}, { status: 500 })
      )
    );
    await expect(getLocations()).rejects.toThrow("Request failed");
  });
});
