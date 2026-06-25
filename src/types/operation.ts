export type OperationType = "INSERT" | "DELETE";

export type VectorClock = Record<string, number>;

export interface DocumentOperation {
  id: string;
  documentId: string;
  userId: string;
  type: OperationType;
  position: number;
  content: string;
  length: number;
  timestamp: number;
  lamportTime: number;
  vectorClock: VectorClock;
  clientId: string;
  acknowledged?: boolean;
}

export interface DocumentState {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  version: number;
  role?: DocumentRole;
}

export type SyncQueueStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface SyncQueueItem {
  id: string;
  documentId: string;
  operationId: string;
  status: SyncQueueStatus;
  retryCount: number;
  lastError?: string;
  nextRetryAt?: number;
  createdAt: number;
}

export interface VersionSnapshot {
  id: string;
  documentId: string;
  name: string;
  content: string;
  createdById: string;
  createdByName?: string;
  parentId?: string;
  isRestore: boolean;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export type DocumentRole = "OWNER" | "EDITOR" | "VIEWER";

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  cursor?: number;
  isTyping?: boolean;
  lastSeen: number;
}
