"use client";

import React, { memo, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface DeadLetterPanelProps {
  documentId: string;
  onClose: () => void;
}

interface DeadLetterEntry {
  id: string;
  operationId: string;
  error: string;
  createdAt: string;
  payload: unknown;
}

export const DeadLetterPanel = memo(function DeadLetterPanel({
  documentId,
  onClose,
}: DeadLetterPanelProps) {
  const [entries, setEntries] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/dead-letter`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async (deadLetterId: string) => {
    await fetch(`/api/documents/${documentId}/dead-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", deadLetterId }),
    });
    void load();
  };

  return (
    <div className="w-96 border-l border-foreground/10 flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-4 border-b border-foreground/10">
        <h2 className="font-semibold">Failed Sync Queue</h2>
        <button onClick={onClose} className="text-sm text-foreground/60">Close</button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-foreground/60">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-foreground/60">No failed operations</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="p-3 rounded border border-foreground/10 text-sm">
              <p className="font-mono text-xs text-foreground/50">{entry.operationId}</p>
              <p className="text-red-500 mt-1">{entry.error}</p>
              <p className="text-xs text-foreground/50 mt-1">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => handleRetry(entry.id)}>
                Retry
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
