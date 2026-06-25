import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TabCoordinator } from "@/lib/sync/tab-coordinator";

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public name: string) {
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: unknown) {
    const peers = MockBroadcastChannel.channels.get(this.name);
    peers?.forEach((peer) => {
      if (peer !== this && peer.onmessage) {
        peer.onmessage({ data } as MessageEvent);
      }
    });
  }

  close() {
    MockBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  static reset() {
    MockBroadcastChannel.channels.clear();
  }
}

describe("TabCoordinator", () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    localStorage.clear();
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("elects first tab as leader", () => {
    const onLeadership = vi.fn();
    const coordinator = new TabCoordinator("doc-1", onLeadership, vi.fn());

    expect(onLeadership).toHaveBeenCalledWith(true);
    expect(coordinator.getIsLeader()).toBe(true);
    coordinator.destroy();
  });

  it("second tab is not leader while first holds lock", () => {
    const firstLeader = vi.fn();
    const first = new TabCoordinator("doc-1", firstLeader, vi.fn());
    expect(first.getIsLeader()).toBe(true);

    const secondLeader = vi.fn();
    const second = new TabCoordinator("doc-1", secondLeader, vi.fn());
    expect(second.getIsLeader()).toBe(false);

    first.destroy();
    second.destroy();
  });

  it("broadcasts local-ops to follower tabs", () => {
    const first = new TabCoordinator("doc-1", vi.fn(), vi.fn());
    const onMessage = vi.fn();
    const second = new TabCoordinator("doc-1", vi.fn(), onMessage);

    first.broadcast({ type: "local-ops", ops: [{ id: "op-1" }] });

    expect(onMessage).toHaveBeenCalledWith({
      type: "local-ops",
      ops: [{ id: "op-1" }],
    });

    first.destroy();
    second.destroy();
  });
});
