import type { DocumentOperation } from "@/types/operation";
import { compareVectorClocks } from "./vector-clock";

/**
 * OperationLog maintains an append-only log of document operations.
 * Operations are never deleted — history is preserved for deterministic replay.
 */
export class OperationLog {
  private operations: Map<string, DocumentOperation> = new Map();
  private orderedIds: string[] = [];

  constructor(initialOps: DocumentOperation[] = []) {
    for (const op of initialOps) {
      this.append(op);
    }
  }

  append(operation: DocumentOperation): void {
    if (this.operations.has(operation.id)) return;
    this.operations.set(operation.id, operation);
    this.orderedIds.push(operation.id);
  }

  appendMany(operations: DocumentOperation[]): void {
    for (const op of operations) {
      this.append(op);
    }
  }

  getAll(): DocumentOperation[] {
    return this.orderedIds.map((id) => this.operations.get(id)!);
  }

  getById(id: string): DocumentOperation | undefined {
    return this.operations.get(id);
  }

  has(id: string): boolean {
    return this.operations.has(id);
  }

  size(): number {
    return this.operations.size;
  }

  /**
   * Deterministic total ordering for conflict resolution.
   * Priority: Lamport time → vector clock → userId → operation id
   */
  static compareOperations(a: DocumentOperation, b: DocumentOperation): number {
    if (a.lamportTime !== b.lamportTime) {
      return a.lamportTime - b.lamportTime;
    }

    const clockCmp = compareVectorClocks(a.vectorClock, b.vectorClock);
    if (clockCmp !== 0) {
      return clockCmp;
    }

    if (a.userId !== b.userId) {
      return a.userId.localeCompare(b.userId);
    }

    return a.id.localeCompare(b.id);
  }

  getSorted(): DocumentOperation[] {
    return [...this.getAll()].sort(OperationLog.compareOperations);
  }

  getPending(): DocumentOperation[] {
    return this.getAll().filter((op) => !op.acknowledged);
  }
}
