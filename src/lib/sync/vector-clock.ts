import type { VectorClock } from "@/types/operation";

/** Increment local user's vector clock entry. */
export function incrementClock(clock: VectorClock, userId: string): VectorClock {
  return { ...clock, [userId]: (clock[userId] ?? 0) + 1 };
}

/** Merge two vector clocks by taking max per user. */
export function mergeClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: VectorClock = { ...a };
  for (const [userId, count] of Object.entries(b)) {
    merged[userId] = Math.max(merged[userId] ?? 0, count);
  }
  return merged;
}

/**
 * Compare vector clocks for causal ordering.
 * Returns -1 if a happened-before b, 1 if b happened-before a, 0 if concurrent.
 */
export function compareVectorClocks(a: VectorClock, b: VectorClock): -1 | 0 | 1 {
  let aGreater = false;
  let bGreater = false;

  const allUsers = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const userId of allUsers) {
    const aVal = a[userId] ?? 0;
    const bVal = b[userId] ?? 0;
    if (aVal > bVal) aGreater = true;
    if (bVal > aVal) bGreater = true;
  }

  if (aGreater && !bGreater) return 1;
  if (bGreater && !aGreater) return -1;
  return 0;
}

/** Compute next Lamport timestamp after observing remote operations. */
export function nextLamportTime(localLamport: number, remoteLamports: number[]): number {
  const maxRemote = remoteLamports.length > 0 ? Math.max(...remoteLamports) : 0;
  return Math.max(localLamport, maxRemote) + 1;
}
