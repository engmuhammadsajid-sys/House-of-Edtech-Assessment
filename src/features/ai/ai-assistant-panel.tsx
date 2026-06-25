"use client";

import React, { memo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface AIAssistantPanelProps {
  documentId: string;
  selectedText: string;
  onClose: () => void;
  onResult: (result: string) => void;
}

const ACTIONS = [
  { id: "summary", label: "Summarize" },
  { id: "rewrite", label: "Rewrite" },
  { id: "improve", label: "Improve Writing" },
  { id: "meeting_notes", label: "Meeting Notes" },
  { id: "action_items", label: "Action Items" },
  { id: "insights", label: "Insights" },
] as const;

export const AIAssistantPanel = memo(function AIAssistantPanel({
  documentId,
  selectedText,
  onClose,
  onResult,
}: AIAssistantPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAction = useCallback(
    async (action: string) => {
      if (!selectedText.trim()) {
        setError("Select text in the editor first");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, selectedText, documentId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "AI failed");
        setResult(data.result);
        onResult(data.result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "AI failed");
      } finally {
        setLoading(false);
      }
    },
    [documentId, selectedText, onResult]
  );

  return (
    <div className="w-80 border-l border-foreground/10 flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-4 border-b border-foreground/10">
        <h2 className="font-semibold">AI Assistant</h2>
        <button onClick={onClose} className="text-sm text-foreground/60 hover:text-foreground">
          Close
        </button>
      </div>

      <div className="p-4 space-y-2 flex-1 overflow-auto">
        <p className="text-xs text-foreground/60 mb-3">
          Select text in the editor, then choose an action. Results create a version snapshot.
        </p>

        {ACTIONS.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={loading}
            onClick={() => runAction(action.id)}
          >
            {action.label}
          </Button>
        ))}

        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

        {result && (
          <div className="mt-4 p-3 rounded-md bg-foreground/5 text-sm whitespace-pre-wrap">
            {result}
          </div>
        )}
      </div>
    </div>
  );
});
