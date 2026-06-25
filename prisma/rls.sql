-- Row Level Security for Collab Editor (PostgreSQL only)
-- Apply: npm run db:rls
-- Do not run in SQL Server / T-SQL tools; use psql or npm run db:rls

-- Drop existing policies (idempotent re-apply)
DROP POLICY IF EXISTS document_select ON "Document";
DROP POLICY IF EXISTS document_modify ON "Document";
DROP POLICY IF EXISTS document_member_select ON "DocumentMember";
DROP POLICY IF EXISTS operation_access ON "Operation";
DROP POLICY IF EXISTS version_select ON "VersionSnapshot";
DROP POLICY IF EXISTS version_modify ON "VersionSnapshot";
DROP POLICY IF EXISTS dead_letter_access ON "DeadLetterQueue";

DROP FUNCTION IF EXISTS app_can_read_document(text);
DROP FUNCTION IF EXISTS app_can_edit_document(text);
DROP FUNCTION IF EXISTS app_current_user_id();

-- Helper functions use SECURITY DEFINER to avoid Document <-> DocumentMember policy recursion.
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '');
$$;

CREATE OR REPLACE FUNCTION app_can_read_document(p_document_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Document" d
    WHERE d.id = p_document_id
      AND (
        d."ownerId" = app_current_user_id()
        OR EXISTS (
          SELECT 1 FROM "DocumentMember" dm
          WHERE dm."documentId" = d.id
            AND dm."userId" = app_current_user_id()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_can_edit_document(p_document_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Document" d
    WHERE d.id = p_document_id
      AND (
        d."ownerId" = app_current_user_id()
        OR EXISTS (
          SELECT 1 FROM "DocumentMember" dm
          WHERE dm."documentId" = d.id
            AND dm."userId" = app_current_user_id()
            AND dm.role IN ('OWNER', 'EDITOR')
        )
      )
  );
$$;

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Operation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VersionSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeadLetterQueue" ENABLE ROW LEVEL SECURITY;

-- Prisma connects as the table owner. FORCE prevents owners from bypassing RLS.
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DocumentMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Operation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "VersionSnapshot" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DeadLetterQueue" FORCE ROW LEVEL SECURITY;

CREATE POLICY document_select ON "Document"
  FOR SELECT
  USING (app_can_read_document(id));

CREATE POLICY document_modify ON "Document"
  FOR ALL
  USING (app_can_edit_document(id));

CREATE POLICY document_member_select ON "DocumentMember"
  FOR SELECT
  USING (app_can_read_document("documentId"));

CREATE POLICY operation_access ON "Operation"
  FOR ALL
  USING (app_can_edit_document("documentId"));

CREATE POLICY version_select ON "VersionSnapshot"
  FOR SELECT
  USING (app_can_read_document("documentId"));

CREATE POLICY version_modify ON "VersionSnapshot"
  FOR ALL
  USING (app_can_edit_document("documentId"));

CREATE POLICY dead_letter_access ON "DeadLetterQueue"
  FOR ALL
  USING (app_can_edit_document("documentId"));

-- Per-request: withRlsContext runs set_config('app.current_user_id', userId, true)
