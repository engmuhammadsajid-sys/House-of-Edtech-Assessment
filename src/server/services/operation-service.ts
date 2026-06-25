import { prisma } from "@/server/db/prisma";
import { tenantDocumentWhere } from "@/server/db/tenant";
import { MergeEngine } from "@/lib/sync/merge-engine";
import type { DocumentOperation } from "@/types/operation";
import type { OperationType, Prisma } from "@prisma/client";

export class OperationService {
  async pushOperations(
    documentId: string,
    tenantId: string,
    userId: string,
    operations: DocumentOperation[]
  ): Promise<DocumentOperation[]> {
    const created: DocumentOperation[] = [];

    await prisma.$transaction(async (tx) => {
      const doc = await tx.document.findFirst({
        where: tenantDocumentWhere({ documentId, tenantId }),
      });
      if (!doc) throw new Error("Document not found or tenant mismatch");

      for (const op of operations) {
        const saved = await tx.operation.upsert({
          where: { id: op.id },
          create: {
            id: op.id,
            documentId,
            userId,
            type: op.type as OperationType,
            position: op.position,
            content: op.content,
            length: op.length,
            lamportTime: op.lamportTime,
            vectorClock: op.vectorClock as Prisma.InputJsonValue,
            clientId: op.clientId,
            acknowledged: true,
          },
          update: {},
        });
        created.push(this.toDomain(saved));
      }

      await this.recomputeDocumentContent(tx, documentId);
    });

    return created;
  }

  async pullOperations(
    documentId: string,
    tenantId: string,
    sinceLamport?: number
  ): Promise<DocumentOperation[]> {
    const doc = await prisma.document.findFirst({
      where: tenantDocumentWhere({ documentId, tenantId }),
    });
    if (!doc) return [];

    const ops = await prisma.operation.findMany({
      where: {
        documentId,
        ...(sinceLamport ? { lamportTime: { gt: sinceLamport } } : {}),
      },
      orderBy: { lamportTime: "asc" },
      take: 500,
    });
    return ops.map((o) => this.toDomain(o));
  }

  /** Remove all operations after a version restore so replay cannot undo restored content. */
  async clearOperations(documentId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.operation.deleteMany({ where: { documentId } });
    });
  }

  /** Recompute and persist document.content from stored operations (source of truth). */
  async ensureDocumentContent(documentId: string): Promise<string> {
    const allOps = await prisma.operation.findMany({
      where: { documentId },
      orderBy: { lamportTime: "asc" },
    });

    if (allOps.length === 0) {
      const doc = await prisma.document.findUnique({ where: { id: documentId } });
      return doc?.content ?? "";
    }

    const content = MergeEngine.merge(
      "",
      allOps.map((o) => this.toDomain(o))
    );

    await prisma.document.update({
      where: { id: documentId },
      data: { content, updatedAt: new Date() },
    });

    return content;
  }

  private async recomputeDocumentContent(
    tx: Prisma.TransactionClient,
    documentId: string
  ): Promise<void> {
    const allOps = await tx.operation.findMany({
      where: { documentId },
      orderBy: { lamportTime: "asc" },
    });

    const content = MergeEngine.merge(
      "",
      allOps.map((o) => this.toDomain(o))
    );

    await tx.document.update({
      where: { id: documentId },
      data: { content, updatedAt: new Date() },
    });
  }

  private toDomain(op: {
    id: string;
    documentId: string;
    userId: string;
    type: OperationType;
    position: number;
    content: string;
    length: number;
    lamportTime: number;
    vectorClock: unknown;
    clientId: string;
    acknowledged: boolean;
    createdAt: Date;
  }): DocumentOperation {
    return {
      id: op.id,
      documentId: op.documentId,
      userId: op.userId,
      type: op.type,
      position: op.position,
      content: op.content,
      length: op.length,
      timestamp: op.createdAt.getTime(),
      lamportTime: op.lamportTime,
      vectorClock: op.vectorClock as Record<string, number>,
      clientId: op.clientId,
      acknowledged: op.acknowledged,
    };
  }
}

export const operationService = new OperationService();
