# Architecture

## Overview

Collab Editor is a local-first collaborative document editor. The client is the source of truth; the network is optional. This inverts the traditional server-authoritative model used by most CRUD applications.

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  Editor  │→ │  Sync Engine │→ │  IndexedDB (Source  │   │
│  │    UI    │  │  + Merge     │  │  of Truth)          │   │
│  └──────────┘  └──────────────┘  └─────────────────────┘   │
│         ↕              ↕                      ↕              │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ WebSocket│  │  HTTP Sync   │  │  Operation Log      │   │
│  │ Presence │  │  API         │  │  (append-only)      │   │
│  └──────────┘  └──────────────┘  └─────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ (when online)
┌──────────────────────────▼──────────────────────────────────┐
│                     Server (Next.js)                           │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Auth.js  │  │  RBAC Layer  │  │  Operation Service  │   │
│  └──────────┘  └──────────────┘  └─────────────────────┘   │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Socket.io│  │  Rate Limit  │  │  PostgreSQL + Prisma│   │
│  └──────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Clean Architecture Layers

### Domain (`src/lib/sync/`, `src/types/`)

Pure business logic with no framework dependencies:
- `OperationLog` — append-only operation storage
- `MergeEngine` — deterministic document reconstruction
- `ConflictResolver` — orchestrates merge of local + remote ops
- `SyncEngine` — background sync with retry queue

### Application (`src/server/services/`)

Use cases orchestrating domain + infrastructure:
- `OperationService` — push/pull operations
- `VersionService` — snapshot management
- `RestoreService` — immutable version restoration
- `AIService` — AI document tools

### Infrastructure (`src/server/db/`, `src/lib/db/`)

- `LocalDocumentRepository` — IndexedDB document persistence
- `LocalOperationRepository` — local operation log
- `LocalSyncQueueRepository` — pending sync items
- Prisma repositories — PostgreSQL persistence

### Presentation (`src/app/`, `src/features/`, `src/components/`)

React components, pages, and API route handlers.

## Key Design Decisions

### Why Operation-Based Sync (Not Last-Write-Wins)?

Last-write-wins (LWW) loses data when two users edit concurrently. Operation-based sync with deterministic ordering ensures:
- Same operations → same document state on all clients
- No data loss from concurrent edits
- Offline edits merge correctly when reconnecting

### Why Local-First?

Users expect apps to work like native software:
- Instant UI response (no network latency)
- Works on planes, in tunnels, during outages
- Data survives browser refresh

### Why Lamport + Vector Clocks?

- **Lamport timestamps** provide a total order for operations
- **Vector clocks** detect concurrent (causally independent) operations
- Together they enable deterministic tie-breaking without a central coordinator

## Security Model

### Authentication
Auth.js with JWT sessions. Middleware protects `/dashboard`, `/documents`, and API routes.

### Authorization (RBAC)
| Role | Read | Edit | Sync | Versions | Delete | Members |
|------|------|------|------|----------|--------|---------|
| VIEWER | ✓ | | | | | |
| EDITOR | ✓ | ✓ | ✓ | ✓ | | |
| OWNER | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Documents are visible to every logged-in user. Users without an explicit membership are treated as **VIEWER**.

Viewers cannot send operations or push sync/realtime state updates. They may pull/read operations for presence. Owners can promote users to EDITOR via `POST /api/documents/[id]/members`.

### Tenant Scoping
Every document has a `tenantId`. Write/sync paths still verify the document tenant after role checks. Read access is global for authenticated users; write access remains role-gated (OWNER/EDITOR).

## Scaling Strategy

1. **Operations table** — indexed by `(documentId, lamportTime)` for efficient pull
2. **WebSocket rooms** — one room per document; horizontal scaling via Redis adapter
3. **Sync batching** — max 50 operations per push; debounced local edits
4. **Version snapshots** — periodic compaction to reduce operation replay cost
5. **CDN** — static assets via Vercel Edge Network

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| Operation-based CRDT | No data loss, deterministic | More complex than LWW |
| IndexedDB source of truth | True offline support | Sync complexity |
| String-based editor | Simple ops model | Not suitable for rich text yet |
| Custom Socket.io server | Full WebSocket support | Requires separate process on Vercel |
| Immutable version history | Audit trail, time travel | Storage growth |
