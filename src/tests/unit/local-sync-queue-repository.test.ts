import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { LocalSyncQueueRepository } from "@/lib/db/local-sync-queue-repository";
import { resetDBForTests } from "@/lib/db/indexed-db";
import type { SyncQueueItem } from "@/types/operation";

function makeQueueItem(id: string, documentId: string): SyncQueueItem {
  return {
    id,
    documentId,
    operationId: `op-${id}`,
    status: "PENDING",
    retryCount: 0,
    createdAt: Date.now(),
  };
}

describe("LocalSyncQueueRepository", () => {
  const repo = new LocalSyncQueueRepository();

  beforeEach(() => {
    resetDBForTests();
  });

  it("persists and reloads queue items by document", async () => {
    const items = [makeQueueItem("q1", "doc-1"), makeQueueItem("q2", "doc-1")];
    await repo.saveBatch(items);

    const loaded = await repo.getByDocument("doc-1");
    expect(loaded).toHaveLength(2);
    expect(loaded.map((i) => i.id).sort()).toEqual(["q1", "q2"]);
  });

  it("survives simulated page refresh via new repository instance", async () => {
    await repo.saveBatch([makeQueueItem("q1", "doc-refresh")]);

    resetDBForTests();
    const freshRepo = new LocalSyncQueueRepository();
    const loaded = await freshRepo.getByDocument("doc-refresh");

    expect(loaded).toHaveLength(1);
    expect(loaded[0].operationId).toBe("op-q1");
  });
});
