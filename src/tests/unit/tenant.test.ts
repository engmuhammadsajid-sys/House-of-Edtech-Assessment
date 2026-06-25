import { describe, it, expect } from "vitest";
import { assertTenantScope, tenantDocumentWhere } from "@/server/db/tenant";
import type { DocumentAccess } from "@/server/auth/authorization";

const access: DocumentAccess = {
  documentId: "doc-1",
  userId: "user-1",
  role: "OWNER",
  tenantId: "tenant-a",
};

describe("tenant isolation helpers", () => {
  it("tenantDocumentWhere scopes queries to document and tenant", () => {
    expect(tenantDocumentWhere(access)).toEqual({
      id: "doc-1",
      tenantId: "tenant-a",
    });
  });

  it("assertTenantScope throws on tenant mismatch", () => {
    expect(() => assertTenantScope("tenant-b", access)).toThrow("Tenant isolation violation");
    expect(() => assertTenantScope("tenant-a", access)).not.toThrow();
  });
});
