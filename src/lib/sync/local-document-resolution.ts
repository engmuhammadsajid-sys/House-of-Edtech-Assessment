import { LocalDocumentRepository } from "@/lib/db/local-document-repository";
import { LocalOperationRepository } from "@/lib/db/local-operation-repository";
import { LocalSyncQueueRepository } from "@/lib/db/local-sync-queue-repository";
import type { DocumentRole, DocumentState } from "@/types/operation";

export async function hasLocalPendingChanges(documentId: string): Promise<boolean> {
  const opRepo = new LocalOperationRepository();
  const queueRepo = new LocalSyncQueueRepository();

  const pendingOps = await opRepo.getPending(documentId);
  if (pendingOps.length > 0) return true;

  const queue = await queueRepo.getByDocument(documentId);
  return queue.some(
    (item) => item.status === "PENDING" || item.status === "SYNCING" || item.status === "FAILED"
  );
}

export function isLocalDocumentNewer(
  local: DocumentState | undefined,
  serverUpdatedAt: string | Date
): boolean {
  if (!local) return false;
  const serverTime =
    serverUpdatedAt instanceof Date ? serverUpdatedAt.getTime() : new Date(serverUpdatedAt).getTime();
  return local.updatedAt > serverTime;
}

export async function shouldPreferLocalDocument(
  documentId: string,
  local: DocumentState | undefined,
  server: { updatedAt: string | Date; content: string }
): Promise<boolean> {
  if (!local) return false;
  if (await hasLocalPendingChanges(documentId)) return true;
  if (local.content !== server.content) return true;
  return isLocalDocumentNewer(local, server.updatedAt);
}

export async function mergeServerDocumentToLocal(
  documentId: string,
  server: { title: string; content: string; updatedAt: string | Date },
  role?: DocumentRole
): Promise<DocumentState> {
  const repo = new LocalDocumentRepository();
  const local = await repo.getById(documentId);
  if (local && local.content !== server.content) {
    const merged: DocumentState = {
      ...local,
      title: server.title || local.title,
      role: role ?? local.role,
    };
    if (merged.title !== local.title || merged.role !== local.role) {
      await repo.save(merged);
    }
    return merged;
  }

  const preferLocal = await shouldPreferLocalDocument(documentId, local, server);

  if (preferLocal && local) {
    const merged: DocumentState = {
      ...local,
      title: server.title || local.title,
      role: role ?? local.role,
    };
    if (merged.role !== local.role || merged.title !== local.title) {
      await repo.save(merged);
    }
    return merged;
  }

  const saved: DocumentState = {
    id: documentId,
    title: server.title,
    content: server.content,
    updatedAt: new Date(server.updatedAt).getTime(),
    version: (local?.version ?? 0) + 1,
    role: role ?? local?.role,
  };
  await repo.save(saved);
  return saved;
}
