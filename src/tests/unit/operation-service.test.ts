import { describe, it, expect, vi, beforeEach } from "vitest";
import { OperationService } from "@/server/services/operation-service";
import type { DocumentOperation } from "@/types/operation";

const {
  mockUpsert,
  mockFindMany,
  mockUpdate,
  mockDeleteMany,
  mockDocFindFirst,
} = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockDocFindFirst: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<void>) =>
      fn({
        operation: {
          upsert: mockUpsert,
          findMany: mockFindMany,
          deleteMany: mockDeleteMany,
        },
        document: { update: mockUpdate, findFirst: mockDocFindFirst },
      }),
    document: { findFirst: mockDocFindFirst },
    operation: { deleteMany: mockDeleteMany },
  },
}));

function makeOp(id: string, clientId: string): DocumentOperation {
  return {
    id,
    documentId: "doc-1",
    userId: "user-1",
    type: "INSERT",
    position: 0,
    content: id,
    length: 0,
    timestamp: Date.now(),
    lamportTime: 1,
    vectorClock: { "user-1": 1 },
    clientId,
    acknowledged: false,
  };
}

describe("OperationService", () => {
  const service = new OperationService();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({
        ...create,
        createdAt: new Date(),
        acknowledged: true,
      })
    );
    mockFindMany.mockResolvedValue([]);
    mockUpdate.mockResolvedValue({});
    mockDocFindFirst.mockResolvedValue({ id: "doc-1", tenantId: "tenant-1" });
  });

  it("persists multiple operations that share the same session clientId", async () => {
    const sessionClientId = "session-abc";
    const ops = [
      makeOp("op-1", sessionClientId),
      makeOp("op-2", sessionClientId),
      makeOp("op-3", sessionClientId),
    ];

    const result = await service.pushOperations("doc-1", "tenant-1", "user-1", ops);

    expect(mockUpsert).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
    expect(result.map((o) => o.id)).toEqual(["op-1", "op-2", "op-3"]);
  });

  it("deduplicates by operation id for idempotent retries", async () => {
    const op = makeOp("op-1", "client-1");

    const result = await service.pushOperations("doc-1", "tenant-1", "user-1", [op, op]);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("op-1");
  });

  it("clears all operations for a document on restore reset", async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 });
    await service.clearOperations("doc-1");
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
  });

  it("rejects push when document tenant does not match", async () => {
    mockDocFindFirst.mockResolvedValue(null);
    await expect(
      service.pushOperations("doc-1", "wrong-tenant", "user-1", [makeOp("op-1", "client-1")])
    ).rejects.toThrow("Document not found or tenant mismatch");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns empty pull when tenant does not match", async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const result = await service.pullOperations("doc-1", "wrong-tenant");
    expect(result).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
