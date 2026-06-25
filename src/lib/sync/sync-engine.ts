import type { DocumentOperation, SyncQueueItem } from "@/types/operation";
import { ConflictResolver } from "./conflict-resolver";

export type SyncState = "idle" | "syncing" | "offline" | "error";

export interface SyncEngineConfig {
  documentId: string;
  userId: string;
  baseContent: string;
  pushOperations: (ops: DocumentOperation[]) => Promise<DocumentOperation[]>;
  pullOperations: (since?: number) => Promise<DocumentOperation[]>;
  onContentUpdate: (content: string) => void;
  onStatusChange: (status: SyncState) => void;
  onQueueUpdate: (items: SyncQueueItem[]) => void;
  maxRetries?: number;
  /** Persist sync queue to IndexedDB */
  persistQueue?: (items: SyncQueueItem[]) => Promise<void>;
  /** Load persisted sync queue */
  loadQueue?: () => Promise<SyncQueueItem[]>;
  /** Called when an operation exhausts retries */
  onDeadLetter?: (item: SyncQueueItem, operation: DocumentOperation | undefined) => Promise<void>;
  /** Only leader tab runs background sync */
  isSyncLeader?: () => boolean;
}

const DEFAULT_MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;

export class SyncEngine {
  private config: SyncEngineConfig;
  private resolver: ConflictResolver;
  private queue: SyncQueueItem[] = [];
  private deadLetter: SyncQueueItem[] = [];
  private lamportTime = 0;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  private isSyncing = false;
  private content: string;
  private syncLock: Promise<void> = Promise.resolve();

  constructor(config: SyncEngineConfig) {
    this.config = config;
    this.content = config.baseContent;
    this.resolver = new ConflictResolver();
  }

  async initialize(): Promise<void> {
    if (this.config.loadQueue) {
      const persisted = await this.config.loadQueue();
      if (persisted.length > 0) {
        this.queue = persisted;
        this.config.onQueueUpdate([...this.queue]);
      }
    }
  }

  start(intervalMs = 5000): void {
    if (typeof window !== "undefined") {
      this.onlineHandler = () => this.handleOnline();
      this.offlineHandler = () => this.handleOffline();
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);
    }
    this.syncInterval = setInterval(() => void this.sync(), intervalMs);
    void this.sync();
  }

  stop(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (typeof window !== "undefined") {
      if (this.onlineHandler) window.removeEventListener("online", this.onlineHandler);
      if (this.offlineHandler) window.removeEventListener("offline", this.offlineHandler);
    }
  }

  getContent(): string {
    return this.content;
  }

  getLamportTime(): number {
    return this.lamportTime;
  }

  setLamportTime(time: number): void {
    this.lamportTime = time;
  }

  hydrate(operations: DocumentOperation[]): void {
    if (operations.length === 0) return;

    this.resolver.addOperations(operations);

    const pendingOpIds = new Set(
      operations.filter((o) => !o.acknowledged).map((o) => o.id)
    );
    const existingQueueIds = new Set(this.queue.map((q) => q.operationId));

    for (const opId of pendingOpIds) {
      if (!existingQueueIds.has(opId)) {
        this.queue.push({
          id: crypto.randomUUID(),
          documentId: this.config.documentId,
          operationId: opId,
          status: "PENDING",
          retryCount: 0,
          createdAt: Date.now(),
        });
      }
    }

    const maxLamport = Math.max(...operations.map((op) => op.lamportTime));
    this.lamportTime = Math.max(this.lamportTime, maxLamport);

    const result = this.resolver.resolve(this.config.baseContent);
    this.content = result.content;
    this.config.onContentUpdate(this.content);
    void this.persistQueue();
  }

  applyRemoteOperations(operations: DocumentOperation[]): void {
    const remoteOps = operations.map((op) => ({ ...op, acknowledged: true }));
    this.resolver.addOperations(remoteOps);

    const maxLamport = Math.max(...operations.map((op) => op.lamportTime));
    this.lamportTime = Math.max(this.lamportTime, maxLamport);

    const result = this.resolver.resolve(this.config.baseContent);
    this.content = result.content;
    this.config.onContentUpdate(this.content);
  }

  resetFromRestore(content: string): void {
    this.resolver = new ConflictResolver();
    this.queue = [];
    this.deadLetter = [];
    this.lamportTime = 0;
    this.content = content;
    this.config.onContentUpdate(content);
    this.config.onQueueUpdate([]);
    this.config.onStatusChange(this.isOnline ? "idle" : "offline");
  }

  applyLocalOperations(operations: DocumentOperation[]): void {
    this.resolver.addOperations(operations);

    for (const op of operations) {
      this.queue.push({
        id: crypto.randomUUID(),
        documentId: this.config.documentId,
        operationId: op.id,
        status: "PENDING",
        retryCount: 0,
        createdAt: Date.now(),
      });
    }

    const result = this.resolver.resolve(this.config.baseContent);
    this.content = result.content;
    this.config.onContentUpdate(this.content);
    void this.persistQueue();

    if (this.isOnline) {
      void this.sync();
    }
  }

  /** Force push (and optionally pull) — used on WebSocket reconnect and after offline snapshot sync. */
  async reconcile(options?: { pullRemote?: boolean }): Promise<void> {
    return this.runExclusive(async () => {
      if (!this.isOnline) return;
      this.isSyncing = true;
      this.config.onStatusChange("syncing");
      try {
        await this.pushPending();
        if (options?.pullRemote !== false) {
          await this.pullAndMerge();
        }
        this.config.onStatusChange("idle");
      } catch {
        this.config.onStatusChange("error");
      } finally {
        this.isSyncing = false;
      }
    });
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.config.onStatusChange("idle");
    void this.reconcile();
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.isSyncing = false;
    for (const item of this.queue) {
      if (item.status === "SYNCING" || item.status === "FAILED") {
        item.status = "PENDING";
        item.nextRetryAt = undefined;
      }
    }
    void this.persistQueue();
    this.config.onStatusChange("offline");
  }

  async sync(): Promise<void> {
    return this.runExclusive(async () => {
      if (!this.isOnline || this.isSyncing) return;
      if (this.config.isSyncLeader && !this.config.isSyncLeader()) return;

      const pending = this.queue.filter(
        (q) => q.status === "PENDING" || (q.status === "FAILED" && this.isRetryReady(q))
      );
      if (pending.length === 0 && this.resolver.getPendingOperations().length === 0) {
        return;
      }

      this.isSyncing = true;
      this.config.onStatusChange("syncing");

      try {
        await this.pushPending();
        await this.pullAndMerge();
        this.config.onStatusChange("idle");
      } catch {
        this.config.onStatusChange("error");
      } finally {
        this.isSyncing = false;
      }
    });
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.syncLock.then(fn);
    this.syncLock = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private isRetryReady(item: SyncQueueItem): boolean {
    if (!item.nextRetryAt) return true;
    return Date.now() >= item.nextRetryAt;
  }

  private async pushPending(): Promise<void> {
    const pendingOps = this.resolver.getPendingOperations();
    if (pendingOps.length === 0) return;

    const batch = pendingOps.slice(0, 50);
    for (const q of this.queue.filter((q) => batch.some((op) => op.id === q.operationId))) {
      q.status = "SYNCING";
    }
    await this.persistQueue();

    try {
      const acked = await this.config.pushOperations(batch);
      const ackedIds = new Set(acked.map((op) => op.id));

      for (const op of batch) {
        if (ackedIds.has(op.id)) {
          op.acknowledged = true;
          const qItem = this.queue.find((q) => q.operationId === op.id);
          if (qItem) qItem.status = "SYNCED";
        }
      }
    } catch (error) {
      for (const op of batch) {
        const qItem = this.queue.find((q) => q.operationId === op.id);
        if (qItem) {
          await this.handlePushFailure(qItem, error, op);
        }
      }
    }

    await this.persistQueue();
  }

  private async handlePushFailure(
    item: SyncQueueItem,
    error: unknown,
    operation?: DocumentOperation
  ): Promise<void> {
    item.retryCount++;
    item.lastError = error instanceof Error ? error.message : "Sync failed";
    const maxRetries = this.config.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (item.retryCount >= maxRetries) {
      item.status = "FAILED";
      this.deadLetter.push(item);
      this.queue = this.queue.filter((q) => q.id !== item.id);
      if (this.config.onDeadLetter) {
        await this.config.onDeadLetter(item, operation);
      }
    } else {
      item.status = "PENDING";
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** item.retryCount, MAX_BACKOFF_MS);
      item.nextRetryAt = Date.now() + backoff;
    }
  }

  private async pullAndMerge(): Promise<void> {
    const remoteOps = await this.config.pullOperations(this.lamportTime);
    if (remoteOps.length === 0) return;

    this.resolver.addOperations(
      remoteOps.map((op) => ({ ...op, acknowledged: true }))
    );
    const maxLamport = Math.max(...remoteOps.map((op) => op.lamportTime));
    this.lamportTime = Math.max(this.lamportTime, maxLamport);

    const result = this.resolver.resolve(this.config.baseContent);
    this.content = result.content;
    this.config.onContentUpdate(this.content);
  }

  private async persistQueue(): Promise<void> {
    this.config.onQueueUpdate([...this.queue]);
    if (this.config.persistQueue) {
      await this.config.persistQueue(this.queue);
    }
  }

  getQueue(): SyncQueueItem[] {
    return [...this.queue];
  }

  getDeadLetter(): SyncQueueItem[] {
    return [...this.deadLetter];
  }

  getStatus(): SyncState {
    if (!this.isOnline) return "offline";
    if (this.isSyncing) return "syncing";
    if (this.queue.some((q) => q.status === "FAILED")) return "error";
    return "idle";
  }
}
