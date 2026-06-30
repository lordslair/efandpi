import { http, HttpResponse } from "msw";
import { TEST_API_ORIGIN } from "../constants";

const api = (path: string) => `${TEST_API_ORIGIN}${path}`;

export const MOCK_TOKEN = "test-access-token";
export const MOCK_SHARE_TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

export const MOCK_LOCATION = {
  id: 1,
  name: "Fridge",
  created_at: "2026-01-01T00:00:00Z",
};

export const MOCK_ITEM = {
  id: 1,
  barcode: "3017620422003",
  name: "Nutella",
  brand: "Ferrero",
  quantity: 2,
  thumbnail_url: null,
  added_at: "2026-01-01T00:00:00Z",
};

export const handlers = [
  // Auth
  http.post(api("/auth/token"), () =>
    HttpResponse.json({ access_token: MOCK_TOKEN, token_type: "bearer" })
  ),

  http.post(api("/auth/register"), async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json(
      { id: 1, email: body.email, created_at: "2026-01-01T00:00:00Z" },
      { status: 201 }
    );
  }),

  // Locations
  http.get(api("/locations"), () => HttpResponse.json([])),

  http.post(api("/locations"), async ({ request }) => {
    const body = (await request.json()) as { name: string };
    return HttpResponse.json(
      { ...MOCK_LOCATION, name: body.name },
      { status: 201 }
    );
  }),

  http.delete(api("/locations/:id"), () => new HttpResponse(null, { status: 204 })),

  // Share links
  http.post(api("/locations/:id/share"), () =>
    HttpResponse.json({ token: MOCK_SHARE_TOKEN })
  ),

  http.post(api("/locations/:id/share/regenerate"), () =>
    HttpResponse.json({ token: "11111111-2222-3333-4444-555555555555" })
  ),

  http.get(
    `${TEST_API_ORIGIN}/public/share/:token`,
    ({ params }) => {
      if (params.token === MOCK_SHARE_TOKEN) {
        return HttpResponse.json({
          name: "Fridge",
          items: [
            {
              barcode: "3017620422003",
              name: "Nutella",
              brand: "Ferrero",
              quantity: 2,
              thumbnail_url: null,
            },
          ],
        });
      }
      return HttpResponse.json({ detail: "Share link not found" }, { status: 404 });
    }
  ),

  // Items — lookup must come before the generic items route
  http.get(api("/locations/:id/items/lookup"), ({ request }) => {
    const barcode = new URL(request.url).searchParams.get("barcode") ?? "";
    return HttpResponse.json({ barcode, name: null, brand: null, thumbnail_url: null, found: false });
  }),

  http.get(api("/locations/:id/items/search"), ({ request }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    if (!q.trim()) return HttpResponse.json([]);
    return HttpResponse.json([
      {
        barcode: "3017620422003",
        name: "Nutella",
        brand: "Ferrero",
        thumbnail_url: null,
      },
    ]);
  }),

  http.get(api("/locations/:id/items"), () => HttpResponse.json([])),

  http.post(api("/locations/:id/items"), async ({ request }) => {
    const body = (await request.json()) as {
      barcode: string;
      name: string;
      brand?: string | null;
      quantity: number;
      thumbnail_url: string | null;
    };
    return HttpResponse.json({ ...MOCK_ITEM, ...body }, { status: 201 });
  }),

  http.patch(api("/locations/:id/items/:itemId"), async ({ request }) => {
    const body = (await request.json()) as { quantity: number };
    return HttpResponse.json({ ...MOCK_ITEM, quantity: body.quantity });
  }),

  http.delete(
    api("/locations/:id/items/:itemId"),
    () => new HttpResponse(null, { status: 204 })
  ),
];
