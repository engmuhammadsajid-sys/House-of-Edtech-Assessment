# Collab Editor

A production-grade **local-first collaborative document editor** with deterministic conflict resolution, real-time collaboration, version control, and AI-powered document tools.

## Links

- **GitHub Repository:** https://github.com/engmuhammadsajid-sys/House-of-Edtech-Assessment
- **Live Deployment:** https://house-of-edtech-assessment.vercel.app/

## Features

- **Offline-first** — IndexedDB persistence; create, edit, and refresh while offline
- **Real-time collaboration** — WebSocket presence, cursors, and typing indicators (requires `dev:ws` / `start:ws`)
- **Deterministic conflict resolution** — Operation-based sync with Lamport timestamps and vector clocks
- **Background sync** — Retry queue with exponential backoff and dead letter queue
- **Version control** — Git-like snapshots, timeline, restore, and compare
- **Authentication** — Auth.js with credentials and GitHub OAuth
- **Authorization** — RBAC with Owner, Editor, and Viewer roles; all logged-in users can view documents (non-members default to Viewer)
- **AI assistant** — Summarize, rewrite, improve writing, meeting notes, action items, and insights on selected text
- **Security** — Zod validation, rate limiting, and payload size limits

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 14+ (local install, Docker, or a hosted provider such as [Neon](https://neon.tech))
- **npm** 9+

## Quick Start

### 1. Install and configure

```bash
npm install

# Copy environment variables (Git Bash / macOS / Linux)
cp .env.example .env

# Windows PowerShell
copy .env.example .env
```

Edit `.env`:

- Set `DATABASE_URL` to your PostgreSQL database (default local example: `collab_editor`)
- Generate `AUTH_SECRET` with `openssl rand -base64 32`
- Set `NEXTAUTH_URL` to `http://localhost:3000`
- Set `NEXT_PUBLIC_SOCKET_URL` to `http://localhost:3000` for local WebSockets
- Optionally set `GROQ_API_KEY` for live AI responses ([console.groq.com](https://console.groq.com/))

Create the local database if needed:

```sql
CREATE DATABASE collab_editor;
```

### 2. Initialize the database

```bash
npx prisma db push
npx prisma generate
```

> **Windows tip:** If `prisma generate` fails with `EPERM`, stop `npm run dev` / `npm run dev:ws` first — another process may be locking the Prisma engine file.

### 3. Run the app

```bash
# Recommended — Next.js + Socket.io on one port
npm run dev:ws

# Next.js only (offline sync works; no live cursors/presence)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register at `/register`, then create a document from the dashboard.

### 4. Use the AI assistant

1. Open a document and **select text** in the editor.
2. Click **AI Assistant** in the toolbar.
3. The selected text appears in the sidebar — choose an action (Summarize, Rewrite, etc.).
4. Without `GROQ_API_KEY`, the API returns mock responses for development.

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js secret — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Public app URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SOCKET_URL` | Yes | WebSocket server URL (same as app URL when using `dev:ws` locally) |
| `GITHUB_ID` | No | GitHub OAuth client ID |
| `GITHUB_SECRET` | No | GitHub OAuth client secret |
| `GROQ_API_KEY` | No | Groq API key from [console.groq.com](https://console.groq.com/) (mock mode without it) |
| `GROQ_MODEL` | No | Groq model name (default `llama-3.3-70b-versatile`) |
| `REDIS_URL` | No | Redis URL for Socket.io horizontal scaling |
| `DATABASE_RLS_ENABLED` | No | Enable PostgreSQL RLS in production (`true` after `npm run db:rls`) |
| `PORT` | No | Server port (default `3000`) |
| `NODE_ENV` | No | `development` or `production` |

## Deployment

### Build and run (self-hosted)

```bash
npm run build
npm run start:ws   # Next.js + WebSocket (recommended)
# or
npm run start      # Next.js only (no real-time collaboration)
```

### Vercel + Neon (current live setup)

1. Import the GitHub repo into **Vercel** and connect a **Neon** PostgreSQL database.
2. Set these environment variables on Vercel:

   | Variable | Example |
   |----------|---------|
   | `DATABASE_URL` | From Neon integration |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `https://house-of-edtech-assessment.vercel.app` |
   | `GROQ_API_KEY` | Your Groq key (optional; mock mode without it) |
   | `NEXT_PUBLIC_SOCKET_URL` | WebSocket server URL (see below) |

3. Push the Prisma schema to production **once** (use Neon’s **direct / unpooled** connection string):

   ```bash
   # Quote the URL so special characters (e.g. &) are not interpreted by the shell
   export DATABASE_URL='postgresql://user:password@host/neondb?sslmode=require'
   npx prisma db push
   ```

4. Optionally enable RLS: `npm run db:rls` and set `DATABASE_RLS_ENABLED=true`.

5. Redeploy on Vercel after env changes.

> **Note:** Vercel alone cannot host persistent WebSockets. The live Vercel deployment supports the app, API, auth, offline sync, and AI. For full real-time cursors and presence, deploy `server.ts` separately (`npm run start:ws`) on Railway, Fly.io, or Render, then point `NEXT_PUBLIC_SOCKET_URL` at that host.

### Recommended architecture

1. **Vercel** — Next.js app and API routes (`prisma generate && next build`)
2. **PostgreSQL** — Neon, RDS, or similar (`DATABASE_URL`)
3. **WebSocket server** — Deploy `server.ts` separately on Railway, Fly.io, or Render
4. **Redis** (optional) — Multi-instance Socket.io via `REDIS_URL`

See [docs/Deployment.md](./docs/Deployment.md) for full deployment details.

## Testing

```bash
npm run lint
npm run typecheck
npm run test              # Unit tests (Vitest)
npm run test:integration  # Requires Postgres + RUN_INTEGRATION=true
npm run test:e2e          # Playwright (run dev:ws or dev first)
```

For E2E tests, install the browser once with `npm run playwright:install`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| State | Zustand, TanStack Query |
| Local Storage | IndexedDB via `idb` |
| Backend | Next.js Route Handlers, Prisma, PostgreSQL |
| Auth | Auth.js (NextAuth v5) |
| Realtime | Socket.io |
| AI | Groq API |
| Testing | Vitest, React Testing Library, Playwright |

## Project Structure

```
src/
├── app/              # Next.js App Router pages and API routes
├── components/       # Shared UI components (shadcn/ui)
├── features/         # Feature modules (editor, sync, auth, versioning, ai)
├── hooks/            # React hooks
├── lib/              # Client libraries (sync engine, IndexedDB, validation)
├── server/           # Server-side services, auth, repositories
├── store/            # Zustand stores
├── types/            # TypeScript type definitions
└── tests/            # Unit, integration, and E2E tests
```

## Documentation

- [Architecture](./docs/Architecture.md) — System design and tradeoffs
- [Sync Engine](./docs/SyncEngine.md) — Background synchronization
- [Conflict Resolution](./docs/ConflictResolution.md) — Deterministic merge algorithm
- [Convergence](./docs/Convergence.md) — Convergence proof and test evidence
- [RLS](./docs/RLS.md) — PostgreSQL row-level security
- [Deployment](./docs/Deployment.md) — Vercel, WebSocket server, Redis, scaling

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js development server |
| `npm run dev:ws` | Dev server with WebSocket (Socket.io) |
| `npm run build` | Production build |
| `npm run start` | Start Next.js production server |
| `npm run start:ws` | Start Next.js + WebSocket server |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:integration` | Integration tests (requires Postgres + `RUN_INTEGRATION=true`) |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run playwright:install` | Install Playwright Chromium browser |
| `npm run db:push` | Push Prisma schema to the database |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:rls` | Apply PostgreSQL RLS policies |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `P1000` / auth failed on `prisma db push` | Use the correct Neon password and **quote** the URL in the shell |
| `The table public.User does not exist` on Vercel | Run `npx prisma db push` against the production `DATABASE_URL` |
| `EPERM` on `prisma generate` (Windows) | Stop running dev servers, then retry |
| AI shows mock text | Set `GROQ_API_KEY` in `.env` or Vercel |
| No live cursors on Vercel | Deploy `server.ts` separately and set `NEXT_PUBLIC_SOCKET_URL` |
| "Select text in the editor first" | Select text in the editor before opening AI Assistant; selection is preserved in the sidebar |

## License

MIT
