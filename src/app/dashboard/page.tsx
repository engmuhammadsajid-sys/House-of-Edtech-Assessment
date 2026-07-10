"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useState } from "react";
import { Plus, FileText, LogOut, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { LocalDocumentRepository } from "@/lib/db/local-document-repository";
import { DocumentWorkspace } from "@/features/documents/document-workspace";
import type { DocumentState } from "@/types/operation";

interface ApiDocument {
  id: string;
  title: string;
  updatedAt: string;
  owner: { name: string | null };
  role?: "OWNER" | "EDITOR" | "VIEWER";
}

interface DashboardDocument {
  id: string;
  title: string;
  updatedAt: number;
  ownerName: string;
  role: "OWNER" | "EDITOR" | "VIEWER" | "Member";
  cachedLocally: boolean;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const localDocRepo = useRef(new LocalDocumentRepository());
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [localDocs, setLocalDocs] = useState<DocumentState[]>([]);
  const [localReady, setLocalReady] = useState(false);
  const [offlineDocId, setOfflineDocId] = useState<string | null>(null);

  const openOfflineDocument = (id: string) => {
    setOfflineDocId(id);
    window.history.pushState({ offlineDocument: id }, "", `/documents/${id}`);
  };

  const closeOfflineDocument = () => {
    if (window.location.pathname.startsWith("/documents/")) {
      window.history.back();
      return;
    }
    setOfflineDocId(null);
  };

  useEffect(() => {
    const syncOfflineRoute = () => {
      const pendingId = sessionStorage.getItem("offline-document-id");
      if (pendingId && !navigator.onLine) {
        sessionStorage.removeItem("offline-document-id");
        window.history.replaceState({ offlineDocument: pendingId }, "", `/documents/${pendingId}`);
        setOfflineDocId(pendingId);
        return;
      }

      const match = window.location.pathname.match(/^\/documents\/([^/]+)$/);
      if (match && !navigator.onLine) {
        setOfflineDocId(match[1] ?? null);
        return;
      }
      setOfflineDocId(null);
    };

    syncOfflineRoute();
    window.addEventListener("popstate", syncOfflineRoute);
    return () => window.removeEventListener("popstate", syncOfflineRoute);
  }, []);

  useEffect(() => {
    if (!isOnline || !offlineDocId) return;
    router.replace(`/documents/${offlineDocId}`);
  }, [isOnline, offlineDocId, router]);

  useEffect(() => {
    void (async () => {
      const docs = await localDocRepo.current.getAll();
      setLocalDocs(docs);
      setLocalReady(true);
    })();
  }, []);

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: isOnline,
    retry: false,
  });

  useEffect(() => {
    if (!data?.documents) return;
    void (async () => {
      for (const doc of data.documents as ApiDocument[]) {
        const existing = await localDocRepo.current.getById(doc.id);
        await localDocRepo.current.save({
          id: doc.id,
          title: doc.title,
          content: existing?.content ?? "",
          updatedAt: new Date(doc.updatedAt).getTime(),
          version: existing?.version ?? 1,
          role: doc.role ?? existing?.role ?? "VIEWER",
        });
      }
      const docs = await localDocRepo.current.getAll();
      setLocalDocs(docs);
    })();
  }, [data]);

  useEffect(() => {
    if (!isOnline || !data?.documents) return;
    void fetch("/dashboard", { credentials: "include" });
    for (const doc of data.documents as ApiDocument[]) {
      router.prefetch(`/documents/${doc.id}`);
      void fetch(`/documents/${doc.id}`, { credentials: "include" });
    }
  }, [data, isOnline, router]);

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setNewTitle("");
      setShowCreate(false);
      if (result?.document?.id) {
        router.push(`/documents/${result.document.id}`);
      }
    },
  });

  const apiDocuments: ApiDocument[] = data?.documents ?? [];
  const localById = new Map(localDocs.map((doc) => [doc.id, doc]));

  const documents: DashboardDocument[] = isOnline
    ? apiDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        updatedAt: new Date(doc.updatedAt).getTime(),
        ownerName: doc.owner.name ?? "Unknown",
        role: doc.role ?? "VIEWER",
        cachedLocally: localById.has(doc.id),
      }))
    : localDocs
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((doc) => ({
          id: doc.id,
          title: doc.title,
          updatedAt: doc.updatedAt,
          ownerName: session?.user?.name ?? session?.user?.email ?? "You",
          role: doc.role ?? "Member",
          cachedLocally: true,
        }));

  const listLoading = isOnline ? isLoading : !localReady;
  const showEmpty = !listLoading && documents.length === 0;

  if (offlineDocId) {
    return (
      <DocumentWorkspace
        documentId={offlineDocId}
        onBack={closeOfflineDocument}
      />
    );
  }

  return (
    <div className="flex-1">
      <header className="border-b border-foreground/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Documents</h1>
          {!isOnline && (
            <Badge variant="warning">
              <WifiOff className="h-3 w-3 mr-1" /> Offline
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-sm text-foreground/60 hover:text-foreground">
            Settings
          </Link>
          <span className="text-sm text-foreground/60">{session?.user?.email}</span>
          <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-foreground/60">
            {isOnline
              ? "All documents — access is role-based (Viewer / Editor / Owner)"
              : "Cached documents available offline"}
          </p>
          {isOnline && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Document
            </Button>
          )}
        </div>

        {!isOnline && isFetched && (
          <p className="text-sm text-foreground/50 mb-4">
            Only documents opened while online are cached locally.
          </p>
        )}

        {showCreate && isOnline && (
          <Card className="mb-6">
            <CardContent className="pt-6 flex gap-2">
              <Input
                placeholder="Document title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newTitle && createMutation.mutate(newTitle)}
              />
              <Button onClick={() => newTitle && createMutation.mutate(newTitle)} disabled={createMutation.isPending}>
                Create
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </CardContent>
          </Card>
        )}

        {listLoading ? (
          <p className="text-foreground/60">Loading...</p>
        ) : showEmpty ? (
          <Card>
            <CardContent className="py-12 text-center text-foreground/60">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {isOnline
                  ? "No documents yet. Create one to start collaborating."
                  : "No cached documents. Open documents while online first."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {documents.map((doc) =>
              isOnline ? (
                <Link key={doc.id} href={`/documents/${doc.id}`} prefetch>
                  <Card className="hover:bg-foreground/5 transition-colors cursor-pointer">
                    <CardHeader className="py-4">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{doc.title}</CardTitle>
                        <Badge variant={doc.role === "VIEWER" ? "warning" : "default"}>
                          {doc.role}
                        </Badge>
                      </div>
                      <p className="text-xs text-foreground/50">
                        {doc.ownerName} · Updated {new Date(doc.updatedAt).toLocaleDateString()}
                      </p>
                    </CardHeader>
                  </Card>
                </Link>
              ) : (
                <Card
                  key={doc.id}
                  className="hover:bg-foreground/5 transition-colors cursor-pointer"
                  onClick={() => openOfflineDocument(doc.id)}
                >
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{doc.title}</CardTitle>
                      <Badge variant="warning">{doc.role}</Badge>
                    </div>
                    <p className="text-xs text-foreground/50">
                      {doc.ownerName} · Updated {new Date(doc.updatedAt).toLocaleDateString()}
                      {doc.cachedLocally && " · Cached"}
                    </p>
                  </CardHeader>
                </Card>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
