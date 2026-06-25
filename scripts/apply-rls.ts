#!/usr/bin/env node
/**
 * Apply PostgreSQL RLS policies from prisma/rls.sql
 * Usage: npm run db:rls
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Remove line comments so semicolons inside `-- ...` are not treated as statement terminators. */
function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const commentIndex = line.indexOf("--");
      if (commentIndex === -1) return line;
      return line.slice(0, commentIndex);
    })
    .join("\n");
}

function splitSqlStatements(sql: string): string[] {
  const cleaned = stripLineComments(sql);
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";

  for (let i = 0; i < cleaned.length; i++) {
    if (!inDollarQuote && cleaned[i] === "$") {
      const open = cleaned.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (open) {
        inDollarQuote = true;
        dollarTag = open[1];
        current += open[0];
        i += open[0].length - 1;
        continue;
      }
    } else if (inDollarQuote && cleaned[i] === "$") {
      const close = cleaned.slice(i).match(new RegExp(`^\\$${dollarTag}\\$`));
      if (close) {
        inDollarQuote = false;
        dollarTag = "";
        current += close[0];
        i += close[0].length - 1;
        continue;
      }
    }

    if (cleaned[i] === ";" && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
      continue;
    }

    current += cleaned[i];
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}

async function main() {
  const sqlPath = join(process.cwd(), "prisma", "rls.sql");
  const sql = readFileSync(sqlPath, "utf-8");
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  await ensureRlsAppRole();

  console.log(`RLS policies applied successfully (${statements.length} statements).`);
}

/** Application role subject to RLS (superuser / BYPASSRLS connections skip policies). */
async function ensureRlsAppRole() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'collab_app') THEN
        CREATE ROLE collab_app NOLOGIN NOBYPASSRLS;
      ELSE
        ALTER ROLE collab_app NOBYPASSRLS;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO collab_app`);
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO collab_app`
  );
  await prisma.$executeRawUnsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO collab_app`
  );
  await prisma.$executeRawUnsafe(`GRANT collab_app TO CURRENT_USER`);
  await prisma.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION app_current_user_id() TO collab_app`);
  await prisma.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION app_can_read_document(text) TO collab_app`);
  await prisma.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION app_can_edit_document(text) TO collab_app`);
  await prisma.$executeRawUnsafe(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO collab_app
  `);
  console.log("RLS application role collab_app ready (NOBYPASSRLS).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
