import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncEngine } from "@/lib/sync/sync-engine";
import type { DocumentOperation } from "@/types/operation";

function makeOp(id: string, content: string): DocumentOperation {
  return {
    id,
    documentId: "doc-1",
    userId: "user-1",
    type: "INSERT",
    position: 0,
    content,
    length: 0,
    timestamp: Date.now(),
    lamportTime: 1,
    vectorClock: { "user-1": 1 },
    clientId: id,
  };
}

describe("SyncEngine", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues operations when push fails", async () => {
    const onQueueUpdate = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: async () => {
        throw new Error("Network error");
      },
      pullOperations: async () => [],
      onContentUpdate: vi.fn(),
      onStatusChange: vi.fn(),
      onQueueUpdate,
      maxRetries: 2,
    });

    engine.applyLocalOperations([makeOp("op-1", "Hello")]);
    expect(onQueueUpdate).toHaveBeenCalled();
    expect(engine.getQueue().length).toBe(1);
    expect(engine.getContent()).toBe("Hello");
  });

  it("updates content optimistically without waiting for server", () => {
    const onContentUpdate = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate,
      onStatusChange: vi.fn(),
      onQueueUpdate: vi.fn(),
    });

    engine.applyLocalOperations([makeOp("op-1", "Instant")]);
    expect(onContentUpdate).toHaveBeenCalledWith("Instant");
    expect(engine.getContent()).toBe("Instant");
  });

  it("reports offline status", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const onStatusChange = vi.fn();

    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate: vi.fn(),
      onStatusChange,
      onQueueUpdate: vi.fn(),
    });

    engine.applyLocalOperations([makeOp("op-1", "Offline edit")]);
    expect(engine.getStatus()).toBe("offline");
  });

  it("hydrates persisted operations from IndexedDB on startup", () => {
    const onContentUpdate = vi.fn();
    const onQueueUpdate = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate,
      onStatusChange: vi.fn(),
      onQueueUpdate,
    });

    const pending = { ...makeOp("op-1", "Hello"), acknowledged: false };
    const synced = { ...makeOp("op-2", "!"), acknowledged: true, lamportTime: 2, position: 5 };

    engine.hydrate([pending, synced]);

    expect(engine.getContent()).toBe("Hello!");
    expect(engine.getQueue()).toHaveLength(1);
    expect(engine.getLamportTime()).toBe(2);
    expect(onContentUpdate).toHaveBeenCalledWith("Hello!");
  });

  it("applies remote operations without queueing them for push", () => {
    const onContentUpdate = vi.fn();
    const onQueueUpdate = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate,
      onStatusChange: vi.fn(),
      onQueueUpdate,
    });

    engine.applyLocalOperations([makeOp("op-1", "Hi")]);
    onQueueUpdate.mockClear();

    engine.applyRemoteOperations([
      { ...makeOp("op-2", "!"), userId: "user-2", lamportTime: 2, position: 2 },
    ]);

    expect(engine.getContent()).toBe("Hi!");
    expect(onQueueUpdate).not.toHaveBeenCalled();
  });

  it("resetFromRestore clears queue and sets content", () => {
    const onContentUpdate = vi.fn();
    const onQueueUpdate = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate,
      onStatusChange: vi.fn(),
      onQueueUpdate,
    });

    engine.applyLocalOperations([makeOp("op-1", "stale")]);
    engine.resetFromRestore("restored text");

    expect(engine.getContent()).toBe("restored text");
    expect(engine.getQueue()).toHaveLength(0);
    expect(engine.getLamportTime()).toBe(0);
    expect(onContentUpdate).toHaveBeenCalledWith("restored text");
    expect(onQueueUpdate).toHaveBeenCalledWith([]);
  });

  it("applies new ops relative to snapshot base after resetFromRestore", () => {
    const onContentUpdate = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate,
      onStatusChange: vi.fn(),
      onQueueUpdate: vi.fn(),
    });

    engine.resetFromRestore("Sajid");
    engine.applyLocalOperations([
      {
        ...makeOp("op-append", "!"),
        position: 5,
        lamportTime: 1,
      },
    ]);

    expect(engine.getContent()).toBe("Sajid!");
  });

  it("initialize restores persisted queue from loadQueue", async () => {
    const persisted = [
      {
        id: "q-persisted",
        documentId: "doc-1",
        operationId: "op-1",
        status: "PENDING" as const,
        retryCount: 0,
        createdAt: Date.now(),
      },
    ];
    const onQueueUpdate = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate: vi.fn(),
      onStatusChange: vi.fn(),
      onQueueUpdate,
      loadQueue: async () => persisted,
    });

    await engine.initialize();

    expect(engine.getQueue()).toHaveLength(1);
    expect(engine.getQueue()[0].id).toBe("q-persisted");
    expect(onQueueUpdate).toHaveBeenCalledWith(persisted);
  });

  it("persistQueue is called when applying local operations", async () => {
    const persistQueue = vi.fn().mockResolvedValue(undefined);
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: vi.fn(),
      pullOperations: vi.fn(),
      onContentUpdate: vi.fn(),
      onStatusChange: vi.fn(),
      onQueueUpdate: vi.fn(),
      persistQueue,
    });

    engine.applyLocalOperations([makeOp("op-1", "Saved")]);
    await new Promise((r) => setTimeout(r, 0));

    expect(persistQueue).toHaveBeenCalled();
    expect(persistQueue.mock.calls.at(-1)?.[0]).toHaveLength(1);
  });

  it("reconcile pushes pending operations then pulls remote changes", async () => {
    const pushOperations = vi.fn().mockResolvedValue([]);
    const remoteOp = {
      ...makeOp("op-2", "!"),
      userId: "user-2",
      lamportTime: 2,
      position: 2,
    };
    const pullOperations = vi.fn().mockResolvedValue([remoteOp]);
    const onContentUpdate = vi.fn();
    const onStatusChange = vi.fn();

    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations,
      pullOperations,
      onContentUpdate,
      onStatusChange,
      onQueueUpdate: vi.fn(),
    });

    engine.applyLocalOperations([makeOp("op-1", "Hi")]);
    await engine.reconcile();

    expect(pushOperations).toHaveBeenCalled();
    expect(pullOperations).toHaveBeenCalled();
    expect(engine.getContent()).toBe("Hi!");
    expect(onStatusChange).toHaveBeenCalledWith("syncing");
    expect(onStatusChange).toHaveBeenCalledWith("idle");
  });

  it("reconcile can skip remote pull after offline snapshot sync", async () => {
    const pushOperations = vi.fn().mockResolvedValue([]);
    const pullOperations = vi.fn().mockResolvedValue([
      { ...makeOp("stale-op", "stale"), lamportTime: 5, position: 3 },
    ]);
    const onContentUpdate = vi.fn();

    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations,
      pullOperations,
      onContentUpdate,
      onStatusChange: vi.fn(),
      onQueueUpdate: vi.fn(),
    });

    engine.resetFromRestore("this is online text\nthis is offline text");
    await engine.reconcile({ pullRemote: false });

    expect(pullOperations).not.toHaveBeenCalled();
    expect(engine.getContent()).toBe("this is online text\nthis is offline text");
  });

  it("sync skips when tab is not sync leader", async () => {
    const pushOperations = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations,
      pullOperations: vi.fn(),
      onContentUpdate: vi.fn(),
      onStatusChange: vi.fn(),
      onQueueUpdate: vi.fn(),
      isSyncLeader: () => false,
    });

    engine.applyLocalOperations([makeOp("op-1", "Leader skip")]);
    await engine.sync();

    expect(pushOperations).not.toHaveBeenCalled();
  });

  it("invokes onDeadLetter when retries are exhausted", async () => {
    const onDeadLetter = vi.fn();
    const engine = new SyncEngine({
      documentId: "doc-1",
      userId: "user-1",
      baseContent: "",
      pushOperations: async () => {
        throw new Error("Permanent failure");
      },
      pullOperations: async () => [],
      onContentUpdate: vi.fn(),
      onStatusChange: vi.fn(),
      onQueueUpdate: vi.fn(),
      onDeadLetter,
      maxRetries: 1,
    });

    engine.applyLocalOperations([makeOp("op-dlq", "fail")]);
    await engine.sync();
    await engine.sync();

    expect(onDeadLetter).toHaveBeenCalled();
    expect(engine.getDeadLetter()).toHaveLength(1);
  });
});
