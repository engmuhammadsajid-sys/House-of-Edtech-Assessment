import type { VersionSnapshot } from "@/types/operation";
import { getDB } from "./indexed-db";

export class LocalVersionRepository {
  async getByDocument(documentId: string): Promise<VersionSnapshot[]> {
    const db = await getDB();
    const versions = await db.getAllFromIndex("versions", "by-document", documentId);
    return versions.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getById(id: string): Promise<VersionSnapshot | undefined> {
    const db = await getDB();
    return db.get("versions", id);
  }

  async save(version: VersionSnapshot): Promise<void> {
    const db = await getDB();
    await db.put("versions", version);
  }

  async create(
    documentId: string,
    name: string,
    content: string,
    createdById: string,
    options?: { parentId?: string; isRestore?: boolean; metadata?: Record<string, unknown> }
  ): Promise<VersionSnapshot> {
    const version: VersionSnapshot = {
      id: crypto.randomUUID(),
      documentId,
      name,
      content,
      createdById,
      parentId: options?.parentId,
      isRestore: options?.isRestore ?? false,
      metadata: options?.metadata,
      createdAt: Date.now(),
    };
    await this.save(version);
    return version;
  }
}
