import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const RLS_USER_KEY = "app.current_user_id";
export const RLS_APP_ROLE = "collab_app";

const rlsContext = new AsyncLocalStorage<{ userId: string }>();

function assertSafeRoleName(role: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(role)) {
    throw new Error(`Invalid DATABASE_RLS_ROLE: ${role}`);
  }
  return role;
}

export type RlsDb = Prisma.TransactionClient | typeof prisma;

/**
 * Run queries with PostgreSQL RLS session variable set (when DATABASE_RLS_ENABLED=true).
 * Uses a single transaction so set_config and queries share the same connection.
 */
export async function withRlsContext<T>(
  userId: string,
  fn: (db: RlsDb) => Promise<T>
): Promise<T> {
  return rlsContext.run({ userId }, async () => {
    if (process.env.DATABASE_RLS_ENABLED !== "true") {
      return fn(prisma);
    }
    return prisma.$transaction(async (tx) => {
      const role = assertSafeRoleName(process.env.DATABASE_RLS_ROLE ?? RLS_APP_ROLE);
      // Superusers bypass RLS even with FORCE; use a NOBYPASSRLS role (created by npm run db:rls).
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$executeRawUnsafe(
        `SELECT set_config('${RLS_USER_KEY}', $1, true)`,
        userId
      );
      return fn(tx);
    });
  });
}

export function getRlsUserId(): string | undefined {
  return rlsContext.getStore()?.userId;
}
