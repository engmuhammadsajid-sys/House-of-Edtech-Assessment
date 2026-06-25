import type { DocumentState } from "@/types/operation";
import { getDB } from "./indexed-db";

export class LocalDocumentRepository {
  async getAll(): Promise<DocumentState[]> {
    const db = await getDB();
    return db.getAll("documents");
  }

  async getById(id: string): Promise<DocumentState | undefined> {
    const db = await getDB();
    return db.get("documents", id);
  }

  async save(document: DocumentState): Promise<void> {
    const db = await getDB();
    await db.put("documents", document);
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("documents", id);
  }

  async create(title: string, id?: string): Promise<DocumentState> {
    const doc: DocumentState = {
      id: id ?? crypto.randomUUID(),
      title,
      content: "",
      updatedAt: Date.now(),
      version: 1,
    };
    await this.save(doc);
    return doc;
  }

  async updateContent(id: string, content: string): Promise<DocumentState | undefined> {
    const doc = await this.getById(id);
    if (!doc) return undefined;
    const updated: DocumentState = {
      ...doc,
      content,
      updatedAt: Date.now(),
      version: doc.version + 1,
    };
    await this.save(updated);
    return updated;
  }
}
