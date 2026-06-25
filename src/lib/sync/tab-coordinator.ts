/** Multi-tab coordination via BroadcastChannel + localStorage leader election. */

export type TabMessage =
  | { type: "local-ops"; ops: unknown[] }
  | { type: "leader-ping"; tabId: string }
  | { type: "content-sync"; content: string };

const LEADER_STALE_MS = 4000;
const LEADER_HEARTBEAT_MS = 1500;

export class TabCoordinator {
  private channel: BroadcastChannel;
  private tabId: string;
  private isLeader = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lockKey: string;

  constructor(
    private documentId: string,
    private onLeadership: (isLeader: boolean) => void,
    private onMessage: (msg: TabMessage) => void
  ) {
    this.tabId = crypto.randomUUID();
    this.lockKey = `collab-leader-${documentId}`;
    this.channel = new BroadcastChannel(`collab-tab-${documentId}`);
    this.channel.onmessage = (event: MessageEvent<TabMessage>) => {
      this.onMessage(event.data);
    };
    this.tryClaimLeadership();
    this.heartbeatTimer = setInterval(() => this.tryClaimLeadership(), LEADER_HEARTBEAT_MS);
  }

  private tryClaimLeadership(): void {
    const currentLeader = localStorage.getItem(this.lockKey);
    const ts = Number(localStorage.getItem(`${this.lockKey}-ts`) ?? 0);
    const stale = Date.now() - ts > LEADER_STALE_MS;

    if (!currentLeader || currentLeader === this.tabId || stale) {
      localStorage.setItem(this.lockKey, this.tabId);
      localStorage.setItem(`${this.lockKey}-ts`, String(Date.now()));
      if (!this.isLeader) {
        this.isLeader = true;
        this.onLeadership(true);
      }
      this.channel.postMessage({ type: "leader-ping", tabId: this.tabId });
      return;
    }

    if (this.isLeader && currentLeader !== this.tabId) {
      this.isLeader = false;
      this.onLeadership(false);
    }
  }

  getIsLeader(): boolean {
    return this.isLeader;
  }

  broadcast(msg: TabMessage): void {
    this.channel.postMessage(msg);
  }

  destroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.isLeader) {
      localStorage.removeItem(this.lockKey);
      localStorage.removeItem(`${this.lockKey}-ts`);
    }
    this.channel.close();
  }
}
