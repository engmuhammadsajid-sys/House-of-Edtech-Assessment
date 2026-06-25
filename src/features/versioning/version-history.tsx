"use client";

import React, { memo, useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { getPermissionDeniedMessage } from "@/lib/permissions/document-role-ui";

interface VersionHistoryProps {
  documentId: string;
  canRestore?: boolean;
  onRestore: (versionId: string) => void;
  onPermissionDenied?: (message: string) => void;
  onClose: () => void;
}

interface Version {
  id: string;
  name: string;
  createdAt: string;
  isRestore: boolean;
  createdBy: { name: string | null };
}

export const VersionHistory = memo(function VersionHistory({
  documentId,
  canRestore = true,
  onRestore,
  onPermissionDenied,
  onClose,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });

  const loadVersions = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/versions`);
    const data = await res.json();
    setVersions(data.versions ?? []);
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const itemHeight = 72;
    const start = Math.floor(el.scrollTop / itemHeight);
    const visible = Math.ceil(el.clientHeight / itemHeight) + 2;
    setVisibleRange({ start, end: start + visible });
  }, []);

  const visibleVersions = versions.slice(visibleRange.start, visibleRange.end);
  const offsetY = visibleRange.start * 72;

  return (
    <div className="w-96 border-l border-foreground/10 flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-4 border-b border-foreground/10">
        <h2 className="font-semibold">Version History</h2>
        <button onClick={onClose} className="text-sm text-foreground/60">Close</button>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
        style={{ height: "100%" }}
      >
        {loading ? (
          <p className="p-4 text-sm text-foreground/60">Loading...</p>
        ) : versions.length === 0 ? (
          <p className="p-4 text-sm text-foreground/60">No versions yet</p>
        ) : (
          <div style={{ height: versions.length * 72, position: "relative" }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleVersions.map((version) => (
                <div
                  key={version.id}
                  className="p-4 border-b border-foreground/5 hover:bg-foreground/5"
                  style={{ height: 72 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{version.name}</p>
                      <p className="text-xs text-foreground/50">
                        {version.createdBy.name} · {new Date(version.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {canRestore ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRestore(version.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-foreground/40"
                        onClick={() =>
                          onPermissionDenied?.(getPermissionDeniedMessage("restore"))
                        }
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
