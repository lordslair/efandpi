# EfanDpi

A Progressive Web App (PWA) for tracking what you have in your fridge, pantry, and other storage locations. Scan barcodes with your phone camera, search products by name via Open Food Facts, and manage quantities from a clean mobile UI.

---

## Features

- **Authentication** — register and sign in with email + password (JWT)
- **Locations** — create named storage locations (Fridge, Pantry, Cellar, …)
- **Barcode scanning** — scan EAN/UPC barcodes with your phone's rear camera
- **Manual import** — search Open Food Facts by product name and pick from matching results
- **Open Food Facts** — automatic product name and thumbnail lookup (barcode scan or text search)
- **Inventory management** — add items, adjust quantities with +/− buttons, delete items
- **Share links** — generate a stable, read-only public URL for any location; share it without requiring the recipient to have an account; regenerate the link to invalidate the old one
- **Export** — generate a PNG image of any location's inventory list
- **PWA** — installable on Android/iOS, works in standalone mode

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/lordslair/efandpi.git
cd efandpi
cp .env.example .env
```

Edit `.env` and set a strong `SECRET_KEY`:

```dotenv
SECRET_KEY=your-very-long-random-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=10080
DATABASE_URL=sqlite+aiosqlite:////data/efandpi.db
```

For production HTTPS via Caddy (see below), also set:

```dotenv
MY_DOMAIN=app.example.com
MY_API_DOMAIN=api.example.com
OVH_APPLICATION_KEY=...
OVH_APPLICATION_SECRET=...
OVH_CONSUMER_KEY=...
```

### 2. Start with Docker Compose

```bash
docker compose up --build
```

| Service | URL (local) |
|---------|-------------|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| API docs | http://localhost:5000/docs |
| Caddy (HTTPS) | ports 80 / 443 (when domain env vars are set) |

The frontend nginx container proxies `/api/*` to the backend, so the app works at `http://localhost:3000` without extra configuration.

### 3. Use on your phone (same network)

Open **http://\<your-server-ip\>:3000** in your phone's browser.

> **Important — HTTPS is required for camera access on mobile.**
> Chrome and Safari on Android/iOS only allow camera access from secure contexts.
> `localhost` works fine for development, but accessing via a LAN IP requires HTTPS.
> See [HTTPS setup](#https-setup) below.

---

## Adding Items

Each location offers two ways to add products:

1. **Scan Barcode** — use the phone camera to read an EAN/UPC code; the app looks up the product on Open Food Facts and lets you confirm the name and quantity before saving.
2. **Manual Import** — enter a product name, search Open Food Facts for matches, select the correct product from the results, then tap **Add** to store it in the location.

Both flows use the same inventory rules: adding an item with an existing barcode in that location increments its quantity instead of creating a duplicate row.

## Sharing a Location

The header of each location page has a **Share** button next to Export. Clicking it opens a modal that:

1. Generates (or retrieves) a stable UUID-based public link for that location.
2. Shows the full URL, which anyone can open in any browser — no account needed.
3. Provides a **Copy link** button to copy the URL to clipboard.
4. Provides a **Regenerate link** button to invalidate the previous URL and create a new one.

The public view at `/share/:token` is read-only — visitors see the location name and item list (thumbnail, name, barcode, quantity) but cannot edit quantities or delete items.

---

## Project Structure

```
efandpi/
├── docker-compose.yml
├── .env.example
├── data/                    # SQLite database (persisted via Docker volume)
├── caddy/
│   └── Caddyfile            # TLS termination + reverse proxy (OVH DNS)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-dev.txt # pytest + pytest-asyncio
│   ├── pytest.ini
│   ├── tests/               # pytest suite (auth, items, locations, shares)
│   └── app/
│       ├── main.py          # FastAPI app, CORS, lifespan
│       ├── database.py      # SQLAlchemy async engine
│       ├── models.py        # User, Location, Item ORM models
│       ├── schemas.py       # Pydantic request/response models
│       ├── auth.py          # JWT + bcrypt helpers, get_current_user dep
│       └── routers/
│           ├── auth.py      # POST /auth/register, POST /auth/token
│           ├── locations.py # GET/POST/DELETE /locations + share endpoints
│           ├── items.py     # GET/POST/PATCH/DELETE /locations/{id}/items
│           │                # GET /locations/{id}/items/lookup?barcode=
│           │                # GET /locations/{id}/items/search?q=
│           └── public.py    # GET /public/share/{token} (no auth)
└── frontend/
    ├── Dockerfile           # Node build + nginx serve (port 3000)
    ├── nginx.conf           # SPA fallback + /api proxy + gzip
    ├── TESTING.md           # Frontend test suite reference
    ├── tests/               # Vitest + React Testing Library + MSW
    ├── scripts/
    │   └── generate-icons.mjs  # Generates PWA PNGs (no deps, pure Node.js)
    └── src/
        ├── api/client.ts    # Typed fetch wrapper for all API calls
        ├── hooks/useAuth.tsx # AuthContext + JWT localStorage
        ├── router.ts        # React Router v7 future flags
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── HomePage.tsx          # Location selector grid
        │   ├── LocationPage.tsx      # Item list + scanner + manual import + share + export
        │   └── SharedLocationPage.tsx # Public read-only view at /share/:token
        └── components/
            ├── BarcodeScanner.tsx    # react-zxing, rear camera, scan overlay
            ├── ManualImportModal.tsx # Open Food Facts text search + product picker
            ├── ShareButton.tsx       # Opens share modal
            ├── ShareModal.tsx        # Copy/regenerate share link modal
            ├── ItemCard.tsx          # Thumbnail, name, qty controls, delete (+ readOnly mode)
            └── ExportButton.tsx      # html-to-image PNG download
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account `{email, password}` |
| `POST` | `/auth/token` | Sign in (form: `username`, `password`) → JWT |
| `GET` | `/locations` | List user's locations |
| `POST` | `/locations` | Create location `{name}` |
| `DELETE` | `/locations/{id}` | Delete location and all its items |
| `GET` | `/locations/{id}/items` | List items in a location |
| `GET` | `/locations/{id}/items/lookup?barcode=` | Look up barcode via Open Food Facts |
| `GET` | `/locations/{id}/items/search?q=` | Search products by name via Open Food Facts |
| `POST` | `/locations/{id}/items` | Add item (increments qty if barcode exists) |
| `PATCH` | `/locations/{id}/items/{itemId}` | Update quantity `{quantity}` |
| `DELETE` | `/locations/{id}/items/{itemId}` | Remove item |
| `POST` | `/locations/{id}/share` | Create share link (idempotent); returns `{token}` |
| `POST` | `/locations/{id}/share/regenerate` | Replace token (invalidates old link) |
| `GET` | `/public/share/{token}` | Public read-only view — no auth required |

---

## HTTPS Setup

Camera access requires a secure context (`https://`). The stack includes **Caddy** with OVH DNS challenge for automatic TLS certificates.

### Production (included in docker-compose)

Caddy is already configured in `docker-compose.yml`. Set these in `.env`:

```dotenv
MY_DOMAIN=app.example.com          # frontend → frontend:3000
MY_API_DOMAIN=api.example.com      # backend API → backend:5000
OVH_APPLICATION_KEY=...
OVH_APPLICATION_SECRET=...
OVH_CONSUMER_KEY=...
```

The `caddy/Caddyfile` terminates TLS and reverse-proxies each domain to the correct container. The frontend uses a relative `/api` path proxied by nginx, so `MY_API_DOMAIN` is only needed if you build the frontend with a custom `VITE_API_URL`.

### Local / LAN development options

- **Direct HTTP** — use `http://localhost:3000` (camera works on localhost)
- **ngrok / Cloudflare Tunnel** — expose port 3000 with a public HTTPS URL:

  ```bash
  ngrok http 3000
  ```

---

## Development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp ../.env.example ../.env
export $(grep -v '^#' ../.env | xargs)
mkdir -p ../data
uvicorn app.main:app --reload --port 5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # starts at http://localhost:5173
```

The Vite dev server proxies `/api/*` → `http://localhost:5000/*` automatically.

---

## Testing

Both backend and frontend have test suites run in CI on pull requests.

### Backend (pytest)

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

### Frontend (Vitest)

```bash
cd frontend
npm install
npm run test            # run once (CI mode)
npm run test:watch      # interactive watch mode
npm run test:coverage   # generate coverage/ report
```

See `frontend/TESTING.md` for the full testing guide (MSW, patterns, configuration).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.14, FastAPI, SQLAlchemy (async), aiosqlite, greenlet |
| Auth | JWT (`python-jose`), bcrypt |
| Product data | `openfoodfacts` Python SDK v5 |
| Database | SQLite (file in `./data/`) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS v4 |
| Barcode scanning | `react-zxing` (ZXing-C++ via WebAssembly) |
| Image export | `html-to-image` |
| PWA | `vite-plugin-pwa` (Workbox service worker) |
| Serving | nginx (static on port 3000 + `/api` reverse proxy) |
| TLS / reverse proxy | Caddy with OVH DNS challenge |
| Testing | pytest (backend), Vitest + RTL + MSW (frontend) |
| Containers | Docker, Docker Compose |

---

## License

MIT — see [LICENSE](LICENSE)
