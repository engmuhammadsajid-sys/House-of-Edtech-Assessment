import { LocalOperationRepository } from "@/lib/db/local-operation-repository";
import { LocalSyncQueueRepository } from "@/lib/db/local-sync-queue-repository";
import type { DocumentRole } from "@/types/operation";

export async function materializeLocalDocument(
  documentId: string,
  payload: { title: string; content: string }
): Promise<{ document: { id: string; title: string; content: string; updatedAt: string }; role: DocumentRole } | null> {
  const res = await fetch(`/api/documents/${documentId}/materialize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Push a full content snapshot to the server and clear local op/queue state. */
export async function materializeDocumentSnapshot(
  documentId: string,
  payload: { title: string; content: string }
): Promise<{ document: { id: string; title: string; content: string; updatedAt: string }; role: DocumentRole } | null> {
  const result = await materializeLocalDocument(documentId, payload);
  if (!result) return null;

  const opRepo = new LocalOperationRepository();
  const queueRepo = new LocalSyncQueueRepository();
  await opRepo.deleteByDocument(documentId);
  const queue = await queueRepo.getByDocument(documentId);
  await Promise.all(queue.map((item) => queueRepo.delete(item.id)));

  return result;
}
