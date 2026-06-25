import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "success" | "warning" | "error" }>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "default" && "bg-foreground/10 text-foreground",
        variant === "success" && "bg-green-500/20 text-green-600 dark:text-green-400",
        variant === "warning" && "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
        variant === "error" && "bg-red-500/20 text-red-600 dark:text-red-400",
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
