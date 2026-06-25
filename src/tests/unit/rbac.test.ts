import { describe, it, expect } from "vitest";
import { hasPermission, canEdit, canSync } from "@/server/auth/rbac";

describe("RBAC", () => {
  it("viewer can only read", () => {
    expect(hasPermission("VIEWER", "read")).toBe(true);
    expect(hasPermission("VIEWER", "edit")).toBe(false);
    expect(hasPermission("VIEWER", "sync")).toBe(false);
    expect(canSync("VIEWER")).toBe(false);
  });

  it("editor can edit and sync", () => {
    expect(canEdit("EDITOR")).toBe(true);
    expect(canSync("EDITOR")).toBe(true);
    expect(hasPermission("EDITOR", "create_version")).toBe(true);
  });

  it("owner has all permissions", () => {
    expect(hasPermission("OWNER", "delete")).toBe(true);
    expect(hasPermission("OWNER", "manage_members")).toBe(true);
    expect(hasPermission("OWNER", "ai")).toBe(true);
  });
});
