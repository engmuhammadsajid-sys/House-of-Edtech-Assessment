/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { OperationService } from "@/server/services/operation-service";
import { RestoreService, VersionService } from "@/server/services/version-service";
import type { DocumentOperation } from "@/types/operation";

const prisma = new PrismaClient();
const operationService = new OperationService();
const versionService = new VersionService();
const restoreService = new RestoreService(versionService);

const runIntegration = process.env.RUN_INTEGRATION === "true";

describe.skipIf(!runIntegration)("Integration: sync and restore", () => {
  let userId: string;
  let documentId: string;
  let tenantId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `integration-${Date.now()}@test.com`,
        name: "Integration User",
        passwordHash: await bcrypt.hash("password123", 12),
      },
    });
    userId = user.id;
    tenantId = userId;

    const doc = await prisma.document.create({
      data: {
        title: "Integration Doc",
        ownerId: userId,
        tenantId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    await prisma.deadLetterQueue.deleteMany({ where: { documentId } });
    await prisma.operation.deleteMany({ where: { documentId } });
    await prisma.versionSnapshot.deleteMany({ where: { documentId } });
    await prisma.activityLog.deleteMany({
      where: { OR: [{ documentId }, { userId }] },
    });
    await prisma.documentMember.deleteMany({ where: { documentId } });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  function makeOp(id: string, content: string): DocumentOperation {
    return {
      id,
      documentId,
      userId,
      type: "INSERT",
      position: 0,
      content,
      length: 0,
      timestamp: Date.now(),
      lamportTime: 1,
      vectorClock: { [userId]: 1 },
      clientId: id,
    };
  }

  it("pushes and pulls operations with tenant scoping", async () => {
    const op = makeOp("int-op-1", "Hello");
    await operationService.pushOperations(documentId, userId, userId, [op]);

    const pulled = await operationService.pullOperations(documentId, userId);
    expect(pulled).toHaveLength(1);
    expect(pulled[0].content).toBe("Hello");
  });

  it("rejects push for wrong tenant", async () => {
    const op = makeOp("int-op-2", "Bad");
    await expect(
      operationService.pushOperations(documentId, "wrong-tenant", userId, [op])
    ).rejects.toThrow();
  });

  it("restore clears operations and preserves content", async () => {
    await operationService.pushOperations(documentId, tenantId, userId, [
      makeOp("int-op-3", "Stale"),
    ]);

    const version = await versionService.createSnapshot(
      documentId,
      userId,
      "v1",
      "Restored content"
    );

    await restoreService.restore(documentId, version.id, userId);

    const ops = await operationService.pullOperations(documentId, tenantId);
    expect(ops).toHaveLength(0);

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    expect(doc?.content).toBe("Restored content");
  });
});
