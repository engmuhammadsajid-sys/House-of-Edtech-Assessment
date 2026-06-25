import { describe, it, expect } from "vitest";
import type { DocumentState } from "@/types/operation";

describe("DocumentState offline bootstrap", () => {
  it("supports persisting role for offline authorization", () => {
    const state: DocumentState = {
      id: "doc-1",
      title: "Offline Doc",
      content: "local content",
      updatedAt: Date.now(),
      version: 1,
      role: "VIEWER",
    };

    expect(state.role).toBe("VIEWER");
    expect(state.content).toBe("local content");
  });
});
