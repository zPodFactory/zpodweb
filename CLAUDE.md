# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

zpodweb is a React SPA for managing [zPodFactory](https://zpodfactory.github.io) — an automated nested lab deployment platform for VMware environments. It connects to the zPodFactory API (`zpodapi`) via an Nginx reverse proxy.

## Shell Setup

Before running any node/npm commands, source nvm to get the correct PATH:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

## Commands

```bash
npm run dev        # Start Vite dev server at localhost:5173
npm run build      # TypeScript check + Vite production build
npm run lint       # ESLint (flat config, ESLint 9)
npm run preview    # Preview production build locally
```

Docker: `docker compose up -d --build` serves on port 8500.

## Development Workflow

Use `npm run dev` for local development — Vite provides hot module replacement so changes are reflected instantly. The Vite dev server includes a proxy config (`vite.config.ts`) that replicates the Nginx `/api/` reverse proxy behavior, dynamically routing requests based on the `X-Target-Url` header.

After completing changes, rebuild the Docker stack to verify the production build:
```bash
docker compose up -d --build
```

## Architecture

### Tech Stack
React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 3 + Zustand 5 + React Router 7 + Radix UI + Axios

### Key Directories
- `src/pages/` — Route pages (dashboard, zpods, zpod-detail, components, libraries, profiles, endpoints, factory, settings, login, about)
- `src/components/ui/` — Radix UI wrapper components (shadcn pattern)
- `src/components/layout/` — App shell: root-layout, sidebar, header, mobile-nav
- `src/hooks/` — `use-api.ts` (all API methods), `use-polling.ts` (auto-refresh), `use-sort.ts` (table sorting)
- `src/stores/` — Zustand stores: target-store (persisted), auth-store (volatile), preferences-store (persisted)
- `src/lib/` — Axios instance (`api.ts`), utilities (`utils.ts`), status/component color mappings
- `src/types/index.ts` — All TypeScript interfaces
- `src/router/index.tsx` — React Router v7 route definitions

### Data Flow
- No global data cache — each page fetches its own data via `useApi()` hook
- `usePolling()` auto-refreshes at a configurable interval (default 5s, stored in preferences-store)
- Axios request interceptor attaches `access_token` + `X-Target-Url` headers
- Nginx proxies `/api/*` to the target URL from `X-Target-Url` header (avoids CORS)
- 403 responses auto-trigger logout via Axios response interceptor

### Multi-Target System
- Users can save multiple zPodFactory API targets (URL + token) in target-store (localStorage)
- Active target determines all API routing via the `X-Target-Url` header
- Single saved target auto-connects on page load
- `AuthGuard` component protects routes, redirecting to `/login` when unauthenticated

### Styling
- Catppuccin Mocha dark theme via CSS variables (HSL) in `src/index.css`
- Dark mode toggled via `next-themes` with Tailwind `class` strategy
- Component types get deterministic hex colors via hash (`src/lib/component-colors.ts`)
- Status badges map to Tailwind classes (`src/lib/status-colors.ts`)

### Path Alias
`@/*` maps to `src/*` (configured in tsconfig.json + vite.config.ts)

### Environment Variables
Prefix: `ZPODWEB_` (configured in vite.config.ts). See `.env.example` for defaults.

### Production
Multi-stage Docker build: Node 22 Alpine (build) → Nginx Alpine (serve). Nginx handles SPA fallback routing and `/api/` reverse proxy. Max upload size: 256MB (chunked/resumable uploads supported).
