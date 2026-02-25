# zpodweb

> This project was mainly vibecoded using [Claude](https://claude.ai), but driven with very specific UX/UI/API, architecture, and design instructions to fit a clear product vision.

A modern web UI for [zPodFactory](https://zpodfactory.github.io) — the automated nested lab deployment platform for VMware environments.

zpodweb connects to the zPodFactory API (`zpodapi`) and provides a visual interface for managing zPods, endpoints, components, libraries, profiles, and factory settings. All API calls are proxied through Nginx (production) or a Vite dev server plugin (development) to avoid CORS issues — the browser never talks directly to the API.

## Features

- **Dashboard** — overview of zPod counts, status distribution, and recent activity charts
- **zPod Management** — list, create, inspect, and destroy zPods with full detail views
- **Network Topology Diagram** — Visio-style interactive diagram showing NSX T0/T1 gateways, trunk segments, zBox interfaces, and deployed components with color-coded boxes per component type
- **Network Table** — auto-computed CIDR, gateway, DNS, VLAN ID, and router information for each zPod network
- **Endpoint Management** — view compute (vSphere) and network (NSX) endpoint configurations side by side
- **Component Browser** — searchable, filterable, and sortable component catalog with upload support
- **Library Management** — manage component libraries with enable/disable and sync controls
- **Profile Viewer** — inspect deployment profiles and their component definitions
- **Factory Settings** — view and manage global zPodFactory configuration
- **Multi-Target Support** — connect to multiple zPodFactory instances, with auto-connect when a single target is saved
- **Dark Theme** — Catppuccin Mocha color scheme with full dark mode support
- **Responsive Layout** — sidebar navigation with mobile hamburger menu

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 3 |
| UI Components | Radix UI (dialog, dropdown, select, avatar, etc.) |
| Icons | Lucide React |
| State Management | Zustand (persisted to localStorage) |
| HTTP Client | Axios |
| Routing | React Router 7 |
| Charts | Recharts |
| Notifications | Sonner |
| Production Server | Nginx (Alpine) |
| Container | Docker (multi-stage build) |

## Project Structure

```
zpodweb/
├── src/
│   ├── pages/                  # Route pages
│   │   ├── dashboard.tsx       # Dashboard with charts
│   │   ├── zpods.tsx           # zPod list
│   │   ├── zpod-detail.tsx     # zPod detail + network diagram
│   │   ├── components.tsx      # Component catalog
│   │   ├── libraries.tsx       # Library management
│   │   ├── profiles.tsx        # Profile viewer
│   │   ├── endpoints.tsx       # Endpoint configuration
│   │   ├── factory.tsx         # Factory info
│   │   ├── settings.tsx        # Global settings
│   │   ├── login.tsx           # Login / target selection
│   │   └── about.tsx           # About page
│   ├── components/
│   │   ├── ui/                 # Radix UI wrapper components (shadcn)
│   │   ├── layout/             # App shell (sidebar, header, root-layout, mobile-nav)
│   │   ├── target/             # Target management dialog
│   │   ├── build-progress-hover.tsx  # Build progress hover card
│   │   ├── confirmation-dialog.tsx   # Reusable confirmation dialog
│   │   ├── detail-row.tsx            # Key-value detail row
│   │   ├── elapsed-time.tsx          # Self-updating elapsed timer
│   │   ├── status-badge.tsx          # Color-coded status indicator
│   │   ├── sortable-head.tsx         # Sortable table header
│   │   ├── auth-guard.tsx            # Route protection
│   │   └── ...                       # Dialog components
│   ├── hooks/
│   │   ├── use-api.ts          # API client (all HTTP calls)
│   │   ├── use-sort.ts         # Table sorting hook
│   │   └── use-polling.ts      # Auto-refresh polling
│   ├── stores/
│   │   ├── target-store.ts     # Target/endpoint state (persisted)
│   │   ├── auth-store.ts       # Authentication state
│   │   └── preferences-store.ts
│   ├── lib/
│   │   ├── api.ts              # Axios instance setup
│   │   ├── utils.ts            # Utility functions (cn, formatElapsed, etc.)
│   │   ├── profile-utils.ts    # Profile data helpers
│   │   ├── build-progress.ts   # Build progress computation
│   │   ├── status-colors.ts    # Status -> color mapping
│   │   └── component-colors.ts # Component type -> color mapping
│   ├── types/
│   │   └── index.ts            # All TypeScript interfaces
│   ├── router/
│   │   └── index.tsx           # React Router configuration
│   ├── App.tsx                 # Root component
│   ├── main.tsx                # Entry point
│   └── index.css               # Global styles + CSS variables
├── public/
│   └── zpodfactory-logo.png
├── Dockerfile                  # Multi-stage build (node -> nginx)
├── docker-compose.yml
├── nginx.conf                  # SPA fallback + API reverse proxy
├── .env.example                # Environment variable template
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── eslint.config.js
```

## Prerequisites

- **Node.js** 22+ and **npm** (for local development)
- **Docker** and **Docker Compose** (for containerized deployment)
- A running **zPodFactory API** instance (`zpodapi`)

## Production Deployment (Docker)

1. **Clone and configure**

   ```bash
   git clone https://github.com/zPodFactory/zpodweb.git
   cd zpodweb
   cp .env.example .env
   # Edit .env to set your defaults (optional)
   ```

2. **Build and run**

   ```bash
   docker compose up -d --build
   ```

3. **Open** `http://localhost:8500` in your browser

The Docker image uses a multi-stage build: Node 22 Alpine compiles the app, then the output is served by Nginx Alpine. Nginx handles SPA fallback routing and the `/api/` reverse proxy (routing requests to the zpodapi URL specified by the `X-Target-Url` header).

To rebuild after code changes:

```bash
docker compose up -d --build
```

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/zPodFactory/zpodweb.git
   cd zpodweb
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment** (optional)

   ```bash
   cp .env.example .env
   # Edit .env to set your zpodapi defaults
   ```

4. **Start the dev server**

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:8500` (or the port configured in `.env`) with hot module replacement. The Vite dev server includes a built-in proxy that replicates the Nginx `/api/` reverse proxy behavior, so API calls work identically to production.

5. **Connect** to your zPodFactory API by entering the API URL and token on the login page.

> **Dev server logging:** All proxied API requests are logged to the terminal. Non-GET requests (POST, PUT, DELETE, etc.) also display the request and response payloads for easier debugging.

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR and API proxy |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | Run ESLint (flat config, ESLint 9) |
| `npm run preview` | Preview the production build locally |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZPODWEB_DEFAULT_ZPODFACTORY_NAME` | `zPodFactory` | Default target name shown in the login form |
| `ZPODWEB_DEFAULT_ZPODFACTORY_API_URL` | `http://172.16.0.10:8000` | Default zpodapi URL pre-filled in the login form |
| `ZPODWEB_DEFAULT_ZPODFACTORY_API_TOKEN` | `your-api-token-here` | Default zpodapi access token pre-filled in the login form |
| `ZPODWEB_DEFAULT_UI_PORT` | `8500` | Port to expose zpodweb on (dev server and Docker) |

## API Connection

zpodweb connects to `zpodapi` using:

- **API URL** — the base URL of your zPodFactory API (e.g., `http://172.16.0.10:8000`)
- **API Token** — an access token generated from the zPodFactory CLI (`zcli`)

You can find the superuser credentials on the zPodFactory instance:

```bash
cat $HOME/.config/zcli/.zclirc
```

This file contains the API URL and token needed to connect.

Target configurations are persisted in the browser's `localStorage`. When only a single target is saved, zpodweb will auto-connect on page load.

## License

See the [zPodFactory](https://github.com/zPodFactory) organization for license information.
