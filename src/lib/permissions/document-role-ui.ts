import type { DocumentRole } from "@/types/operation";

export const ROLE_LABELS: Record<DocumentRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export function getRoleLabel(role: DocumentRole | undefined): string {
  if (!role) return "Member";
  return ROLE_LABELS[role];
}

type PermissionAction =
  | "edit"
  | "sync"
  | "snapshot"
  | "restore"
  | "ai"
  | "delete";

const ACTION_MESSAGES: Record<PermissionAction, string> = {
  edit: "Viewers cannot edit this document.",
  sync: "Viewers cannot sync or push changes to this document.",
  snapshot: "You do not have permission to create snapshots.",
  restore: "You do not have permission to restore versions.",
  ai: "You do not have permission to use the AI assistant on this document.",
  delete: "Only the document owner can delete this document.",
};

export function getPermissionDeniedMessage(action: PermissionAction): string {
  return ACTION_MESSAGES[action];
}

export async function parseApiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error?.trim() || fallback;
  } catch {
    return fallback;
  }
}
