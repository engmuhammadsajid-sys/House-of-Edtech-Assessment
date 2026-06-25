# Row Level Security

## Overview

PostgreSQL RLS provides defense-in-depth tenant isolation alongside application-level checks in `authorization.ts`.

## Apply

```bash
npx prisma db push
npm run db:rls
```

## Session Variable

Each authenticated request sets:

```sql
SELECT set_config('app.current_user_id', '<userId>', true);
```

Via `withRlsContext()` in `src/server/db/prisma.ts`.

Enable in production: `DATABASE_RLS_ENABLED=true`

## Policies

Defined in `prisma/rls.sql`:

| Table | Policy |
|-------|--------|
| Document | Select: `app_can_read_document`; Modify: `app_can_edit_document` |
| DocumentMember | Select: readable if parent document is readable |
| Operation | All: editors and owners |
| VersionSnapshot | Select: readers; Modify: editors+ |
| DeadLetterQueue | All: editors+ |

Helper functions (`app_can_read_document`, `app_can_edit_document`) are `SECURITY DEFINER` to avoid policy recursion between `Document` and `DocumentMember`.

## Prisma Notes

- Prisma uses a single DB role; RLS filters rows per `app.current_user_id`
- `withRlsContext` wraps `set_config` and queries in one transaction (same connection)
- Tables use `FORCE ROW LEVEL SECURITY` so the table owner cannot bypass policies
- Queries run as `collab_app` (`SET LOCAL ROLE`) — a `NOBYPASSRLS` role created by `npm run db:rls`
- Superuser connections bypass RLS unless switched to `collab_app` inside `withRlsContext`

## Tenant Isolation (Application Layer)

Additionally enforced in:

- `authorization.ts` — `assertDocumentTenant()`
- `operation-service.ts` — `where: { id, tenantId }`
- Sync API routes pass `access.tenantId` to services
