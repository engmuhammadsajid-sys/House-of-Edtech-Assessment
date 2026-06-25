import type { SyncQueueItem, SyncQueueStatus } from "@/types/operation";
import { getDB } from "./indexed-db";

export class LocalSyncQueueRepository {
  async getByDocument(documentId: string): Promise<SyncQueueItem[]> {
    const db = await getDB();
    return db.getAllFromIndex("syncQueue", "by-document", documentId);
  }

  async getByStatus(status: SyncQueueStatus): Promise<SyncQueueItem[]> {
    const db = await getDB();
    return db.getAllFromIndex("syncQueue", "by-status", status);
  }

  async save(item: SyncQueueItem): Promise<void> {
    const db = await getDB();
    await db.put("syncQueue", item);
  }

  async saveBatch(items: SyncQueueItem[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("syncQueue", "readwrite");
    await Promise.all([...items.map((item) => tx.store.put(item)), tx.done]);
  }

  async updateStatus(id: string, status: SyncQueueStatus, error?: string): Promise<void> {
    const db = await getDB();
    const item = await db.get("syncQueue", id);
    if (!item) return;
    await db.put("syncQueue", {
      ...item,
      status,
      lastError: error,
      retryCount: status === "FAILED" ? item.retryCount + 1 : item.retryCount,
    });
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("syncQueue", id);
  }

  async getPendingCount(documentId: string): Promise<number> {
    const items = await this.getByDocument(documentId);
    return items.filter((i) => i.status === "PENDING" || i.status === "FAILED").length;
  }
}
