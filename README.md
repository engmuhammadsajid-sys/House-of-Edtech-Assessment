# Collab Editor

A production-grade **local-first collaborative document editor** with deterministic conflict resolution, real-time collaboration, version control, and AI-powered document tools.

## Links

- **GitHub Repository:** https://github.com/khurram-dev-001/REPO_NAME_PLACEHOLDER
- **Live Deployment:** https://YOUR_DEPLOYMENT_URL_PLACEHOLDER

## Features

- **Offline-first** — IndexedDB persistence; create, edit, and refresh while offline
- **Real-time collaboration** — WebSocket presence, cursors, typing indicators
- **Deterministic conflict resolution** — Operation-based sync with Lamport timestamps and vector clocks
- **Background sync** — Retry queue with exponential backoff and dead letter queue
- **Version control** — Git-like snapshots, timeline, restore, and compare
- **Authentication** — Auth.js with credentials and GitHub OAuth
- **Authorization** — RBAC with Owner, Editor, Viewer roles
- **AI assistant** — Summary, rewrite, meeting notes, action items, insights
- **Security** — Zod validation, rate limiting, payload size limits

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Set up database
npx prisma db push
npx prisma generate

# Run development server (with WebSocket support)
npm run dev:ws

# Or standard Next.js dev (no WebSocket)
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js secret — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Public app URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SOCKET_URL` | Yes | WebSocket server URL |
| `GITHUB_ID` | No | GitHub OAuth client ID |
| `GITHUB_SECRET` | No | GitHub OAuth client secret |
| `GROQ_API_KEY` | No | Groq API key from [console.groq.com](https://console.groq.com/) (mock mode without it) |
| `GROQ_MODEL` | No | Groq model name (default `llama-3.3-70b-versatile`) |
| `REDIS_URL` | No | Redis URL for Socket.io scaling |
| `DATABASE_RLS_ENABLED` | No | Enable PostgreSQL RLS in production |
| `PORT` | No | Server port (default `3000`) |
| `NODE_ENV` | No | `development` or `production` |

## Deployment

### Build and run

```bash
npm run build
npm run start:ws   # Next.js + WebSocket (recommended)
# or
npm run start      # Next.js only (no real-time collaboration)
```

### Database setup (production)

```bash
npx prisma db push
npm run db:rls
```

### Recommended architecture

1. **Vercel** — Next.js app and API routes (`prisma generate && next build`)
2. **PostgreSQL** — Neon, RDS, or similar (`DATABASE_URL`)
3. **WebSocket server** — Deploy `server.ts` separately (`npm run start:ws`) on Railway, Fly.io, or Render
4. **Redis** (optional) — Multi-instance Socket.io via `REDIS_URL`

Set `NEXT_PUBLIC_SOCKET_URL` to your WebSocket server URL in production.

See [docs/Deployment.md](./docs/Deployment.md) for full deployment details.

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
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:integration` | Integration tests (requires Postgres + `RUN_INTEGRATION=true`) |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run db:rls` | Apply PostgreSQL RLS policies |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## License

MIT
