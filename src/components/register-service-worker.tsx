"use client";

import { useEffect } from "react";

async function primeOfflineCache() {
  if (!navigator.onLine) return;
  try {
    await fetch("/dashboard", { credentials: "include" });
  } catch {
    // Ignore — user may not be signed in yet
  }
}

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await registration.update();
        await primeOfflineCache();
      } catch {
        // Service worker is optional (e.g. unsupported browser context)
      }
    })();
  }, []);

  return null;
}
