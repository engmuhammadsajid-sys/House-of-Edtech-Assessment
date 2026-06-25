import { create } from "zustand";
import type { PresenceUser, SyncQueueItem } from "@/types/operation";
import type { SyncState } from "@/lib/sync/sync-engine";

interface EditorStore {
  content: string;
  documentId: string | null;
  title: string;
  syncStatus: SyncState;
  isOnline: boolean;
  queue: SyncQueueItem[];
  presence: PresenceUser[];
  conflictCount: number;
  setContent: (content: string) => void;
  setDocument: (id: string, title: string, content: string) => void;
  setSyncStatus: (status: SyncState) => void;
  setOnline: (online: boolean) => void;
  setQueue: (queue: SyncQueueItem[]) => void;
  setPresence: (presence: PresenceUser[]) => void;
  setConflictCount: (count: number) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  content: "",
  documentId: null,
  title: "",
  syncStatus: "idle",
  isOnline: true,
  queue: [],
  presence: [],
  conflictCount: 0,
  setContent: (content) => set({ content }),
  setDocument: (id, title, content) => set({ documentId: id, title, content }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setOnline: (isOnline) => set({ isOnline }),
  setQueue: (queue) => set({ queue }),
  setPresence: (presence) => set({ presence }),
  setConflictCount: (conflictCount) => set({ conflictCount }),
  reset: () =>
    set({
      content: "",
      documentId: null,
      title: "",
      syncStatus: "idle",
      queue: [],
      presence: [],
      conflictCount: 0,
    }),
}));

interface ThemeStore {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: "system",
  setTheme: (theme) => set({ theme }),
}));
