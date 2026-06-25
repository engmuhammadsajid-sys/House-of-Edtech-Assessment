# Conflict Resolution

## Problem

When two users edit the same document concurrently (especially offline), their changes must merge into a single consistent state without data loss. Last-write-wins fails because it silently discards one user's edits.

## Solution: Operation-Based Deterministic Merge

Every edit is decomposed into atomic **operations** (INSERT or DELETE). Operations are ordered deterministically and replayed to reconstruct document content.

## Operation Model

```typescript
{
  id: string;           // Unique operation ID
  documentId: string;
  userId: string;
  type: "INSERT" | "DELETE";
  position: number;     // Character position
  content: string;      // Text to insert (INSERT only)
  length: number;       // Characters to delete (DELETE only)
  timestamp: number;    // Wall clock time
  lamportTime: number;  // Logical clock
  vectorClock: Record<string, number>;  // Per-user counters
  clientId: string;     // Idempotency key
}
```

## Ordering Algorithm

Operations are sorted using a deterministic comparator:

```
1. Lamport timestamp (ascending)
2. Vector clock comparison (causal ordering)
3. User ID (lexicographic)
4. Operation ID (lexicographic)
```

This guarantees that given the same set of operations, every client produces the same ordering regardless of arrival order.

## Vector Clocks

Each user maintains a counter in the vector clock. When user A creates an operation:
```
vectorClock[A] += 1
lamportTime = max(localLamport, allSeenLamports) + 1
```

When receiving remote operations:
```
vectorClock = merge(localClock, remoteClock)  // max per user
```

### Causal Ordering
- If `clockA < clockB` (all entries in A ≤ B, at least one strictly less): A happened-before B
- If concurrent: neither happened-before the other → use Lamport + tie-breakers

## Position Transformation

When concurrent operations affect the same region, positions must be transformed:

### INSERT vs INSERT at same position
The operation with lower priority (by comparator) gets applied first, shifting the other's position right.

### DELETE vs INSERT
A delete before position P shifts insert positions at or after P.

### DELETE vs DELETE at overlapping range
Both deletes are applied; ranges are adjusted based on ordering.

## Merge Process

```
function merge(baseContent, operations):
  sorted = sort(operations, deterministicComparator)
  content = baseContent
  applied = []

  for op in sorted:
    for prior in applied:
      op = transform(op, prior)
    content = apply(content, op)
    applied.push(op)

  return content
```

## Example: Concurrent Inserts

User A (offline): INSERT "Hello" at position 0
User B (offline): INSERT "World" at position 0

After sync, both clients sort operations:
- If A's Lamport < B's Lamport: "HelloWorld"
- If B's Lamport < A's Lamport: "WorldHello"

**Both clients agree** because they use the same comparator.

## Properties

| Property | Guarantee |
|----------|-----------|
| Deterministic | Same ops → same content |
| No data loss | All operations preserved |
| No LWW | No operation silently dropped |
| Idempotent | Duplicate ops (by clientId) ignored |
| Commutative* | Order determined by comparator, not arrival |

*Operations are not mathematically commutative, but the total order makes them appear so.

## Why Not a Full Text CRDT?

Full CRDTs (e.g., RGA, LSEQ) provide stronger convergence guarantees for rich text with formatting. For a text editor MVP, operation-based sync with OT-style position transformation provides:
- Simpler implementation
- Easier debugging (operation log is human-readable)
- Sufficient correctness for plain text
- Clear upgrade path to RGA/LSEQ for rich text

## Testing

Unit tests verify:
- Deterministic merge regardless of operation arrival order
- No data loss with concurrent inserts
- Correct position transformation
- Operation deduplication

See `src/tests/unit/conflict-resolution.test.ts`.
