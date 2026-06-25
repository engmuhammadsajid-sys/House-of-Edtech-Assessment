# Sync Engine

## Overview

The `SyncEngine` manages background synchronization between local IndexedDB storage and the remote PostgreSQL server. It never blocks the UI — all network operations are asynchronous.

## States

```
┌────────┐    online     ┌─────────┐    push/pull    ┌────────┐
│ offline│──────────────→│  idle   │────────────────→│ syncing│
└────────┘               └─────────┘                 └────────┘
     ↑                        │                           │
     │                   error │                           │ success
     │                        ▼                           ▼
     │                   ┌────────┐                 ┌────────┐
     └───────────────────│ error  │                 │  idle  │
                         └────────┘                 └────────┘
```

## Sync Flow

### 1. Local Edit
```
User types → debounce (150ms) → generate operations → apply locally → queue for sync
```

### 2. Push (when online)
```
Get pending ops → mark SYNCING → POST /api/documents/:id/sync → mark SYNCED
```

### 3. Pull (when online)
```
GET /api/documents/:id/sync?since=lamportTime → merge remote ops → update local content
```

### 4. Retry on Failure
```
FAILED → exponential backoff (1s, 2s, 4s, 8s, 16s, max 60s) → retry
Max retries (5) → move to Dead Letter Queue
```

## Queue Item Lifecycle

| Status | Meaning |
|--------|---------|
| PENDING | Waiting to sync |
| SYNCING | Currently uploading |
| SYNCED | Acknowledged by server |
| FAILED | Error; will retry with backoff |

## Components

### LocalSyncQueueRepository
Persists queue items to IndexedDB (`syncQueue` store) for crash recovery. Wired in `use-collaborative-editor.ts` via `persistQueue` / `loadQueue` callbacks.

### TabCoordinator
Multi-tab leader election via `BroadcastChannel` + `localStorage`. Only the leader tab runs background sync to prevent duplicate sync loops.

### DeadLetterQueue
Client: failed items after max retries POST to `/api/documents/:id/dead-letter`. Server: Prisma `DeadLetterQueue` table. UI: `DeadLetterPanel` with retry.

### SyncEngine
- Monitors `navigator.onLine`
- Polls every 3s when online (leader tab only)
- `reconcile()` on WebSocket reconnect
- Batches up to 50 operations per push
- Updates UI via callbacks (`onStatusChange`, `onQueueUpdate`, `onContentUpdate`)

## Offline Scenarios

| Scenario | Behavior |
|----------|----------|
| Create document offline | Saved to IndexedDB; synced on reconnect |
| Edit offline | Operations queued locally; content updated immediately |
| Refresh offline | IndexedDB loads persisted state |
| Reopen browser offline | Full state restored from IndexedDB |
| Reconnect | Push pending → pull remote → merge |

## Never Lose Edits

Operations are append-only. Even if sync fails:
1. Local content is already updated (optimistic)
2. Operations remain in IndexedDB
3. Queue retries with backoff
4. Dead letter queue preserves failed items for manual recovery

## Performance

- **Debouncing**: 150ms debounce on typing to batch character diffs
- **Batching**: Max 50 ops per HTTP request
- **IndexedDB batching**: Transaction-based writes for multiple operations
- **Selective pull**: Only fetch operations since last known Lamport time
