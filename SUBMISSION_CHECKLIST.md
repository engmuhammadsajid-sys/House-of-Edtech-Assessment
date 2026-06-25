# Submission Checklist

## Repository

- **Repository URL:** https://github.com/khurram-dev-001/REPO_NAME_PLACEHOLDER

## Live Deployment

- **Live URL:** https://YOUR_DEPLOYMENT_URL_PLACEHOLDER

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | Public app URL (e.g. `https://your-app.vercel.app`) |
| `NEXT_PUBLIC_SOCKET_URL` | Yes | WebSocket server URL (same host for `dev:ws`, separate host in production) |
| `GITHUB_ID` | No | GitHub OAuth client ID |
| `GITHUB_SECRET` | No | GitHub OAuth client secret |
| `GROQ_API_KEY` | No | Groq API key (AI features use mock mode without it) |
| `GROQ_MODEL` | No | Groq model name (default `llama-3.3-70b-versatile`) |
| `REDIS_URL` | No | Redis URL for Socket.io horizontal scaling |
| `DATABASE_RLS_ENABLED` | No | Set to `true` in production after applying RLS |
| `PORT` | No | Server port (default `3000`) |
| `NODE_ENV` | No | `development` or `production` |

Copy `.env.example` to `.env` and fill in values before running locally.

## Migration Commands

```bash
# Install dependencies
npm install

# Apply database schema
npx prisma db push

# Generate Prisma client
npx prisma generate

# Apply PostgreSQL RLS policies (production)
npm run db:rls
```

## Deployment Commands

```bash
# Production build
npm run build

# Start Next.js (API + pages only)
npm run start

# Start with WebSocket server (recommended for real-time collaboration)
npm run start:ws
```

### Suggested deployment flow

1. Deploy PostgreSQL (Neon, RDS, etc.) and set `DATABASE_URL`.
2. Deploy the Next.js app to Vercel with required environment variables.
3. Run `npx prisma db push` and `npm run db:rls` against the production database.
4. Deploy `server.ts` to Railway, Fly.io, or Render for WebSockets (`npm run start:ws`).
5. Set `NEXT_PUBLIC_SOCKET_URL` to the WebSocket server URL.

See [docs/Deployment.md](./docs/Deployment.md) for full architecture details.

## Pre-submission Verification

```bash
npm run lint
npm run typecheck
npm run build
```
