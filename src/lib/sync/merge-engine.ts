import type { DocumentOperation } from "@/types/operation";
import { OperationLog } from "./operation-log";

/**
 * MergeEngine applies operations to reconstruct document content.
 *
 * Uses operation-based CRDT approach:
 * 1. Sort all operations deterministically
 * 2. Transform positions for concurrent operations
 * 3. Apply in order — same ops always produce same result
 */
export class MergeEngine {
  /**
   * Apply a single operation to document content string.
   */
  static applyOperation(content: string, op: DocumentOperation): string {
    const pos = Math.max(0, Math.min(op.position, content.length));

    if (op.type === "INSERT") {
      return content.slice(0, pos) + op.content + content.slice(pos);
    }

    const deleteLen = Math.min(op.length, content.length - pos);
    return content.slice(0, pos) + content.slice(pos + deleteLen);
  }

  /**
   * Transform operation position against a prior applied operation.
   * Required when concurrent edits shift character positions.
   */
  static transformOperation(
    op: DocumentOperation,
    prior: DocumentOperation
  ): DocumentOperation {
    if (prior.userId === op.userId && prior.id === op.id) return op;

    let newPosition = op.position;

    if (prior.type === "INSERT") {
      if (prior.position < op.position) {
        newPosition += prior.content.length;
      } else if (
        prior.position === op.position &&
        OperationLog.compareOperations(prior, op) < 0
      ) {
        newPosition += prior.content.length;
      }
    } else if (prior.type === "DELETE") {
      if (prior.position < op.position) {
        newPosition -= Math.min(prior.length, op.position - prior.position);
      } else if (prior.position === op.position) {
        if (OperationLog.compareOperations(prior, op) < 0) {
          newPosition -= prior.length;
        }
      }
    }

    return { ...op, position: Math.max(0, newPosition) };
  }

  /**
   * Merge operations into final document content.
   * Deterministic: identical operation sets always yield identical content.
   */
  static merge(baseContent: string, operations: DocumentOperation[]): string {
    const sorted = [...operations].sort(OperationLog.compareOperations);
    let content = baseContent;
    const applied: DocumentOperation[] = [];

    for (const rawOp of sorted) {
      let transformed = rawOp;
      for (const prior of applied) {
        transformed = MergeEngine.transformOperation(transformed, prior);
      }
      content = MergeEngine.applyOperation(content, transformed);
      applied.push(rawOp);
    }

    return content;
  }

  /**
   * Compute diff operations between two content strings.
   * Used for generating operations from local edits.
   */
  static diffToOperations(
    oldContent: string,
    newContent: string,
    baseOp: Omit<DocumentOperation, "type" | "position" | "content" | "length">
  ): DocumentOperation[] {
    const ops: DocumentOperation[] = [];
    let i = 0;
    let j = 0;

    while (i < oldContent.length || j < newContent.length) {
      if (i < oldContent.length && j < newContent.length && oldContent[i] === newContent[j]) {
        i++;
        j++;
        continue;
      }

      if (j < newContent.length && (i >= oldContent.length || oldContent[i] !== newContent[j])) {
        let len = 0;
        while (j + len < newContent.length && (i + len >= oldContent.length || oldContent[i + len] !== newContent[j + len])) {
          if (i + len < oldContent.length && oldContent[i + len] === newContent[j + len]) break;
          len++;
        }
        if (len === 0) len = 1;

        ops.push({
          ...baseOp,
          id: `${baseOp.clientId}-ins-${i}-${j}`,
          type: "INSERT",
          position: i,
          content: newContent.slice(j, j + len),
          length: 0,
        });
        j += len;
        continue;
      }

      if (i < oldContent.length) {
        let len = 0;
        while (i + len < oldContent.length && (j + len >= newContent.length || oldContent[i + len] !== newContent[j + len])) {
          if (j + len < newContent.length && oldContent[i + len] === newContent[j + len]) break;
          len++;
        }
        if (len === 0) len = 1;

        ops.push({
          ...baseOp,
          id: `${baseOp.clientId}-del-${i}`,
          type: "DELETE",
          position: i,
          content: "",
          length: len,
        });
        i += len;
      }
    }

    return ops;
  }
}
