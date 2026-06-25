import type { DocumentAccess } from "@/server/auth/authorization";

export type TenantScope = Pick<DocumentAccess, "documentId" | "tenantId">;

/** Verify document belongs to the tenant returned by authorization. */
export function assertTenantScope(
  documentTenantId: string,
  access: DocumentAccess
): void {
  if (documentTenantId !== access.tenantId) {
    throw new Error("Tenant isolation violation");
  }
}

export function tenantDocumentWhere(access: TenantScope) {
  return {
    id: access.documentId,
    tenantId: access.tenantId,
  };
}
