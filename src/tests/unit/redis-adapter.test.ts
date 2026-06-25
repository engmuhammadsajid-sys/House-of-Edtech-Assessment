/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "socket.io";

const mockConnect = vi.fn();
const mockDuplicate = vi.fn();
const mockCreateClient = vi.fn();
const mockCreateAdapter = vi.fn();

vi.mock("redis", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@socket.io/redis-adapter", () => ({
  createAdapter: (...args: unknown[]) => mockCreateAdapter(...args),
}));

import { attachRedisAdapter } from "@/server/realtime/redis-adapter";

describe("attachRedisAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
    const client = { connect: mockConnect, duplicate: mockDuplicate };
    mockDuplicate.mockReturnValue(client);
    mockCreateClient.mockReturnValue(client);
    mockConnect.mockResolvedValue(undefined);
    mockCreateAdapter.mockReturnValue({});
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("is a no-op when REDIS_URL is unset", async () => {
    const io = { adapter: vi.fn() } as unknown as Server;
    await attachRedisAdapter(io);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(io.adapter).not.toHaveBeenCalled();
  });

  it("attaches Redis adapter when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const io = { adapter: vi.fn() } as unknown as Server;

    await attachRedisAdapter(io);

    expect(mockCreateClient).toHaveBeenCalledWith({ url: "redis://localhost:6379" });
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(mockCreateAdapter).toHaveBeenCalled();
    expect(io.adapter).toHaveBeenCalled();
  });
});
