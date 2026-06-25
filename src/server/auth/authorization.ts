import type { DocumentRole } from "@prisma/client";
import { withRlsContext } from "@/server/db/prisma";
import { tenantDocumentWhere } from "@/server/db/tenant";
import { canEdit, canSync, hasPermission, type Permission } from "./rbac";

export interface DocumentAccess {
  documentId: string;
  userId: string;
  role: DocumentRole;
  tenantId: string;
}

export class AuthorizationService {
  async getDocumentAccess(
    documentId: string,
    userId: string
  ): Promise<DocumentAccess | null> {
    return withRlsContext(userId, async (db) => {
      const doc = await db.document.findFirst({
        where: {
          id: documentId,
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
        include: { members: { where: { userId } } },
      });

      if (!doc) return null;

      if (doc.ownerId === userId) {
        return { documentId, userId, role: "OWNER", tenantId: doc.tenantId };
      }

      const membership = doc.members[0];
      if (!membership) return null;

      return {
        documentId,
        userId,
        role: membership.role,
        tenantId: doc.tenantId,
      };
    });
  }

  async requirePermission(
    documentId: string,
    userId: string,
    permission: Permission
  ): Promise<DocumentAccess> {
    const access = await this.getDocumentAccess(documentId, userId);
    if (!access || !hasPermission(access.role, permission)) {
      throw new AuthorizationError("Insufficient permissions");
    }
    return access;
  }

  async requireEdit(documentId: string, userId: string): Promise<DocumentAccess> {
    const access = await this.getDocumentAccess(documentId, userId);
    if (!access || !canEdit(access.role)) {
      throw new AuthorizationError("Edit access required");
    }
    return access;
  }

  async requireSync(documentId: string, userId: string): Promise<DocumentAccess> {
    const access = await this.getDocumentAccess(documentId, userId);
    if (!access || !canSync(access.role)) {
      throw new AuthorizationError("Sync access denied for viewers");
    }
    return access;
  }

  /** Verify document exists within tenant scope. */
  async assertDocumentTenant(access: DocumentAccess): Promise<void> {
    await withRlsContext(access.userId, async (db) => {
      const doc = await db.document.findFirst({
        where: tenantDocumentWhere(access),
      });
      if (!doc) throw new AuthorizationError("Tenant isolation violation");
    });
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export const authz = new AuthorizationService();
