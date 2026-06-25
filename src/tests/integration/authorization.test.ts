/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthorizationService } from "@/server/auth/authorization";

const prisma = new PrismaClient();
const authz = new AuthorizationService();

const runIntegration = process.env.RUN_INTEGRATION === "true";

describe.skipIf(!runIntegration)("Integration: authorization and tenant isolation", () => {
  let ownerId: string;
  let outsiderId: string;
  let documentId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `owner-${Date.now()}@test.com`,
        name: "Owner",
        passwordHash: await bcrypt.hash("password123", 12),
      },
    });
    ownerId = owner.id;

    const outsider = await prisma.user.create({
      data: {
        email: `outsider-${Date.now()}@test.com`,
        name: "Outsider",
        passwordHash: await bcrypt.hash("password123", 12),
      },
    });
    outsiderId = outsider.id;

    const doc = await prisma.document.create({
      data: {
        title: "Private Doc",
        ownerId,
        tenantId: ownerId,
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    await prisma.documentMember.deleteMany({ where: { documentId } });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
    await prisma.$disconnect();
  });

  it("owner has sync access", async () => {
    const access = await authz.requireSync(documentId, ownerId);
    expect(access.role).toBe("OWNER");
    expect(access.tenantId).toBe(ownerId);
  });

  it("outsider cannot access document", async () => {
    const access = await authz.getDocumentAccess(documentId, outsiderId);
    expect(access).toBeNull();
  });

  it("assertDocumentTenant passes for valid access", async () => {
    const access = await authz.requireSync(documentId, ownerId);
    await expect(authz.assertDocumentTenant(access)).resolves.toBeUndefined();
  });
});
