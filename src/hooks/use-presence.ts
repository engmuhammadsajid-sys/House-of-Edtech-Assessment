"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { useEditorStore } from "@/store/editor-store";
import type { DocumentOperation, PresenceUser } from "@/types/operation";

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface UsePresenceOptions {
  documentId: string;
  userId: string;
  userName: string;
  enabled?: boolean;
  canEmitOperations?: boolean;
  onRemoteOperation?: (operation: DocumentOperation) => void;
  onReconnect?: () => void;
}

async function fetchWsToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/ws-token");
    if (!res.ok) return null;
    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

export function usePresence({
  documentId,
  userId,
  userName,
  enabled = true,
  canEmitOperations = true,
  onRemoteOperation,
  onReconnect,
}: UsePresenceOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onRemoteOperationRef = useRef(onRemoteOperation);
  const onReconnectRef = useRef(onReconnect);
  const { setPresence, presence } = useEditorStore();
  const colorRef = useRef(colorForUser(userId));

  useEffect(() => {
    onRemoteOperationRef.current = onRemoteOperation;
    onReconnectRef.current = onReconnect;
  });

  const emitCursor = useCallback(
    (cursor: number) => {
      socketRef.current?.emit("presence", {
        type: "cursor",
        documentId,
        cursor,
      });
    },
    [documentId]
  );

  const emitTyping = useCallback(
    (isTyping: boolean) => {
      socketRef.current?.emit("presence", {
        type: "typing",
        documentId,
        isTyping,
      });
    },
    [documentId]
  );

  const emitOperation = useCallback(
    (operation: DocumentOperation) => {
      if (!canEmitOperations) return;
      socketRef.current?.emit("operation", operation);
    },
    [canEmitOperations]
  );

  useEffect(() => {
    if (!enabled || !userId) return;

    colorRef.current = colorForUser(userId);
    let cancelled = false;

    void (async () => {
      const token = await fetchWsToken();
      if (cancelled || !token) return;

      const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "", {
        path: "/api/socketio",
        transports: ["websocket", "polling"],
        auth: { token },
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("join-document", { documentId, color: colorRef.current });
        onReconnectRef.current?.();
      });

      socket.on("presence-update", (users: PresenceUser[]) => {
        setPresence(users);
      });

      socket.on("remote-operation", (operation: DocumentOperation) => {
        if (operation.documentId !== documentId) return;
        if (operation.userId === userId) return;
        onRemoteOperationRef.current?.(operation);
      });

      socket.on("error", () => {
        socket.disconnect();
      });
    })();

    return () => {
      cancelled = true;
      const socket = socketRef.current;
      if (socket) {
        socket.emit("leave-document", { documentId });
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [documentId, userId, userName, enabled, setPresence]);

  return { presence, emitCursor, emitTyping, emitOperation, onlineCount: presence.length };
}
