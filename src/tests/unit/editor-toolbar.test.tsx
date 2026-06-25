import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorToolbar } from "@/features/editor/editor-toolbar";
import { useEditorStore } from "@/store/editor-store";

describe("EditorToolbar viewer restrictions", () => {
  beforeEach(() => {
    useEditorStore.setState({
      title: "Test Doc",
      syncStatus: "idle",
      isOnline: true,
      queue: [],
      presence: [],
      conflictCount: 0,
    });
  });

  it("shows Viewer role badge and disabled Snapshot/AI when readOnly", () => {
    render(
      <EditorToolbar
        documentId="doc-1"
        userId="user-1"
        userName="User"
        role="VIEWER"
        readOnly
        onSaveVersion={() => {}}
        onOpenAI={() => {}}
        onOpenHistory={() => {}}
      />
    );

    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /snapshot/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /ai assistant/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /history/i })).toBeInTheDocument();
  });

  it("shows Owner role and Snapshot/AI when not readOnly", () => {
    render(
      <EditorToolbar
        documentId="doc-1"
        userId="user-1"
        userName="User"
        role="OWNER"
        readOnly={false}
        onSaveVersion={() => {}}
        onOpenAI={() => {}}
        onOpenHistory={() => {}}
      />
    );

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /snapshot/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ai assistant/i })).toBeInTheDocument();
  });

  it("shows Editor role badge", () => {
    render(
      <EditorToolbar
        documentId="doc-1"
        userId="user-1"
        userName="User"
        role="EDITOR"
        readOnly={false}
        onSaveVersion={() => {}}
        onOpenAI={() => {}}
        onOpenHistory={() => {}}
      />
    );

    expect(screen.getByText("Editor")).toBeInTheDocument();
  });
});
