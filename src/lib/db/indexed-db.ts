import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DocumentState, VersionSnapshot } from "@/types/operation";
import type { DocumentOperation, SyncQueueItem } from "@/types/operation";

interface CollabDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentState;
    indexes: { "by-updated": number };
  };
  operations: {
    key: string;
    value: DocumentOperation;
    indexes: { "by-document": string; "by-lamport": number };
  };
  versions: {
    key: string;
    value: VersionSnapshot;
    indexes: { "by-document": string; "by-created": number };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { "by-status": string; "by-document": string };
  };
}

const DB_NAME = "collab-editor";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CollabDB>> | null = null;

/** Reset singleton between tests (requires fake-indexeddb in test env). */
export function resetDBForTests(): void {
  dbPromise = null;
}

export function getDB(): Promise<IDBPDatabase<CollabDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CollabDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const docs = db.createObjectStore("documents", { keyPath: "id" });
        docs.createIndex("by-updated", "updatedAt");

        const ops = db.createObjectStore("operations", { keyPath: "id" });
        ops.createIndex("by-document", "documentId");
        ops.createIndex("by-lamport", "lamportTime");

        const versions = db.createObjectStore("versions", { keyPath: "id" });
        versions.createIndex("by-document", "documentId");
        versions.createIndex("by-created", "createdAt");

        const queue = db.createObjectStore("syncQueue", { keyPath: "id" });
        queue.createIndex("by-status", "status");
        queue.createIndex("by-document", "documentId");
      },
    });
  }
  return dbPromise;
}
