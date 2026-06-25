# Deployment

## Production Architecture

```
                    ┌─────────────────────┐
                    │   Vercel (Next.js)  │
                    │   App + API Routes  │
                    └──────────┬──────────┘
                               │ HTTPS
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼─────────┐  ┌───────▼───────┐  ┌────────▼────────┐
│ Socket.io Server  │  │  PostgreSQL   │  │  Redis (opt.)   │
│ Railway / Fly.io  │  │  Neon / RDS   │  │  Socket adapter │
└───────────────────┘  └───────────────┘  └─────────────────┘
```

## 1. Vercel Frontend + API

1. Push to GitHub and import to Vercel
2. Framework: Next.js, root: `.`
3. Build command: `prisma generate && next build`
4. Environment variables:

```
DATABASE_URL=postgresql://...
AUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://your-app.vercel.app
GITHUB_ID=...
GITHUB_SECRET=...
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
NEXT_PUBLIC_SOCKET_URL=https://ws.your-domain.com
DATABASE_RLS_ENABLED=true
```

5. Run migrations after deploy:
   ```bash
   npx prisma db push
   npm run db:rls
   ```

## 2. Dedicated Socket.io Server

Vercel serverless cannot host persistent WebSockets. Deploy `server.ts` separately:

```bash
# Railway / Fly.io / Render
npm run start:ws
```

Environment:
```
PORT=3000
NEXTAUTH_URL=https://your-app.vercel.app
AUTH_SECRET=<same as Vercel>
DATABASE_URL=<same as Vercel>
```

Set in Vercel: `NEXT_PUBLIC_SOCKET_URL=https://ws.your-domain.com`

### WebSocket Auth Flow

1. Client fetches `GET /api/auth/ws-token` (session cookie)
2. Connects to Socket.io with `auth: { token }`
3. Server validates JWT via `socket-auth.ts`
4. `join-document` checks document membership + RBAC

## 3. Redis Adapter (Horizontal Scaling)

For multiple Socket.io instances:

```typescript
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const pub = createClient({ url: process.env.REDIS_URL });
const sub = pub.duplicate();
await Promise.all([pub.connect(), sub.connect()]);
io.adapter(createAdapter(pub, sub));
```

| Concern | Strategy |
|---------|----------|
| Sticky sessions | Not required with Redis adapter |
| Room broadcast | Redis pub/sub across instances |
| Presence state | Still in-memory per instance; use Redis store for production scale |

## 4. PostgreSQL + RLS

### Apply RLS

```bash
npx prisma db push
npm run db:rls
```

### Prisma Integration

API routes run queries inside `withRlsContext(userId, fn)` which executes:

```sql
SELECT set_config('app.current_user_id', '<userId>', true);
```

Enable with `DATABASE_RLS_ENABLED=true`.

Policies are in `prisma/rls.sql`. See `docs/Architecture.md` for tenant model.

## 5. CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

1. Lint + typecheck
2. Unit tests (Vitest)
3. Integration tests (Postgres service + RLS)
4. Build
5. E2E tests (Playwright)

## 6. Scaling Checklist

- [ ] Redis adapter for Socket.io multi-instance
- [ ] PgBouncer connection pooling
- [ ] Operation log compaction (snapshot + truncate)
- [ ] Edge rate limiting (Upstash / Vercel WAF)
- [ ] Dead letter queue monitoring (`DeadLetterQueue` table)
- [ ] CDN for static assets (Vercel Edge)

## 7. Horizontal Scaling Strategy

| Component | Scale approach |
|-----------|----------------|
| Next.js API | Vercel auto-scaling |
| WebSocket | N instances + Redis adapter |
| PostgreSQL | Read replicas for pull; primary for push |
| IndexedDB | Client-side; no server scaling needed |
| Sync queue | Per-client IndexedDB (`LocalSyncQueueRepository`) |

## 8. Monitoring

- **Sentry** — error tracking
- **Vercel Analytics** — frontend performance
- **DLQ alerts** — query `DeadLetterQueue` count
- **Sync failure rate** — client queue `FAILED` status + server DLQ
