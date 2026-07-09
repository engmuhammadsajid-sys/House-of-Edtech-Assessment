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
  let editorId: string;
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

    const editor = await prisma.user.create({
      data: {
        email: `editor-${Date.now()}@test.com`,
        name: "Editor",
        passwordHash: await bcrypt.hash("password123", 12),
      },
    });
    editorId = editor.id;

    const doc = await prisma.document.create({
      data: {
        title: "Shared Doc",
        ownerId,
        tenantId: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: editorId, role: "EDITOR" },
          ],
        },
      },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    await prisma.documentMember.deleteMany({ where: { documentId } });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, outsiderId, editorId] } },
    });
    await prisma.$disconnect();
  });

  it("owner has sync access", async () => {
    const access = await authz.requireSync(documentId, ownerId);
    expect(access.role).toBe("OWNER");
    expect(access.tenantId).toBe(ownerId);
  });

  it("outsider gets default VIEWER read access to any document", async () => {
    const access = await authz.getDocumentAccess(documentId, outsiderId);
    expect(access).not.toBeNull();
    expect(access?.role).toBe("VIEWER");
  });

  it("viewer cannot sync / push state updates", async () => {
    await expect(authz.requireSync(documentId, outsiderId)).rejects.toThrow(
      "Sync access denied for viewers"
    );
  });

  it("explicit EDITOR can sync", async () => {
    const access = await authz.requireSync(documentId, editorId);
    expect(access.role).toBe("EDITOR");
  });

  it("assertDocumentTenant passes for valid access", async () => {
    const access = await authz.requireSync(documentId, ownerId);
    await expect(authz.assertDocumentTenant(access)).resolves.toBeUndefined();
  });
});
