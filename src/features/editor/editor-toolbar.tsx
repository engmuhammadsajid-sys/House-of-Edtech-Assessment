"use client";

import React, { memo } from "react";
import { useEditorStore } from "@/store/editor-store";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/features/editor/role-badge";
import { Wifi, WifiOff, RefreshCw, AlertCircle, ArrowLeft, Eye } from "lucide-react";
import type { DocumentRole } from "@/types/operation";

interface EditorToolbarProps {
  documentId: string;
  userId: string;
  userName: string;
  role?: DocumentRole;
  readOnly?: boolean;
  onBack?: () => void;
  onSaveVersion: () => void;
  onOpenAI: () => void;
  onOpenHistory: () => void;
  onOpenDeadLetter?: () => void;
  onPermissionDenied?: (message: string) => void;
}

export const EditorToolbar = memo(function EditorToolbar({
  role,
  readOnly = false,
  onBack,
  onSaveVersion,
  onOpenAI,
  onOpenHistory,
  onOpenDeadLetter,
  onPermissionDenied,
}: EditorToolbarProps) {
  const { syncStatus, isOnline, queue, presence, title, conflictCount } = useEditorStore();
  const onlineCount = presence.length;
  const pendingCount = queue.filter(
    (q) => q.status === "PENDING" || q.status === "SYNCING"
  ).length;
  const deadLetterCount = queue.filter((q) => q.status === "FAILED").length;

  return (
    <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-2">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-foreground/60 hover:text-foreground flex items-center gap-1"
            aria-label="Back to documents"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
        <h1 className="text-lg font-semibold truncate max-w-xs">{title}</h1>
        {role && <RoleBadge role={role} />}
        <SyncBadge status={syncStatus} isOnline={isOnline} pending={pendingCount} readOnly={readOnly} />
        {conflictCount > 0 && (
          <Badge variant="warning">
            <AlertCircle className="h-3 w-3 mr-1" />
            {conflictCount} failed
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {presence.slice(0, 5).map((user) => (
            <div
              key={user.userId}
              className="h-7 w-7 rounded-full flex items-center justify-center text-xs text-white font-medium"
              style={{ backgroundColor: user.color }}
              title={user.name}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
          ))}
          <span className="text-xs text-foreground/60 ml-1">{onlineCount} online</span>
        </div>

        <button onClick={onOpenHistory} className="text-sm hover:underline">History</button>
        {!readOnly ? (
          <>
            <button onClick={onSaveVersion} className="text-sm hover:underline">Snapshot</button>
            <button onClick={onOpenAI} className="text-sm hover:underline">AI Assistant</button>
            {onOpenDeadLetter && deadLetterCount > 0 && (
              <button onClick={onOpenDeadLetter} className="text-sm text-red-500 hover:underline">
                Failed ({deadLetterCount})
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                onPermissionDenied?.("Viewers cannot create snapshots or use the AI assistant.")
              }
              className="text-sm text-foreground/40 cursor-not-allowed"
              aria-disabled="true"
            >
              Snapshot
            </button>
            <button
              type="button"
              onClick={() =>
                onPermissionDenied?.("Viewers cannot create snapshots or use the AI assistant.")
              }
              className="text-sm text-foreground/40 cursor-not-allowed"
              aria-disabled="true"
            >
              AI Assistant
            </button>
          </>
        )}
      </div>
    </div>
  );
});

const SyncBadge = memo(function SyncBadge({
  status,
  isOnline,
  pending,
  readOnly = false,
}: {
  status: string;
  isOnline: boolean;
  pending: number;
  readOnly?: boolean;
}) {
  if (readOnly && isOnline) {
    return (
      <Badge variant="default">
        <Eye className="mr-1 h-3 w-3" /> Read-only
      </Badge>
    );
  }
  if (!isOnline) {
    return (
      <Badge variant="warning">
        <WifiOff className="h-3 w-3 mr-1" /> Offline {pending > 0 && `(${pending} pending)`}
      </Badge>
    );
  }
  if (status === "syncing") {
    return (
      <Badge variant="default">
        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Syncing
      </Badge>
    );
  }
  if (status === "error") {
    return <Badge variant="error"><AlertCircle className="h-3 w-3 mr-1" /> Sync Error</Badge>;
  }
  return (
    <Badge variant="success">
      <Wifi className="h-3 w-3 mr-1" /> Synced
    </Badge>
  );
});
