/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma, withRlsContext } from "@/server/db/prisma";

const runIntegration = process.env.RUN_INTEGRATION === "true";

describe.skipIf(!runIntegration)("Integration: PostgreSQL RLS", () => {
  let ownerId: string;
  let outsiderId: string;
  let documentId: string;
  const prevRls = process.env.DATABASE_RLS_ENABLED;

  beforeAll(async () => {
    process.env.DATABASE_RLS_ENABLED = "true";
    process.env.DATABASE_RLS_ROLE = "collab_app";

    const owner = await prisma.user.create({
      data: {
        email: `rls-owner-${Date.now()}@test.com`,
        name: "RLS Owner",
        passwordHash: await bcrypt.hash("password123", 12),
      },
    });
    ownerId = owner.id;

    const outsider = await prisma.user.create({
      data: {
        email: `rls-outsider-${Date.now()}@test.com`,
        name: "RLS Outsider",
        passwordHash: await bcrypt.hash("password123", 12),
      },
    });
    outsiderId = outsider.id;

    const doc = await prisma.document.create({
      data: {
        title: "RLS Doc",
        ownerId,
        tenantId: ownerId,
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    process.env.DATABASE_RLS_ENABLED = prevRls;
    await prisma.activityLog.deleteMany({ where: { documentId } });
    await prisma.documentMember.deleteMany({ where: { documentId } });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.activityLog.deleteMany({
      where: { userId: { in: [ownerId, outsiderId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
    await prisma.$disconnect();
  });

  it("blocks outsider from reading document under RLS", async () => {
    const outsiderDocs = await withRlsContext(outsiderId, async (db) =>
      db.document.findMany({ where: { id: documentId } })
    );
    expect(outsiderDocs).toHaveLength(0);
  });

  it("allows owner to read document under RLS", async () => {
    const ownerDocs = await withRlsContext(ownerId, async (db) =>
      db.document.findMany({ where: { id: documentId } })
    );
    expect(ownerDocs).toHaveLength(1);
    expect(ownerDocs[0].id).toBe(documentId);
  });
});
