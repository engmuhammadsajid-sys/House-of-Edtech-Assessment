import type { DocumentOperation } from "@/types/operation";
import { MergeEngine } from "./merge-engine";
import { OperationLog } from "./operation-log";

export interface MergeResult {
  content: string;
  mergedOperations: DocumentOperation[];
  conflictsDetected: number;
}

/**
 * ConflictResolver orchestrates deterministic merge of local and remote operations.
 *
 * Algorithm:
 * 1. Union local + remote operation logs (dedupe by id)
 * 2. Sort with deterministic comparator (Lamport → vector clock → userId → id)
 * 3. Replay through MergeEngine with position transformation
 * 4. Never use last-write-wins — all operations preserved
 */
export class ConflictResolver {
  private log: OperationLog;

  constructor(operations: DocumentOperation[] = []) {
    this.log = new OperationLog(operations);
  }

  addOperations(operations: DocumentOperation[]): DocumentOperation[] {
    const newOps: DocumentOperation[] = [];
    for (const op of operations) {
      if (!this.log.has(op.id)) {
        this.log.append(op);
        newOps.push(op);
      }
    }
    return newOps;
  }

  resolve(baseContent: string): MergeResult {
    const allOps = this.log.getSorted();
    const content = MergeEngine.merge(baseContent, allOps);

    const seen = new Set<string>();
    let conflictsDetected = 0;
    for (const op of allOps) {
      const key = `${op.position}-${op.type}-${op.lamportTime}`;
      if (seen.has(key)) conflictsDetected++;
      seen.add(key);
    }

    return { content, mergedOperations: allOps, conflictsDetected };
  }

  getLog(): OperationLog {
    return this.log;
  }

  getPendingOperations(): DocumentOperation[] {
    return this.log.getPending();
  }
}
