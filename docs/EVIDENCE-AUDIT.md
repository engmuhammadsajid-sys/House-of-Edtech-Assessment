# Evidence Audit

Classifications use code and test evidence only.

---

## 1. Persistent sync queue

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/lib/db/local-sync-queue-repository.ts` |
| Class | `LocalSyncQueueRepository.saveBatch` |
| File | `src/lib/sync/sync-engine.ts` |
| Functions | `initialize()`, `persistQueue()` |
| File | `src/hooks/use-collaborative-editor.ts` |
| Wiring | `persistQueue`, `loadQueue`, `await engine.initialize()` |

**Tests:**
- `src/tests/unit/local-sync-queue-repository.test.ts` — IndexedDB persist + reload across repository instances
- `src/tests/unit/sync-engine.test.ts` — `initialize restores persisted queue`, `persistQueue is called when applying local operations`

---

## 2. Dead letter queue

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/server/services/dead-letter-service.ts` |
| Class | `DeadLetterService` |
| File | `src/lib/sync/sync-engine.ts` |
| Function | `handlePushFailure()` → `onDeadLetter` |
| File | `src/app/api/documents/[id]/dead-letter/route.ts` |
| File | `src/features/sync/dead-letter-panel.tsx` |

**Tests:**
- `src/tests/unit/dead-letter-service.test.ts` — list, enqueue, retry
- `src/tests/unit/sync-engine.test.ts` — `invokes onDeadLetter when retries are exhausted`

---

## 3. Tenant isolation enforcement

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/server/db/tenant.ts` |
| Functions | `tenantDocumentWhere`, `assertTenantScope` |
| File | `src/server/services/operation-service.ts` |
| Class | `OperationService` — uses `tenantDocumentWhere` |
| File | `src/server/auth/authorization.ts` |
| Function | `assertDocumentTenant` — uses `tenantDocumentWhere` |

**Tests:**
- `src/tests/unit/tenant.test.ts` — scope helpers
- `src/tests/unit/operation-service.test.ts` — tenant mismatch on push/pull
- `src/tests/integration/sync-restore.test.ts` — `rejects push for wrong tenant`
- `src/tests/integration/authorization.test.ts` — outsider blocked

---

## 4. PostgreSQL RLS

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `prisma/rls.sql` |
| File | `scripts/apply-rls.ts` |
| File | `src/server/db/prisma.ts` |
| Function | `withRlsContext` |

**Tests:**
- `src/tests/integration/rls.test.ts` — outsider blocked, owner allowed under `DATABASE_RLS_ENABLED=true`
- CI: `.github/workflows/ci.yml` runs `npm run db:rls` before integration tests

---

## 5. WebSocket broadcast path

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/hooks/use-collaborative-editor.ts` | `emitOperation(op)` |
| File | `src/hooks/use-presence.ts` | `emitOperation`, `remote-operation` listener |
| File | `src/server/realtime/socket-server.ts` | `socket.on("operation")` → `remote-operation` |

**Tests:**
- `src/tests/unit/socket-server.test.ts` — two clients; editor relay to collaborator
- `src/tests/unit/sync-engine.test.ts` — `applies remote operations without queueing`

---

## 6. Reconnect recovery

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/lib/sync/sync-engine.ts` |
| Function | `reconcile()` |
| File | `src/hooks/use-presence.ts` |
| Wiring | `onReconnect` on `connect` |
| File | `src/hooks/use-collaborative-editor.ts` |
| Wiring | `onReconnect: reconcile` |

**Tests:**
- `src/tests/unit/sync-engine.test.ts` — `reconcile pushes pending operations then pulls remote changes`

---

## 7. BroadcastChannel leader election

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/lib/sync/tab-coordinator.ts` |
| Class | `TabCoordinator` |
| File | `src/lib/sync/sync-engine.ts` |
| Function | `sync()` leader gate via `isSyncLeader` |

**Tests:**
- `src/tests/unit/tab-coordinator.test.ts` — leader election, follower tab, broadcast
- `src/tests/unit/sync-engine.test.ts` — `sync skips when tab is not sync leader`

---

## 8. Convergence tests

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/tests/unit/convergence.test.ts` |

---

## 9. Integration tests

**✅ VERIFIED**

| File | Coverage |
|------|----------|
| `src/tests/integration/sync-restore.test.ts` | sync, restore, tenant |
| `src/tests/integration/authorization.test.ts` | auth, tenant |
| `src/tests/integration/rls.test.ts` | RLS policies |

**CI:** `.github/workflows/ci.yml` — `RUN_INTEGRATION=true`, `npm run test:integration`

---

## 10. E2E tests

**✅ VERIFIED**

| File | `src/tests/e2e/app.spec.ts` |

**Tests:** auth pages, protected routes, create/edit, reload persistence, offline editing, viewer restrictions

**CI:** `.github/workflows/ci.yml` — `npm run test:e2e`

---

## 11. Viewer UI restrictions

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/features/editor/editor-toolbar.tsx` |
| File | `src/features/editor/collaborative-editor.tsx` |
| File | `src/app/documents/[id]/page.tsx` |

**Tests:**
- `src/tests/unit/editor-toolbar.test.tsx` — Snapshot/AI hidden when `readOnly`
- `src/tests/e2e/app.spec.ts` — viewer role via IndexedDB bootstrap + offline

---

## 12. Redis deployment strategy

**✅ VERIFIED**

| Field | Evidence |
|-------|----------|
| File | `src/server/realtime/redis-adapter.ts` |
| Function | `attachRedisAdapter` |
| File | `src/server/realtime/socket-server.ts` |
| Wiring | `await attachRedisAdapter(io)` |
| File | `docs/Deployment.md` |
| Section | Redis adapter |

**Tests:**
- `src/tests/unit/redis-adapter.test.ts` — no-op without `REDIS_URL`, attaches adapter when set
