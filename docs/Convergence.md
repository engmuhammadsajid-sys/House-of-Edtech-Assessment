# Deterministic Convergence Proof

## Claim

Given an identical finite multiset of operations, all clients produce identical document content regardless of:

- Operation arrival order
- Online/offline interleaving
- WebSocket vs HTTP delivery path

## Algorithm

1. Union local + remote operations (dedupe by `id`)
2. Sort with deterministic comparator: Lamport → vector clock → userId → id
3. Replay through OT-style position transformation
4. Apply to empty base content

## Test Evidence

| Test file | Coverage |
|-----------|----------|
| `src/tests/unit/convergence.test.ts` | Permutation invariance, concurrent inserts, delete/insert, reconnect merge, 3-client interleaving |
| `src/tests/unit/conflict-resolution.test.ts` | Basic merge, deduplication |
| `src/tests/integration/sync-restore.test.ts` | Server push/pull with tenant scoping |

Run: `npm run test`

## Reconnect Convergence

On WebSocket reconnect (`use-presence` → `onReconnect`), `SyncEngine.reconcile()`:

1. Pushes pending local operations
2. Pulls all operations since last Lamport timestamp
3. Merges deterministically

## Known Limitations

| Limitation | Impact |
|------------|--------|
| Plain-text only | No rich-text CRDT guarantees |
| Simplified OT | Extreme concurrent overlapping deletes may diverge (not observed in test suite) |
| Empty base merge | Requires full operation history; restore clears op log intentionally |
| 500-op pull batch | Very large documents may need pagination for full convergence in one pull |

## Conclusion

For the tested operation sets and permutations, **all clients converge to identical state**. This is verified by permutation-invariance tests in `convergence.test.ts`.
