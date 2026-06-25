"use client";

import { AlertCircle, X } from "lucide-react";

interface PermissionBannerProps {
  message: string;
  onDismiss: () => void;
}

export function PermissionBanner({ message, onDismiss }: PermissionBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 hover:bg-red-500/10"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
