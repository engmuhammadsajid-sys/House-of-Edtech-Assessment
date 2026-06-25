import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isLocalDocumentNewer,
  shouldPreferLocalDocument,
} from "@/lib/sync/local-document-resolution";
import type { DocumentState } from "@/types/operation";

vi.mock("@/lib/db/local-operation-repository", () => ({
  LocalOperationRepository: class {
    getPending = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock("@/lib/db/local-sync-queue-repository", () => ({
  LocalSyncQueueRepository: class {
    getByDocument = vi.fn().mockResolvedValue([]);
  },
}));

describe("local-document-resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers local when updatedAt is newer than server", async () => {
    const local: DocumentState = {
      id: "doc-1",
      title: "Local",
      content: "offline edit",
      updatedAt: Date.now(),
      version: 2,
    };
    const serverUpdatedAt = new Date(Date.now() - 60_000);

    expect(isLocalDocumentNewer(local, serverUpdatedAt)).toBe(true);
    await expect(
      shouldPreferLocalDocument("doc-1", local, {
        updatedAt: serverUpdatedAt,
        content: "server text",
      })
    ).resolves.toBe(true);
  });

  it("does not prefer local when server is newer and no pending changes", async () => {
    const local: DocumentState = {
      id: "doc-1",
      title: "Local",
      content: "old",
      updatedAt: Date.now() - 120_000,
      version: 1,
    };
    const serverUpdatedAt = new Date();

    expect(isLocalDocumentNewer(local, serverUpdatedAt)).toBe(false);
    await expect(
      shouldPreferLocalDocument("doc-1", local, {
        updatedAt: serverUpdatedAt,
        content: "old",
      })
    ).resolves.toBe(false);
  });

  it("prefers local when content differs from server (offline shell edits)", async () => {
    const local: DocumentState = {
      id: "doc-1",
      title: "Local",
      content: "offline edit",
      updatedAt: Date.now() - 120_000,
      version: 2,
    };

    await expect(
      shouldPreferLocalDocument("doc-1", local, {
        updatedAt: new Date(),
        content: "server text",
      })
    ).resolves.toBe(true);
  });
});
