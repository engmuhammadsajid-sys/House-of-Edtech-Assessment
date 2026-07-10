"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCollaborativeEditor } from "@/hooks/use-collaborative-editor";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { EditorToolbar } from "@/features/editor/editor-toolbar";
import { CollaborativeEditor } from "@/features/editor/collaborative-editor";
import { AIAssistantPanel } from "@/features/ai/ai-assistant-panel";
import { VersionHistory } from "@/features/versioning/version-history";
import { DeadLetterPanel } from "@/features/sync/dead-letter-panel";
import { LocalDocumentRepository } from "@/lib/db/local-document-repository";
import {
  mergeServerDocumentToLocal,
  shouldPreferLocalDocument,
} from "@/lib/sync/local-document-resolution";
import { materializeDocumentSnapshot } from "@/lib/sync/materialize-document";
import { useEditorStore } from "@/store/editor-store";
import { PermissionBanner } from "@/components/permission-banner";
import {
  getPermissionDeniedMessage,
  parseApiErrorMessage,
} from "@/lib/permissions/document-role-ui";
import type { DocumentRole } from "@/types/operation";

async function fetchDocument(id: string) {
  const res = await fetch(`/api/documents/${id}`);
  if (!res.ok) throw new Error("Not found");
  return res.json();
}

interface ResolvedDocument {
  id: string;
  title: string;
  content: string;
  role?: DocumentRole;
}

interface DocumentWorkspaceProps {
  documentId: string;
  onBack?: () => void;
}

export function DocumentWorkspace({ documentId, onBack }: DocumentWorkspaceProps) {
  return <DocumentWorkspaceBody key={documentId} documentId={documentId} onBack={onBack} />;
}

function DocumentWorkspaceBody({ documentId: id, onBack }: DocumentWorkspaceProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [showAI, setShowAI] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeadLetter, setShowDeadLetter] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [localBootstrap, setLocalBootstrap] = useState<ResolvedDocument | null>(null);
  const [preferLocal, setPreferLocal] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [resolvedForId, setResolvedForId] = useState<string | null>(null);
  const localDocRepo = useRef(new LocalDocumentRepository());
  const mergeReady = resolvedForId === id;
  const wasOfflineRef = useRef(!isOnline);

  const { data, isError, isLoading: serverLoading, isFetched } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDocument(id),
    enabled: !!session?.user?.id && isOnline,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await localDocRepo.current.getById(id);
      if (cancelled) return;
      if (local) {
        setLocalBootstrap({
          id,
          title: local.title,
          content: local.content,
          role: local.role,
        });
      }
      setLocalReady(true);
      if (!navigator.onLine) {
        setResolvedForId(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // On reconnect, refetch the server document. Offline content is kept via live
  // editor store + localBootstrap (see resolvedDoc), not synchronous setState here.
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;

    void queryClient.invalidateQueries({ queryKey: ["document", id] }).then(() => {
      setResolvedForId(null);
    });
  }, [isOnline, id, queryClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isOnline) {
        if (!cancelled) setResolvedForId(id);
        return;
      }

      const local = await localDocRepo.current.getById(id);

      if (!data?.document && isFetched) {
        if (local && isError) {
          const materialized = await materializeDocumentSnapshot(id, {
            title: local.title,
            content: local.content,
          });
          if (cancelled) return;
          if (materialized) {
            await queryClient.fetchQuery({
              queryKey: ["document", id],
              queryFn: () => fetchDocument(id),
            });
            setLocalBootstrap({
              id,
              title: materialized.document.title,
              content: materialized.document.content,
              role: materialized.role,
            });
            setPreferLocal(false);
            setResolvedForId(id);
            return;
          }
          setLocalBootstrap({
            id,
            title: local.title,
            content: local.content,
            role: local.role,
          });
        }
        if (!cancelled) setResolvedForId(id);
        return;
      }

      if (!data?.document) return;

      const freshLocal = (await localDocRepo.current.getById(id)) ?? local;
      const useLocal = await shouldPreferLocalDocument(id, freshLocal, {
        updatedAt: data.document.updatedAt,
        content: data.document.content,
      });

      if (useLocal && freshLocal) {
        if (cancelled) return;
        setPreferLocal(true);
        setLocalBootstrap({
          id,
          title: freshLocal.title,
          content: freshLocal.content,
          role: freshLocal.role ?? data.role,
        });
        if (freshLocal.content !== data.document.content) {
          await materializeDocumentSnapshot(id, {
            title: freshLocal.title,
            content: freshLocal.content,
          });
          await queryClient.fetchQuery({
            queryKey: ["document", id],
            queryFn: () => fetchDocument(id),
          });
        }
        setResolvedForId(id);
        return;
      }

      const merged = await mergeServerDocumentToLocal(
        id,
        {
          title: data.document.title,
          content: data.document.content,
          updatedAt: data.document.updatedAt,
        },
        data.role
      );
      if (cancelled) return;
      setPreferLocal(false);
      setLocalBootstrap({
        id,
        title: merged.title,
        content: merged.content,
        role: merged.role ?? data.role,
      });
      setResolvedForId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, id, isOnline, isFetched, isError, queryClient]);

  // Keep last known server payload when offline so the editor does not remount/bootstrap
  // to a stale empty snapshot and corrupt in-progress text.
  const serverDocument = data?.document;
  const serverRole = data?.role;
  const awaitingServer = isOnline && !!session?.user?.id && !isFetched;
  const resolveReady = localReady && (!isOnline || !awaitingServer) && mergeReady;

  const liveContent = useEditorStore((s) => (s.documentId === id ? s.content : ""));
  const liveTitle = useEditorStore((s) => (s.documentId === id ? s.title : ""));

  const resolvedDoc = useMemo((): ResolvedDocument | null => {
    if (!resolveReady) return null;

    // While online/offline toggling, prefer the live editor snapshot once available.
    if (liveContent || liveTitle) {
      return {
        id,
        title: liveTitle || localBootstrap?.title || serverDocument?.title || "Untitled",
        content: liveContent || localBootstrap?.content || serverDocument?.content || "",
        role: (isOnline ? serverRole : undefined) ?? localBootstrap?.role ?? serverRole,
      };
    }

    if (isOnline && serverDocument) {
      if (preferLocal && localBootstrap) {
        return {
          id,
          title: localBootstrap.title,
          content: localBootstrap.content,
          role: serverRole ?? localBootstrap.role,
        };
      }
      return {
        id,
        title: serverDocument.title,
        content: serverDocument.content,
        role: serverRole,
      };
    }
    if (localBootstrap) return localBootstrap;
    if (serverDocument) {
      return {
        id,
        title: serverDocument.title,
        content: serverDocument.content,
        role: serverRole,
      };
    }
    return null;
  }, [
    resolveReady,
    serverDocument,
    serverRole,
    localBootstrap,
    preferLocal,
    id,
    isOnline,
    liveContent,
    liveTitle,
  ]);

  // Only remount when the document id / role changes — not on online/offline or preferLocal flips.
  const editorBootstrapKey = useMemo(() => {
    if (!resolvedDoc) return `${id}:pending`;
    return `${id}:${resolvedDoc.role ?? "none"}`;
  }, [id, resolvedDoc]);

  const userId = session?.user?.id ?? "";
  const userName = session?.user?.name ?? session?.user?.email ?? "User";
  const readOnly = resolvedDoc?.role === "VIEWER";
  const documentRole = resolvedDoc?.role;

  const showPermissionError = useCallback((message: string) => {
    setPermissionError(message);
  }, []);

  const {
    content,
    handleChange,
    flushPendingChange,
    applyRestore,
    presence,
    emitCursor,
    emitTyping,
  } = useCollaborativeEditor({
    documentId: id,
    userId,
    userName,
    initialContent: resolvedDoc?.content ?? "",
    initialTitle: resolvedDoc?.title ?? "Untitled",
    serverBaseline: serverDocument?.content,
    bootstrapKey: editorBootstrapKey,
    role: resolvedDoc?.role,
    readOnly,
    ready: resolveReady && !!resolvedDoc,
  });

  const handleSaveVersion = useCallback(async () => {
    if (readOnly) {
      showPermissionError(getPermissionDeniedMessage("snapshot"));
      return;
    }
    flushPendingChange();
    const snapshot = useEditorStore.getState().content;
    const name = prompt("Version name:") ?? `Snapshot ${new Date().toLocaleString()}`;
    const res = await fetch(`/api/documents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content: snapshot }),
    });
    if (!res.ok) {
      showPermissionError(
        await parseApiErrorMessage(res, getPermissionDeniedMessage("snapshot"))
      );
      return;
    }
    alert("Version saved!");
  }, [id, flushPendingChange, readOnly, showPermissionError]);

  const handleRestore = useCallback(
    async (versionId: string) => {
      if (readOnly) {
        showPermissionError(getPermissionDeniedMessage("restore"));
        return;
      }
      if (!confirm("Restore this version? A new version will be created.")) return;
      const res = await fetch(`/api/documents/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", versionId }),
      });
      if (!res.ok) {
        showPermissionError(
          await parseApiErrorMessage(res, getPermissionDeniedMessage("restore"))
        );
        return;
      }
      const { version } = await res.json();
      await applyRestore(version.content);
      setShowHistory(false);
    },
    [id, applyRestore, readOnly, showPermissionError]
  );

  const waitingForServer = isOnline && !!session?.user?.id && serverLoading && !localBootstrap;
  if (!localReady || waitingForServer || (isOnline && !!session?.user?.id && !resolveReady)) {
    return <div className="flex-1 flex items-center justify-center">Loading document...</div>;
  }

  if (!resolvedDoc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p>{isOnline ? "Document not found on the server." : "Document not available offline."}</p>
        <p className="text-sm text-foreground/60">
          {isOnline
            ? "If you edited offline, open the dashboard and try again after reconnecting."
            : "Open it once while online to cache it locally."}
        </p>
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm underline">
            Back to documents
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      {permissionError && (
        <PermissionBanner
          message={permissionError}
          onDismiss={() => setPermissionError(null)}
        />
      )}
      <EditorToolbar
        documentId={id}
        userId={userId}
        userName={userName}
        role={documentRole}
        readOnly={readOnly}
        onBack={onBack}
        onSaveVersion={handleSaveVersion}
        onPermissionDenied={showPermissionError}
        onOpenAI={() => {
          if (readOnly) {
            showPermissionError(getPermissionDeniedMessage("ai"));
            return;
          }
          setShowAI(true);
        }}
        onOpenHistory={() => setShowHistory(true)}
        onOpenDeadLetter={() => setShowDeadLetter(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <CollaborativeEditor
          key={editorBootstrapKey}
          bootstrapKey={editorBootstrapKey}
          content={content}
          onChange={handleChange}
          documentId={id}
          userId={userId}
          readOnly={readOnly}
          onReadOnlyInteraction={() => showPermissionError(getPermissionDeniedMessage("edit"))}
          emitCursor={emitCursor}
          emitTyping={emitTyping}
          onSelectionChange={setSelectedText}
          presence={presence}
        />

        {showAI && !readOnly && (
          <AIAssistantPanel
            documentId={id}
            selectedText={selectedText}
            onClose={() => setShowAI(false)}
            onResult={() => {}}
          />
        )}

        {showHistory && (
          <VersionHistory
            documentId={id}
            canRestore={!readOnly}
            onRestore={handleRestore}
            onPermissionDenied={showPermissionError}
            onClose={() => setShowHistory(false)}
          />
        )}

        {showDeadLetter && !readOnly && (
          <DeadLetterPanel documentId={id} onClose={() => setShowDeadLetter(false)} />
        )}
      </div>
    </div>
  );
}
