import type { Server } from "socket.io";

/** Attach Socket.io Redis adapter when REDIS_URL is set (horizontal scaling). */
export async function attachRedisAdapter(io: Server): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;

  const { createAdapter } = await import("@socket.io/redis-adapter");
  const { createClient } = await import("redis");

  const pub = createClient({ url });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
}
