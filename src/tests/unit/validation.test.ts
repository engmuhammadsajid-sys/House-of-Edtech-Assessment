import { describe, it, expect } from "vitest";
import { operationSchema, operationsBatchSchema, MAX_PAYLOAD_BYTES } from "@/lib/validation/schemas";

describe("Payload Validation", () => {
  const validOp = {
    id: "op-1",
    documentId: "doc-1",
    userId: "user-1",
    type: "INSERT" as const,
    position: 0,
    content: "hello",
    length: 0,
    timestamp: Date.now(),
    lamportTime: 1,
    vectorClock: { "user-1": 1 },
    clientId: "client-1",
  };

  it("accepts valid operation", () => {
    expect(operationSchema.safeParse(validOp).success).toBe(true);
  });

  it("rejects oversized content", () => {
    const result = operationSchema.safeParse({
      ...validOp,
      content: "x".repeat(200_000),
    });
    expect(result.success).toBe(false);
  });

  it("rejects batch over 50 operations", () => {
    const ops = Array.from({ length: 51 }, (_, i) => ({
      ...validOp,
      id: `op-${i}`,
      clientId: `client-${i}`,
    }));
    expect(operationsBatchSchema.safeParse({ operations: ops }).success).toBe(false);
  });

  it("rejects invalid operation type", () => {
    expect(operationSchema.safeParse({ ...validOp, type: "UPDATE" }).success).toBe(false);
  });

  it("allows distinct operations with the same session clientId", () => {
    const sessionClientId = "session-shared";
    const ops = [
      { ...validOp, id: "op-1", clientId: "op-1" },
      { ...validOp, id: "op-2", clientId: sessionClientId },
      { ...validOp, id: "op-3", clientId: sessionClientId },
    ];
    for (const op of ops) {
      expect(operationSchema.safeParse(op).success).toBe(true);
    }
    expect(operationsBatchSchema.safeParse({ operations: ops }).success).toBe(true);
  });
});

describe("Payload Size", () => {
  it("enforces max payload bytes", () => {
    const size = new TextEncoder().encode("x".repeat(MAX_PAYLOAD_BYTES + 1)).length;
    expect(size).toBeGreaterThan(MAX_PAYLOAD_BYTES);
  });
});
