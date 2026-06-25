"use client";

import { useThemeStore } from "@/store/editor-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="flex-1 max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/dashboard" className="text-sm text-foreground/60 hover:underline">
          Back to Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {(["light", "dark", "system"] as const).map((t) => (
            <Button
              key={t}
              variant={theme === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Keyboard Shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Save snapshot</span><kbd className="px-2 py-0.5 rounded bg-foreground/10">Ctrl+S</kbd></div>
          <div className="flex justify-between"><span>Open AI panel</span><kbd className="px-2 py-0.5 rounded bg-foreground/10">Ctrl+K</kbd></div>
          <div className="flex justify-between"><span>Version history</span><kbd className="px-2 py-0.5 rounded bg-foreground/10">Ctrl+H</kbd></div>
        </CardContent>
      </Card>
    </div>
  );
}
