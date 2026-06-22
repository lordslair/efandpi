# EfanDpi

A Progressive Web App (PWA) for tracking what you have in your fridge, pantry, and other storage locations. Scan barcodes with your phone camera, look up products via Open Food Facts, and manage quantities from a clean mobile UI.

---

## Features

- **Authentication** — register and sign in with email + password (JWT)
- **Locations** — create named storage locations (Fridge, Pantry, Cellar, …)
- **Barcode scanning** — scan EAN/UPC barcodes with your phone's rear camera
- **Open Food Facts** — automatic product name and thumbnail lookup
- **Inventory management** — add items, adjust quantities with +/− buttons, delete items
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

### 2. Start with Docker Compose

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- API docs: http://localhost:5000/docs

### 3. Use on your phone (same network)

Open **http://\<your-server-ip\>:3000** in your phone's browser.

> **Important — HTTPS is required for camera access on mobile.**
> Chrome and Safari on Android/iOS only allow camera access from secure contexts.
> `localhost` works fine for development, but accessing via a LAN IP requires HTTPS.
> See [HTTPS setup](#https-for-lan-access) below.

---

## Project Structure

```
efandpi/
├── docker-compose.yml
├── .env.example
├── data/                    # SQLite database (persisted via Docker volume)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py          # FastAPI app, CORS, lifespan
│       ├── database.py      # SQLAlchemy async engine
│       ├── models.py        # User, Location, Item ORM models
│       ├── schemas.py       # Pydantic request/response models
│       ├── auth.py          # JWT + bcrypt helpers, get_current_user dep
│       └── routers/
│           ├── auth.py      # POST /auth/register, POST /auth/token
│           ├── locations.py # GET/POST/DELETE /locations
│           └── items.py     # GET/POST/PATCH/DELETE /locations/{id}/items
│                            # GET /locations/{id}/items/lookup?barcode=
└── frontend/
    ├── Dockerfile           # Node build + nginx serve
    ├── nginx.conf           # SPA fallback + /api proxy + gzip
    ├── scripts/
    │   └── generate-icons.mjs  # Generates PWA PNGs (no deps, pure Node.js)
    └── src/
        ├── api/client.ts    # Typed fetch wrapper for all API calls
        ├── hooks/useAuth.tsx # AuthContext + JWT localStorage
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── HomePage.tsx     # Location selector grid
        │   └── LocationPage.tsx # Item list + scanner + export
        └── components/
            ├── BarcodeScanner.tsx  # react-zxing, rear camera, scan overlay
            ├── ItemCard.tsx        # Thumbnail, name, qty controls, delete
            └── ExportButton.tsx    # html-to-image PNG download
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
| `POST` | `/locations/{id}/items` | Add item (increments qty if barcode exists) |
| `PATCH` | `/locations/{id}/items/{itemId}` | Update quantity `{quantity}` |
| `DELETE` | `/locations/{id}/items/{itemId}` | Remove item |

---

## HTTPS for LAN Access

Camera access requires a secure context (`https://`). For phone access on your local network:

### Option A — Caddy (recommended, auto TLS)

```yaml
# Add to docker-compose.yml
  caddy:
    image: caddy:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    networks:
      - efandpi

volumes:
  caddy_data:
```

```
# Caddyfile — replace with your server's LAN IP or hostname
http://192.168.1.100 {
    reverse_proxy frontend:80
}
```

Then access `http://192.168.1.100` on your phone. Caddy serves it over HTTP but you can enable a self-signed cert with `tls internal` for HTTPS.

### Option B — Self-signed certificate with nginx

Generate a cert and mount it into a reverse-proxy nginx container. On Android, install the certificate as a trusted CA. On iOS, install via Settings → General → VPN & Device Management.

### Option C — ngrok / Cloudflare Tunnel (for development)

```bash
ngrok http 3000
```

Opens a public HTTPS URL you can open on any device.

---

## Development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env
export $(cat ../.env | xargs)
mkdir -p /data
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

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy (async), aiosqlite |
| Auth | JWT (`python-jose`), bcrypt (`passlib`) |
| Product data | `openfoodfacts` Python SDK v5 |
| Database | SQLite (file in `./data/`) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Barcode scanning | `react-zxing` (ZXing-C++ via WebAssembly) |
| Image export | `html-to-image` |
| PWA | `vite-plugin-pwa` (Workbox service worker) |
| Serving | nginx (static + `/api` reverse proxy) |
| Containers | Docker, Docker Compose |

---

## License

MIT — see [LICENSE](LICENSE)
