// Pattern B — page integration test (real AuthProvider + MSW)
// BarcodeScanner and ExportButton are mocked because they use camera/canvas APIs
// that are not available in jsdom.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { TEST_API_ORIGIN } from "./constants";
import { AuthProvider } from "../src/hooks/useAuth";
import LocationPage from "../src/pages/LocationPage";
import { routerFuture } from "../src/router";

const api = (p: string) => `${TEST_API_ORIGIN}${p}`;

// Stub camera-dependent component
vi.mock("../src/components/BarcodeScanner", () => ({
  default: ({
    onScan,
    onClose,
  }: {
    onScan: (b: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="barcode-scanner">
      <button onClick={() => onScan("3017620422003")}>Trigger Scan</button>
      <button onClick={onClose}>Close Scanner</button>
    </div>
  ),
}));

// Stub canvas-dependent component
vi.mock("../src/components/ExportButton", () => ({
  default: () => <button>Export</button>,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => mockNavigate,
}));

const MOCK_ITEMS = [
  {
    id: 1,
    barcode: "3017620422003",
    name: "Nutella",
    quantity: 2,
    thumbnail_url: null,
    added_at: "2026-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  localStorage.setItem("token", "test-token");
  mockNavigate.mockReset();
});

function renderLocationPage(
  locationId = 1,
  routeState?: { name?: string }
) {
  return render(
    <MemoryRouter
      future={routerFuture}
      initialEntries={[
        { pathname: `/location/${locationId}`, state: routeState },
      ]}
    >
      <AuthProvider>
        <Routes>
          <Route path="/location/:id" element={<LocationPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("LocationPage — header", () => {
  it("shows the location name passed via route state", async () => {
    renderLocationPage(1, { name: "Fridge" });
    expect(await screen.findByText("Fridge")).toBeInTheDocument();
  });

  it("falls back to 'Location' when no state is provided", async () => {
    // getLocations is called to resolve the name — default handler returns []
    server.use(http.get(api("/locations"), () => HttpResponse.json([])));
    renderLocationPage(1);
    // The page renders with the fallback name while it looks up the location
    expect(await screen.findByText("Location")).toBeInTheDocument();
  });

  it("navigates back when the back button is clicked", async () => {
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("Fridge");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});

describe("LocationPage — item list", () => {
  it("shows empty state when there are no items", async () => {
    renderLocationPage(1, { name: "Fridge" });
    expect(await screen.findByText("This location is empty")).toBeInTheDocument();
  });

  it("renders item cards when items are loaded", async () => {
    server.use(
      http.get(api("/locations/:id/items"), () =>
        HttpResponse.json(MOCK_ITEMS)
      )
    );
    renderLocationPage(1, { name: "Fridge" });
    expect(await screen.findByText("Nutella")).toBeInTheDocument();
    expect(screen.getByText("3017620422003")).toBeInTheDocument();
  });
});

describe("LocationPage — scan flow", () => {
  it("shows the barcode scanner overlay when Scan Barcode is clicked", async () => {
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    expect(screen.getByTestId("barcode-scanner")).toBeInTheDocument();
  });

  it("closes the scanner and shows a confirm modal after a scan", async () => {
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    await user.click(screen.getByRole("button", { name: "Trigger Scan" }));

    // Scanner overlay should be gone; confirm modal appears
    await waitFor(() =>
      expect(screen.queryByTestId("barcode-scanner")).not.toBeInTheDocument()
    );
    // Default handler returns found: false
    expect(await screen.findByText("Unknown product")).toBeInTheDocument();
    expect(screen.getByText("3017620422003")).toBeInTheDocument();
  });

  it("shows 'Product found' when the barcode is known", async () => {
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
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    await user.click(screen.getByRole("button", { name: "Trigger Scan" }));

    expect(await screen.findByText("Product found")).toBeInTheDocument();
  });

  it("pre-fills the product name input from the lookup result", async () => {
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
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    await user.click(screen.getByRole("button", { name: "Trigger Scan" }));

    await screen.findByText("Product found");
    const input = screen.getByDisplayValue("Nutella");
    expect(input).toBeInTheDocument();
  });

  it("disables 'Add to list' when the product name is empty", async () => {
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    await user.click(screen.getByRole("button", { name: "Trigger Scan" }));

    await screen.findByText("Unknown product");
    // Name input is empty for unknown product
    expect(screen.getByRole("button", { name: "Add to list" })).toBeDisabled();
  });

  it("adds the item and closes the modal", async () => {
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
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    await user.click(screen.getByRole("button", { name: "Trigger Scan" }));
    await screen.findByText("Product found");
    await user.click(screen.getByRole("button", { name: "Add to list" }));

    // Modal dismissed; item now in the list
    await waitFor(() =>
      expect(screen.queryByText("Product found")).not.toBeInTheDocument()
    );
    expect(await screen.findByText("Nutella")).toBeInTheDocument();
  });

  it("increments and decrements the quantity in the confirm modal", async () => {
    server.use(
      http.get(api("/locations/:id/items/lookup"), () =>
        HttpResponse.json({ barcode: "3017620422003", name: "Juice", thumbnail_url: null, found: true })
      )
    );
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    await user.click(screen.getByRole("button", { name: "Trigger Scan" }));
    await screen.findByText("Product found");

    // Default qty is 1; increment to 3
    await user.click(screen.getByRole("button", { name: "+" }));
    await user.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("3")).toBeInTheDocument();

    // Decrement back to 2
    await user.click(screen.getByRole("button", { name: "−" }));
    expect(screen.getByText("2")).toBeInTheDocument();

    // Minus disabled at 1 — bring back to 1
    await user.click(screen.getByRole("button", { name: "−" }));
    expect(screen.getByRole("button", { name: "−" })).toBeDisabled();
  });

  it("dismisses the confirm modal when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Scan Barcode/i }));
    await user.click(screen.getByRole("button", { name: "Trigger Scan" }));
    await screen.findByText("Unknown product");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Unknown product")).not.toBeInTheDocument();
  });
});

describe("LocationPage — item quantity and delete", () => {
  beforeEach(() => {
    server.use(
      http.get(api("/locations/:id/items"), () =>
        HttpResponse.json(MOCK_ITEMS)
      )
    );
  });

  it("calls PATCH when the quantity − button on an item is clicked", async () => {
    let patchedQty: number | undefined;
    server.use(
      http.patch(api("/locations/:id/items/:itemId"), async ({ request }) => {
        const body = (await request.json()) as { quantity: number };
        patchedQty = body.quantity;
        return HttpResponse.json({ ...MOCK_ITEMS[0], quantity: body.quantity });
      })
    );
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("Nutella");

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));

    await waitFor(() => expect(patchedQty).toBe(3));
  });

  it("removes the item from the list when its delete button is clicked", async () => {
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("Nutella");

    await user.click(screen.getByRole("button", { name: "Delete item" }));

    await waitFor(() =>
      expect(screen.queryByText("Nutella")).not.toBeInTheDocument()
    );
    expect(screen.getByText("This location is empty")).toBeInTheDocument();
  });
});

describe("LocationPage — manual import", () => {
  it("opens the manual import modal and adds a selected product", async () => {
    const user = userEvent.setup();
    renderLocationPage(1, { name: "Fridge" });
    await screen.findByText("This location is empty");

    await user.click(screen.getByRole("button", { name: /Manual Import/i }));
    expect(screen.getByText("Manual Import", { selector: "h3" })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Nutella, pasta/i), "Nutella");
    await user.click(screen.getByRole("button", { name: /Search Open Food Facts/i }));

    await screen.findByText("Nutella");
    await user.click(screen.getByRole("button", { name: /Nutella/i }));
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() =>
      expect(screen.queryByText("Manual Import", { selector: "h3" })).not.toBeInTheDocument()
    );
    expect(await screen.findByText("Nutella")).toBeInTheDocument();
  });
});
