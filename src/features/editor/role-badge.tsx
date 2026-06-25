"use client";

import { Badge } from "@/components/ui/badge";
import { Crown, Eye, Pencil } from "lucide-react";
import type { DocumentRole } from "@/types/operation";
import { getRoleLabel } from "@/lib/permissions/document-role-ui";

interface RoleBadgeProps {
  role: DocumentRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const label = getRoleLabel(role);

  if (role === "OWNER") {
    return (
      <Badge variant="success" aria-label={`Your role: ${label}`}>
        <Crown className="mr-1 h-3 w-3" />
        {label}
      </Badge>
    );
  }

  if (role === "EDITOR") {
    return (
      <Badge variant="default" aria-label={`Your role: ${label}`}>
        <Pencil className="mr-1 h-3 w-3" />
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="warning" aria-label={`Your role: ${label}`}>
      <Eye className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}
