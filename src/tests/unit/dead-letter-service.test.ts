import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeadLetterService } from "@/server/services/dead-letter-service";
import type { DocumentOperation } from "@/types/operation";

const {
  mockDlqFindMany,
  mockDlqCreate,
  mockDlqFindUnique,
  mockDlqDelete,
  mockDocFindUnique,
  mockPushOperations,
} = vi.hoisted(() => ({
  mockDlqFindMany: vi.fn(),
  mockDlqCreate: vi.fn(),
  mockDlqFindUnique: vi.fn(),
  mockDlqDelete: vi.fn(),
  mockDocFindUnique: vi.fn(),
  mockPushOperations: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    deadLetterQueue: {
      findMany: mockDlqFindMany,
      create: mockDlqCreate,
      findUnique: mockDlqFindUnique,
      delete: mockDlqDelete,
    },
    document: { findUnique: mockDocFindUnique },
  },
}));

vi.mock("@/server/services/operation-service", () => ({
  operationService: { pushOperations: mockPushOperations },
}));

function makeOp(): DocumentOperation {
  return {
    id: "op-dlq-1",
    documentId: "doc-1",
    userId: "user-1",
    type: "INSERT",
    position: 0,
    content: "x",
    length: 0,
    timestamp: Date.now(),
    lamportTime: 1,
    vectorClock: { "user-1": 1 },
    clientId: "c1",
  };
}

describe("DeadLetterService", () => {
  const service = new DeadLetterService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists dead letter entries for a document", async () => {
    mockDlqFindMany.mockResolvedValue([{ id: "dlq-1", documentId: "doc-1" }]);
    const entries = await service.list("doc-1");
    expect(entries).toHaveLength(1);
    expect(mockDlqFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentId: "doc-1" } })
    );
  });

  it("enqueues failed operations", async () => {
    const op = makeOp();
    mockDlqCreate.mockResolvedValue({ id: "dlq-1", operationId: op.id });
    const entry = await service.enqueue("doc-1", op.id, op, "Network error");
    expect(entry.id).toBe("dlq-1");
    expect(mockDlqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: "doc-1",
          operationId: op.id,
          error: "Network error",
        }),
      })
    );
  });

  it("retries a dead letter entry and deletes it on success", async () => {
    const op = makeOp();
    mockDlqFindUnique.mockResolvedValue({
      id: "dlq-1",
      documentId: "doc-1",
      payload: op,
    });
    mockDocFindUnique.mockResolvedValue({ id: "doc-1", tenantId: "tenant-1" });
    mockPushOperations.mockResolvedValue([{ ...op, acknowledged: true }]);

    const result = await service.retry("dlq-1", "user-1");

    expect(mockPushOperations).toHaveBeenCalledWith("doc-1", "tenant-1", "user-1", [op]);
    expect(mockDlqDelete).toHaveBeenCalledWith({ where: { id: "dlq-1" } });
    expect(result).toHaveLength(1);
  });
});
