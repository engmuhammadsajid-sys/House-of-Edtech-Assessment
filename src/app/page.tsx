import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Local-First Collaborative Editor
        </h1>
        <p className="text-lg text-foreground/70">
          Edit documents offline. Sync when connected. Deterministic conflict resolution
          with operation-based CRDTs. Real-time collaboration with presence and cursors.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/register">Get Started</Link>
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-8 text-sm text-foreground/60">
          <div>
            <p className="font-semibold text-foreground">Offline-First</p>
            <p>IndexedDB persistence</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">CRDT Sync</p>
            <p>Lamport + vector clocks</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Version Control</p>
            <p>Git-like history</p>
          </div>
        </div>
      </div>
    </main>
  );
}
