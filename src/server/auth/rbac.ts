import type { DocumentRole } from "@prisma/client";

const ROLE_HIERARCHY: Record<DocumentRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

export const PERMISSIONS = {
  READ: "read",
  EDIT: "edit",
  DELETE: "delete",
  MANAGE_MEMBERS: "manage_members",
  CREATE_VERSION: "create_version",
  RESTORE_VERSION: "restore_version",
  SYNC: "sync",
  AI: "ai",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<DocumentRole, Permission[]> = {
  VIEWER: [PERMISSIONS.READ],
  EDITOR: [
    PERMISSIONS.READ,
    PERMISSIONS.EDIT,
    PERMISSIONS.CREATE_VERSION,
    PERMISSIONS.RESTORE_VERSION,
    PERMISSIONS.SYNC,
    PERMISSIONS.AI,
  ],
  OWNER: Object.values(PERMISSIONS),
};

export function hasPermission(role: DocumentRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canEdit(role: DocumentRole): boolean {
  return hasPermission(role, PERMISSIONS.EDIT);
}

export function canSync(role: DocumentRole): boolean {
  return hasPermission(role, PERMISSIONS.SYNC);
}

export function isRoleAtLeast(role: DocumentRole, minimum: DocumentRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum];
}
