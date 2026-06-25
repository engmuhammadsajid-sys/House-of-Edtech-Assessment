"use client";

import { useCallback, useEffect, useRef } from "react";
import { SyncEngine } from "@/lib/sync/sync-engine";
import { MergeEngine } from "@/lib/sync/merge-engine";
import { incrementClock, mergeClocks, nextLamportTime } from "@/lib/sync/vector-clock";
import { TabCoordinator } from "@/lib/sync/tab-coordinator";
import { LocalDocumentRepository } from "@/lib/db/local-document-repository";
import { LocalOperationRepository } from "@/lib/db/local-operation-repository";
import { LocalSyncQueueRepository } from "@/lib/db/local-sync-queue-repository";
import { useEditorStore } from "@/store/editor-store";
import { usePresence } from "@/hooks/use-presence";
import { materializeDocumentSnapshot } from "@/lib/sync/materialize-document";
import type { DocumentOperation, DocumentRole, SyncQueueItem } from "@/types/operation";

const DEBOUNCE_MS = 150;

interface UseCollaborativeEditorOptions {
  documentId: string;
  userId: string;
  userName: string;
  initialContent: string;
  initialTitle: string;
  /** Server content baseline for replaying local-only offline edits */
  serverBaseline?: string;
  /** Changes when resolved local/server content changes — triggers re-bootstrap */
  bootstrapKey?: string;
  role?: DocumentRole;
  readOnly?: boolean;
  ready?: boolean;
}

export function useCollaborativeEditor({
  documentId,
  userId,
  userName,
  initialContent,
  initialTitle,
  serverBaseline,
  bootstrapKey,
  role,
  readOnly = false,
  ready = true,
}: UseCollaborativeEditorOptions) {
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const tabCoordinatorRef = useRef<TabCoordinator | null>(null);
  const isLeaderRef = useRef(true);
  const vectorClockRef = useRef<Record<string, number>>({});
  const lamportRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const lastContentRef = useRef(initialContent);
  const sessionClientIdRef = useRef(crypto.randomUUID());
  const resolvedBootstrapKey =
    bootstrapKey ?? `${documentId}:${serverBaseline ?? ""}:${initialContent}`;

  const {
    content,
    setContent,
    setDocument,
    setSyncStatus,
    setOnline,
    setQueue,
    setConflictCount,
  } = useEditorStore();

  const localDocRepo = useRef(new LocalDocumentRepository());
  const localOpRepo = useRef(new LocalOperationRepository());
  const localQueueRepo = useRef(new LocalSyncQueueRepository());

  const pushOperations = useCallback(
    async (ops: DocumentOperation[]) => {
      await localOpRepo.current.saveBatch(ops);
      const res = await fetch(`/api/documents/${documentId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations: ops }),
      });
      if (!res.ok) throw new Error("Push failed");
      const data = await res.json();
      await localOpRepo.current.markAcknowledged(
        data.operations.map((o: DocumentOperation) => o.id)
      );
      return data.operations;
    },
    [documentId]
  );

  const pullOperations = useCallback(
    async (since?: number) => {
      const url =
        since && since > 0
          ? `/api/documents/${documentId}/sync?since=${since}`
          : `/api/documents/${documentId}/sync`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      if (data.operations?.length) {
        await localOpRepo.current.saveBatch(
          data.operations.map((op: DocumentOperation) => ({ ...op, acknowledged: true }))
        );
      }
      return data.operations ?? [];
    },
    [documentId]
  );

  const persistQueue = useCallback(
    async (items: SyncQueueItem[]) => {
      await localQueueRepo.current.saveBatch(items);
    },
    []
  );

  const loadQueue = useCallback(async () => {
    return localQueueRepo.current.getByDocument(documentId);
  }, [documentId]);

  const handleDeadLetter = useCallback(
    async (item: SyncQueueItem, operation: DocumentOperation | undefined) => {
      if (!operation) return;
      await fetch(`/api/documents/${documentId}/dead-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          operationId: item.operationId,
          lastError: item.lastError,
        }),
      });
    },
    [documentId]
  );

  const persistDocument = useCallback(
    async (title: string, docContent: string) => {
      const existing = await localDocRepo.current.getById(documentId);
      await localDocRepo.current.save({
        id: documentId,
        title,
        content: docContent,
        updatedAt: Date.now(),
        version: (existing?.version ?? 0) + 1,
        role: role ?? existing?.role,
      });
    },
    [documentId, role]
  );

  const handleRemoteOperation = useCallback((operation: DocumentOperation) => {
    void (async () => {
      await localOpRepo.current.save({ ...operation, acknowledged: true });
      vectorClockRef.current = mergeClocks(vectorClockRef.current, operation.vectorClock);
      syncEngineRef.current?.applyRemoteOperations([operation]);
    })();
  }, []);

  const applyRestore = useCallback(
    async (restoredContent: string) => {
      await localOpRepo.current.deleteByDocument(documentId);
      await localQueueRepo.current.getByDocument(documentId).then((items) =>
        Promise.all(items.map((i) => localQueueRepo.current.delete(i.id)))
      );
      await localDocRepo.current.updateContent(documentId, restoredContent);
      lastContentRef.current = restoredContent;
      vectorClockRef.current = {};
      lamportRef.current = 0;
      syncEngineRef.current?.resetFromRestore(restoredContent);
      setContent(restoredContent);
    },
    [documentId, setContent]
  );

  const reconcile = useCallback(() => {
    void syncEngineRef.current?.reconcile();
  }, []);

  const emitOperationRef = useRef<(op: DocumentOperation) => void>(() => {});

  const { presence, emitCursor, emitTyping, emitOperation } = usePresence({
    documentId,
    userId,
    userName,
    enabled: ready && !!userId,
    canEmitOperations: !readOnly,
    onRemoteOperation: handleRemoteOperation,
    onReconnect: reconcile,
  });

  useEffect(() => {
    emitOperationRef.current = emitOperation;
  }, [emitOperation]);

  const applyContentChange = useCallback(
    (newContent: string) => {
      const oldContent = lastContentRef.current;
      if (oldContent === newContent) return;

      lamportRef.current = nextLamportTime(lamportRef.current, []);
      vectorClockRef.current = incrementClock(vectorClockRef.current, userId);

      const ops = MergeEngine.diffToOperations(oldContent, newContent, {
        documentId,
        userId,
        timestamp: Date.now(),
        lamportTime: lamportRef.current,
        vectorClock: { ...vectorClockRef.current },
        clientId: sessionClientIdRef.current,
        id: "",
      }).map((op, i) => {
        const opId = crypto.randomUUID();
        return {
          ...op,
          id: opId,
          clientId: opId,
          lamportTime: lamportRef.current + i,
        };
      });

      lastContentRef.current = newContent;
      pendingContentRef.current = null;
      syncEngineRef.current?.applyLocalOperations(ops);

      tabCoordinatorRef.current?.broadcast({ type: "local-ops", ops });
      for (const op of ops) {
        emitOperationRef.current(op);
      }

      setConflictCount(
        syncEngineRef.current?.getQueue().filter((q) => q.status === "FAILED").length ?? 0
      );
    },
    [documentId, userId, setConflictCount]
  );

  const flushPendingChange = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const pending = pendingContentRef.current;
    if (pending === null) return;
    applyContentChange(pending);
  }, [applyContentChange]);

  useEffect(() => {
    if (!ready || !documentId || !userId) return;

    let cancelled = false;

    tabCoordinatorRef.current = new TabCoordinator(
      documentId,
      (isLeader) => {
        isLeaderRef.current = isLeader;
      },
      (msg) => {
        if (msg.type === "local-ops" && !isLeaderRef.current) {
          const ops = msg.ops as DocumentOperation[];
          syncEngineRef.current?.applyRemoteOperations(ops);
        }
        if (msg.type === "content-sync" && !isLeaderRef.current) {
          lastContentRef.current = msg.content;
          setContent(msg.content);
        }
      }
    );

    void (async () => {
      const localDoc = await localDocRepo.current.getById(documentId);
      const bootstrapContent = localDoc?.content ?? initialContent;
      const bootstrapTitle = localDoc?.title ?? initialTitle;
      const baseline = serverBaseline ?? initialContent;

      if (cancelled) return;

      setDocument(documentId, bootstrapTitle, bootstrapContent);
      lastContentRef.current = bootstrapContent;
      setContent(bootstrapContent);

      const engine = new SyncEngine({
        documentId,
        userId,
        baseContent: "",
        pushOperations,
        pullOperations,
        onContentUpdate: (newContent) => {
          void (async () => {
            const pending = pendingContentRef.current;
            if (pending !== null && pending !== newContent) {
              lastContentRef.current = pending;
              return;
            }

            lastContentRef.current = newContent;
            if (useEditorStore.getState().content !== newContent) {
              setContent(newContent);
            }
            const title = useEditorStore.getState().title || bootstrapTitle;
            void persistDocument(title, newContent);
            tabCoordinatorRef.current?.broadcast({ type: "content-sync", content: newContent });
          })();
        },
        onStatusChange: setSyncStatus,
        onQueueUpdate: setQueue,
        persistQueue,
        loadQueue,
        onDeadLetter: handleDeadLetter,
        isSyncLeader: () => isLeaderRef.current,
      });

      await engine.initialize();

      const needsMaterialize = navigator.onLine && bootstrapContent !== baseline;
      if (needsMaterialize) {
        await materializeDocumentSnapshot(documentId, {
          title: bootstrapTitle,
          content: bootstrapContent,
        });
      }

      await localOpRepo.current.deleteByDocument(documentId);
      const queued = await localQueueRepo.current.getByDocument(documentId);
      await Promise.all(queued.map((item) => localQueueRepo.current.delete(item.id)));

      engine.resetFromRestore(bootstrapContent);
      lastContentRef.current = bootstrapContent;
      lamportRef.current = 0;
      vectorClockRef.current = {};

      syncEngineRef.current = engine;
      engine.start(3000);

      if (navigator.onLine) {
        void engine.reconcile({ pullRemote: !needsMaterialize });
      }

      await persistDocument(bootstrapTitle, bootstrapContent);
    })();

    const handleOnline = () => {
      void (async () => {
        flushPendingChange();
        setOnline(true);

        const local = await localDocRepo.current.getById(documentId);
        const snapshot =
          pendingContentRef.current ?? local?.content ?? lastContentRef.current;
        const baseline = serverBaseline ?? initialContent;
        const queue = await localQueueRepo.current.getByDocument(documentId);
        const hasPendingQueue = queue.some(
          (item) => item.status === "PENDING" || item.status === "SYNCING"
        );
        const needsSnapshot =
          pendingContentRef.current !== null ||
          hasPendingQueue ||
          snapshot !== baseline;

        if (needsSnapshot) {
          const title = useEditorStore.getState().title || initialTitle;
          const materialized = await materializeDocumentSnapshot(documentId, {
            title,
            content: snapshot,
          });
          if (materialized) {
            syncEngineRef.current?.resetFromRestore(snapshot);
            lastContentRef.current = snapshot;
            pendingContentRef.current = null;
            setContent(snapshot);
            lamportRef.current = 0;
            vectorClockRef.current = {};
          }
        }

        void syncEngineRef.current?.reconcile({ pullRemote: !needsSnapshot });
      })();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOnline(navigator.onLine);

    return () => {
      cancelled = true;
      syncEngineRef.current?.stop();
      syncEngineRef.current = null;
      tabCoordinatorRef.current?.destroy();
      tabCoordinatorRef.current = null;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [
    documentId,
    userId,
    resolvedBootstrapKey,
    initialTitle,
    initialContent,
    serverBaseline,
    ready,
    pushOperations,
    pullOperations,
    persistQueue,
    loadQueue,
    handleDeadLetter,
    persistDocument,
    setContent,
    setDocument,
    setSyncStatus,
    setQueue,
    setOnline,
    flushPendingChange,
  ]);

  const handleChange = useCallback(
    (newContent: string) => {
      if (readOnly) return;

      pendingContentRef.current = newContent;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        applyContentChange(newContent);
      }, DEBOUNCE_MS);

      void (async () => {
        const title = useEditorStore.getState().title || initialTitle;
        await persistDocument(title, newContent);
      })();
    },
    [readOnly, applyContentChange, persistDocument, initialTitle]
  );

  useEffect(() => {
    const onPageHide = () => flushPendingChange();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flushPendingChange]);

  return {
    content,
    handleChange,
    flushPendingChange,
    handleRemoteOperation,
    applyRestore,
    reconcile,
    presence,
    emitCursor,
    emitTyping,
  };
}
