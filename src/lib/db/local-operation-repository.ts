import type { DocumentOperation } from "@/types/operation";
import { getDB } from "./indexed-db";

export class LocalOperationRepository {
  async getByDocument(documentId: string): Promise<DocumentOperation[]> {
    const db = await getDB();
    return db.getAllFromIndex("operations", "by-document", documentId);
  }

  async getPending(documentId: string): Promise<DocumentOperation[]> {
    const ops = await this.getByDocument(documentId);
    return ops.filter((op) => !op.acknowledged);
  }

  async save(operation: DocumentOperation): Promise<void> {
    const db = await getDB();
    await db.put("operations", operation);
  }

  async saveBatch(operations: DocumentOperation[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("operations", "readwrite");
    await Promise.all([
      ...operations.map((op) => tx.store.put(op)),
      tx.done,
    ]);
  }

  async deleteByDocument(documentId: string): Promise<void> {
    const db = await getDB();
    const ops = await db.getAllFromIndex("operations", "by-document", documentId);
    const tx = db.transaction("operations", "readwrite");
    await Promise.all([...ops.map((op) => tx.store.delete(op.id)), tx.done]);
  }

  async markAcknowledged(ids: string[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("operations", "readwrite");
    for (const id of ids) {
      const op = await tx.store.get(id);
      if (op) await tx.store.put({ ...op, acknowledged: true });
    }
    await tx.done;
  }
}
