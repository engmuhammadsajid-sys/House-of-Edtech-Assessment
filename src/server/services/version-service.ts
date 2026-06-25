import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export class VersionService {
  async listVersions(documentId: string) {
    return prisma.versionSnapshot.findMany({
      where: { documentId },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getVersion(versionId: string) {
    return prisma.versionSnapshot.findUnique({
      where: { id: versionId },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async createSnapshot(
    documentId: string,
    userId: string,
    name: string,
    content: string,
    metadata?: Record<string, unknown>
  ) {
    return prisma.versionSnapshot.create({
      data: {
        documentId,
        name,
        content,
        createdById: userId,
        metadata: metadata as Prisma.InputJsonValue,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }
}

export class RestoreService {
  constructor(private versionService: VersionService) {}

  /**
   * Restore creates a NEW version — history is never overwritten.
   */
  async restore(documentId: string, versionId: string, userId: string) {
    const version = await this.versionService.getVersion(versionId);
    if (!version || version.documentId !== documentId) {
      throw new Error("Version not found");
    }

    const snapshot = await prisma.$transaction(async (tx) => {
      const restored = await tx.versionSnapshot.create({
        data: {
          documentId,
          name: `Restored: ${version.name}`,
          content: version.content,
          createdById: userId,
          parentId: versionId,
          isRestore: true,
        },
      });

      await tx.document.update({
        where: { id: documentId },
        data: { content: version.content, updatedAt: new Date() },
      });

      await tx.operation.deleteMany({ where: { documentId } });

      await tx.activityLog.create({
        data: {
          documentId,
          userId,
          type: "VERSION_RESTORED",
          metadata: { versionId, newVersionId: restored.id },
        },
      });

      return restored;
    });

    return snapshot;
  }
}

export class SnapshotService {
  async compare(versionIdA: string, versionIdB: string) {
    const [a, b] = await Promise.all([
      prisma.versionSnapshot.findUnique({ where: { id: versionIdA } }),
      prisma.versionSnapshot.findUnique({ where: { id: versionIdB } }),
    ]);

    if (!a || !b) throw new Error("Version not found");

    const linesA = a.content.split("\n");
    const linesB = b.content.split("\n");
    const maxLen = Math.max(linesA.length, linesB.length);
    const diff: { line: number; a?: string; b?: string; changed: boolean }[] = [];

    for (let i = 0; i < maxLen; i++) {
      const lineA = linesA[i];
      const lineB = linesB[i];
      diff.push({
        line: i + 1,
        a: lineA,
        b: lineB,
        changed: lineA !== lineB,
      });
    }

    return { versionA: a, versionB: b, diff };
  }
}

export const versionService = new VersionService();
export const restoreService = new RestoreService(versionService);
export const snapshotService = new SnapshotService();
