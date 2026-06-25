import { describe, it, expect } from "vitest";
import { OperationLog } from "@/lib/sync/operation-log";
import { MergeEngine } from "@/lib/sync/merge-engine";
import { ConflictResolver } from "@/lib/sync/conflict-resolver";
import type { DocumentOperation } from "@/types/operation";

function makeOp(overrides: Partial<DocumentOperation> & Pick<DocumentOperation, "id" | "userId" | "type" | "position">): DocumentOperation {
  return {
    documentId: "doc-1",
    content: overrides.type === "INSERT" ? (overrides.content ?? "X") : "",
    length: overrides.type === "DELETE" ? (overrides.length ?? 1) : 0,
    timestamp: Date.now(),
    lamportTime: overrides.lamportTime ?? 1,
    vectorClock: overrides.vectorClock ?? { [overrides.userId]: 1 },
    clientId: overrides.clientId ?? overrides.id,
    acknowledged: false,
    ...overrides,
  };
}

describe("OperationLog", () => {
  it("orders operations deterministically by Lamport time", () => {
    const log = new OperationLog([
      makeOp({ id: "b", userId: "u2", type: "INSERT", position: 0, lamportTime: 2 }),
      makeOp({ id: "a", userId: "u1", type: "INSERT", position: 0, lamportTime: 1 }),
    ]);

    const sorted = log.getSorted();
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });

  it("deduplicates operations by id", () => {
    const op = makeOp({ id: "same", userId: "u1", type: "INSERT", position: 0 });
    const log = new OperationLog([op, op]);
    expect(log.size()).toBe(1);
  });
});

describe("MergeEngine", () => {
  it("applies insert at position", () => {
    const result = MergeEngine.applyOperation("hello", makeOp({
      id: "1", userId: "u1", type: "INSERT", position: 5, content: " world",
    }));
    expect(result).toBe("hello world");
  });

  it("applies delete at position", () => {
    const result = MergeEngine.applyOperation("hello world", makeOp({
      id: "1", userId: "u1", type: "DELETE", position: 5, length: 6,
    }));
    expect(result).toBe("hello");
  });

  it("produces deterministic merge for concurrent inserts", () => {
    const ops = [
      makeOp({ id: "a", userId: "u1", type: "INSERT", position: 0, content: "A", lamportTime: 1 }),
      makeOp({ id: "b", userId: "u2", type: "INSERT", position: 0, content: "B", lamportTime: 2 }),
    ];

    const result1 = MergeEngine.merge("", ops);
    const result2 = MergeEngine.merge("", [...ops].reverse());

    expect(result1).toBe(result2);
    expect(result1.length).toBe(2);
  });
});

describe("ConflictResolver", () => {
  it("resolves concurrent edits without data loss", () => {
    const resolver = new ConflictResolver();
    const ops = [
      makeOp({ id: "1", userId: "u1", type: "INSERT", position: 0, content: "Hello", lamportTime: 1 }),
      makeOp({ id: "2", userId: "u2", type: "INSERT", position: 5, content: " World", lamportTime: 2 }),
    ];
    resolver.addOperations(ops);
    const result = resolver.resolve("");
    expect(result.content).toContain("Hello");
    expect(result.content).toContain("World");
    expect(result.mergedOperations).toHaveLength(2);
  });

  it("same operations always merge to same result", () => {
    const ops = [
      makeOp({ id: "1", userId: "u1", type: "INSERT", position: 0, content: "A", lamportTime: 1 }),
      makeOp({ id: "2", userId: "u2", type: "INSERT", position: 1, content: "B", lamportTime: 2 }),
      makeOp({ id: "3", userId: "u1", type: "INSERT", position: 2, content: "C", lamportTime: 3 }),
    ];

    const r1 = new ConflictResolver(ops).resolve("");
    const r2 = new ConflictResolver([...ops].reverse()).resolve("");

    expect(r1.content).toBe(r2.content);
  });
});
