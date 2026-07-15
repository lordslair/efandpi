const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Request failed");
  return data as T;
}

// Auth
export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password }).toString();
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Login failed");
  return data.access_token;
}

export async function register(email: string, password: string) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// Locations
export interface Location {
  id: number;
  name: string;
  created_at: string;
}

export async function getLocations(): Promise<Location[]> {
  return request("/locations");
}

export async function createLocation(name: string): Promise<Location> {
  return request("/locations", { method: "POST", body: JSON.stringify({ name }) });
}

export async function deleteLocation(id: number): Promise<void> {
  return request(`/locations/${id}`, { method: "DELETE" });
}

// Items
export interface Item {
  id: number;
  barcode: string;
  name: string;
  brand: string | null;
  quantity: number;
  thumbnail_url: string | null;
  custom_image_url: string | null;
  starred: boolean;
  added_at: string;
}

export interface ProductLookup {
  barcode: string;
  name: string | null;
  brand: string | null;
  thumbnail_url: string | null;
  found: boolean;
}

export interface ProductSearchResult {
  barcode: string;
  name: string;
  brand: string | null;
  thumbnail_url: string | null;
}

export async function lookupBarcode(locationId: number, barcode: string): Promise<ProductLookup> {
  return request(`/locations/${locationId}/items/lookup?barcode=${encodeURIComponent(barcode)}`);
}

export async function searchProducts(
  locationId: number,
  query: string
): Promise<ProductSearchResult[]> {
  return request(
    `/locations/${locationId}/items/search?q=${encodeURIComponent(query)}`
  );
}

// Share links
export interface ShareLink {
  token: string;
}

export interface SharedItem {
  name: string;
  brand: string | null;
  barcode: string;
  quantity: number;
  thumbnail_url: string | null;
  custom_image_url: string | null;
}

export interface SharedLocation {
  name: string;
  items: SharedItem[];
}

export async function createShareLink(locationId: number): Promise<ShareLink> {
  return request(`/locations/${locationId}/share`, { method: "POST" });
}

export async function regenerateShareLink(locationId: number): Promise<ShareLink> {
  return request(`/locations/${locationId}/share/regenerate`, { method: "POST" });
}

export async function getSharedLocation(token: string): Promise<SharedLocation> {
  const res = await fetch(`${BASE_URL}/public/share/${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Not found");
  return data as SharedLocation;
}

export async function getItems(locationId: number): Promise<Item[]> {
  return request(`/locations/${locationId}/items`);
}

export async function addItem(
  locationId: number,
  item: {
    barcode: string;
    name: string;
    brand?: string | null;
    quantity: number;
    thumbnail_url?: string | null;
  }
): Promise<Item> {
  return request(`/locations/${locationId}/items`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export interface ItemUpdate {
  name?: string;
  brand?: string | null;
  barcode?: string;
  quantity?: number;
  starred?: boolean;
  sync?: boolean;
}

export async function updateItem(
  locationId: number,
  itemId: number,
  payload: ItemUpdate
): Promise<Item> {
  return request(`/locations/${locationId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export interface ItemLocationSummary {
  location_id: number;
  location_name: string;
}

export async function getItemLocations(
  barcode: string,
  excludeItemId?: number
): Promise<ItemLocationSummary[]> {
  const query = excludeItemId != null ? `?exclude_item_id=${excludeItemId}` : "";
  return request(`/items/by-barcode/${encodeURIComponent(barcode)}${query}`);
}

export async function deleteItem(locationId: number, itemId: number): Promise<void> {
  return request(`/locations/${locationId}/items/${itemId}`, { method: "DELETE" });
}

export async function uploadItemImage(
  locationId: number,
  itemId: number,
  file: File
): Promise<Item> {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/locations/${locationId}/items/${itemId}/image`, {
    method: "POST",
    body: formData,
  });
}

export async function deleteItemImage(locationId: number, itemId: number): Promise<Item> {
  return request(`/locations/${locationId}/items/${itemId}/image`, { method: "DELETE" });
}
