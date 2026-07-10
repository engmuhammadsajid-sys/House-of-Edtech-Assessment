"use client";

import React, { memo, useCallback, useLayoutEffect, useRef } from "react";

interface CollaborativeEditorProps {
  content: string;
  onChange: (content: string) => void;
  documentId?: string;
  /** Remount when resolved local/server content changes (e.g. after offline merge). */
  bootstrapKey?: string;
  userId: string;
  readOnly?: boolean;
  onReadOnlyInteraction?: () => void;
  emitCursor: (cursor: number) => void;
  emitTyping: (isTyping: boolean) => void;
  onSelectionChange?: (selectedText: string) => void;
  presence: import("@/types/operation").PresenceUser[];
}

export const CollaborativeEditor = memo(function CollaborativeEditor({
  content,
  onChange,
  documentId,
  bootstrapKey,
  userId,
  readOnly = false,
  onReadOnlyInteraction,
  emitCursor,
  emitTyping,
  onSelectionChange,
  presence,
}: CollaborativeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reportSelection = useCallback(
    (el: HTMLTextAreaElement) => {
      if (!onSelectionChange) return;
      const { selectionStart, selectionEnd, value } = el;
      const text =
        selectionStart !== selectionEnd ? value.slice(selectionStart, selectionEnd) : "";
      onSelectionChange(text);
    },
    [onSelectionChange]
  );

  // Sync remote/bootstrap content without fighting the user's cursor during local typing.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || el.value === content) return;

    // While focused, the textarea is authoritative (avoids clobbering offline edits on reconnect).
    if (document.activeElement === el) return;

    const wasFocused = document.activeElement === el;
    const selStart = el.selectionStart;
    const selEnd = el.selectionEnd;
    const prevLen = el.value.length;

    el.value = content;

    if (wasFocused) {
      const delta = content.length - prevLen;
      const start = Math.max(0, Math.min(selStart + delta, content.length));
      const end = Math.max(0, Math.min(selEnd + delta, content.length));
      el.setSelectionRange(start, end);
    }
  }, [content]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (readOnly) return;
      onChange(e.target.value);
      emitCursor(e.target.selectionStart);
      emitTyping(true);
      setTimeout(() => emitTyping(false), 1000);
    },
    [onChange, emitCursor, emitTyping, readOnly]
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const el = e.target as HTMLTextAreaElement;
      if (readOnly) return;
      emitCursor(el.selectionStart);
      reportSelection(el);
    },
    [emitCursor, readOnly, reportSelection]
  );

  const handleReadOnlyInteraction = useCallback(() => {
    onReadOnlyInteraction?.();
  }, [onReadOnlyInteraction]);

  return (
    <div className="relative flex-1">
      <textarea
        key={bootstrapKey ?? documentId}
        ref={textareaRef}
        defaultValue={content}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyUp={handleSelect}
        onFocus={readOnly ? handleReadOnlyInteraction : undefined}
        onMouseDown={readOnly ? handleReadOnlyInteraction : undefined}
        readOnly={readOnly}
        className="w-full h-full min-h-[60vh] resize-none bg-transparent p-6 text-base leading-relaxed focus:outline-none font-mono select-text"
        placeholder={readOnly ? "View only" : "Start writing... Works offline."}
        spellCheck
        aria-label="Document editor"
      />

      {presence
        .filter((u) => u.userId !== userId && u.cursor !== undefined)
        .map((user) => (
          <div
            key={user.userId}
            className="absolute pointer-events-none w-0.5 h-5 animate-pulse"
            style={{
              left: `${Math.min((user.cursor ?? 0) * 0.6, 90)}%`,
              top: "1.5rem",
              backgroundColor: user.color,
            }}
            title={`${user.name}'s cursor`}
          />
        ))}

      {presence.some((u) => u.isTyping && u.userId !== userId) && (
        <div className="absolute bottom-4 left-6 text-xs text-foreground/50">
          {presence
            .filter((u) => u.isTyping && u.userId !== userId)
            .map((u) => u.name)
            .join(", ")}{" "}
          typing...
        </div>
      )}
    </div>
  );
});
