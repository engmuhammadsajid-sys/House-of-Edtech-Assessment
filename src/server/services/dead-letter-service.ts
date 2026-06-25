import { prisma } from "@/server/db/prisma";
import type { DocumentOperation } from "@/types/operation";
import type { Prisma } from "@prisma/client";
import { operationService } from "./operation-service";

export class DeadLetterService {
  async list(documentId: string) {
    return prisma.deadLetterQueue.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async enqueue(
    documentId: string,
    operationId: string,
    payload: DocumentOperation,
    error: string
  ) {
    return prisma.deadLetterQueue.create({
      data: {
        documentId,
        operationId,
        payload: payload as unknown as Prisma.InputJsonValue,
        error,
      },
    });
  }

  async retry(deadLetterId: string, userId: string) {
    const entry = await prisma.deadLetterQueue.findUnique({
      where: { id: deadLetterId },
    });
    if (!entry) throw new Error("Dead letter entry not found");

    const doc = await prisma.document.findUnique({
      where: { id: entry.documentId },
    });
    if (!doc) throw new Error("Document not found");

    const op = entry.payload as unknown as DocumentOperation;
    const acknowledged = await operationService.pushOperations(
      entry.documentId,
      doc.tenantId,
      userId,
      [op]
    );

    await prisma.deadLetterQueue.delete({ where: { id: deadLetterId } });
    return acknowledged;
  }

  async delete(deadLetterId: string) {
    return prisma.deadLetterQueue.delete({ where: { id: deadLetterId } });
  }
}

export const deadLetterService = new DeadLetterService();
