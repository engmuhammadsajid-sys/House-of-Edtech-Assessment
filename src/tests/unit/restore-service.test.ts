import { describe, it, expect, vi, beforeEach } from "vitest";
import { RestoreService, VersionService } from "@/server/services/version-service";

const { mockTransaction, mockVersionFind, mockDeleteMany, mockCreate, mockDocumentUpdate } =
  vi.hoisted(() => ({
    mockTransaction: vi.fn(),
    mockVersionFind: vi.fn(),
    mockDeleteMany: vi.fn(),
    mockCreate: vi.fn(),
    mockDocumentUpdate: vi.fn(),
    mockActivityCreate: vi.fn(),
  }));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
    versionSnapshot: { findUnique: mockVersionFind },
  },
}));

describe("RestoreService", () => {
  const versionService = new VersionService();
  const restoreService = new RestoreService(versionService);

  beforeEach(() => {
    vi.clearAllMocks();
    mockVersionFind.mockResolvedValue({
      id: "v-1",
      documentId: "doc-1",
      name: "Old",
      content: "restored content",
    });
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        versionSnapshot: { create: mockCreate },
        document: { update: mockDocumentUpdate },
        operation: { deleteMany: mockDeleteMany },
        activityLog: { create: vi.fn() },
      })
    );
    mockCreate.mockResolvedValue({ id: "v-new", content: "restored content" });
  });

  it("clears operation log when restoring so sync cannot overwrite content", async () => {
    await restoreService.restore("doc-1", "v-1", "user-1");

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(mockDocumentUpdate).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({ content: "restored content" }),
    });
  });
});
