import { describe, it, expect } from "vitest";
import { MergeEngine } from "@/lib/sync/merge-engine";
import { ConflictResolver } from "@/lib/sync/conflict-resolver";
import type { DocumentOperation } from "@/types/operation";

function makeOp(
  overrides: Partial<DocumentOperation> & Pick<DocumentOperation, "id" | "userId" | "type" | "position">
): DocumentOperation {
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

/** Permute array — used to simulate different arrival orders. */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) {
      result.push([arr[i], ...p]);
    }
  }
  return result;
}

describe("Deterministic convergence", () => {
  it("property: any permutation of the same ops yields identical content", () => {
    const ops = [
      makeOp({ id: "1", userId: "u1", type: "INSERT", position: 0, content: "A", lamportTime: 1 }),
      makeOp({ id: "2", userId: "u2", type: "INSERT", position: 1, content: "B", lamportTime: 2 }),
      makeOp({ id: "3", userId: "u1", type: "INSERT", position: 2, content: "C", lamportTime: 3 }),
    ];

    const results = new Set<string>();
    for (const perm of permutations(ops)) {
      results.add(new ConflictResolver(perm).resolve("").content);
    }
    expect(results.size).toBe(1);
  });

  it("concurrent inserts at same position converge", () => {
    const ops = [
      makeOp({ id: "a", userId: "u1", type: "INSERT", position: 0, content: "Hello", lamportTime: 1 }),
      makeOp({ id: "b", userId: "u2", type: "INSERT", position: 0, content: "World", lamportTime: 2 }),
    ];
    const r1 = new ConflictResolver(ops).resolve("");
    const r2 = new ConflictResolver([...ops].reverse()).resolve("");
    expect(r1.content).toBe(r2.content);
    expect(r1.content).toContain("Hello");
    expect(r1.content).toContain("World");
  });

  it("concurrent delete and insert converge", () => {
    const base = "Hello World";
    const ops = [
      makeOp({ id: "d1", userId: "u1", type: "DELETE", position: 5, length: 6, lamportTime: 1 }),
      makeOp({ id: "i1", userId: "u2", type: "INSERT", position: 5, content: "!", lamportTime: 2 }),
    ];
    const merged = MergeEngine.merge(base, ops);
    const reversed = MergeEngine.merge(base, [...ops].reverse());
    expect(merged).toBe(reversed);
  });

  it("reconnect merge: client A offline ops + client B online ops converge", () => {
    const clientAOps = [
      makeOp({ id: "a1", userId: "u1", type: "INSERT", position: 0, content: "Start ", lamportTime: 1 }),
    ];
    const clientBOps = [
      makeOp({ id: "b1", userId: "u2", type: "INSERT", position: 6, content: "End", lamportTime: 2 }),
    ];
    const allOps = [...clientAOps, ...clientBOps];
    const clientView = new ConflictResolver(clientAOps).resolve("");
    const serverView = new ConflictResolver(allOps).resolve("");
    expect(clientView.content).not.toBe(serverView.content);
    const reconciled = new ConflictResolver([...clientAOps, ...clientBOps]).resolve("");
    expect(reconciled.content).toBe("Start End");
  });

  it("three clients with interleaved ops converge to same state", () => {
    const ops = [
      makeOp({ id: "1", userId: "a", type: "INSERT", position: 0, content: "1", lamportTime: 1 }),
      makeOp({ id: "2", userId: "b", type: "INSERT", position: 1, content: "2", lamportTime: 2 }),
      makeOp({ id: "3", userId: "c", type: "INSERT", position: 2, content: "3", lamportTime: 3 }),
      makeOp({ id: "4", userId: "a", type: "INSERT", position: 3, content: "4", lamportTime: 4 }),
    ];
    const orders = permutations(ops);
    const contents = orders.map((o) => new ConflictResolver(o).resolve("").content);
    expect(new Set(contents).size).toBe(1);
  });
});
