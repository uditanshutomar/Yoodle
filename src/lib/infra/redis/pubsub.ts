import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import type { Redis } from "ioredis";

const log = createLogger("redis:pubsub");

type MessageHandler = (channel: string, message: string) => void;

/** Shared subscriber that multiplexes a single Redis connection across all SSE clients */
class SharedSubscriber {
  private subscriber: Redis | null = null;
  private listeners = new Map<string, Set<MessageHandler>>();
  private refCount = new Map<string, number>();
  /** Pending subscribe promises to prevent duplicate subscriptions under concurrency */
  private pendingSubscribes = new Map<string, Promise<void>>();

  private ensureSubscriber(): Redis {
    if (!this.subscriber) {
      this.subscriber = getRedisClient().duplicate();
      this.subscriber.on("message", (channel, message) => {
        const handlers = this.listeners.get(channel);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(channel, message);
            } catch (err) {
              log.error({ err, channel }, "Pub/sub handler error");
            }
          }
        }
      });
      this.subscriber.on("error", (err) => {
        log.error({ err }, "Shared subscriber error");
      });
    }
    return this.subscriber;
  }

  async subscribe(
    channel: string,
    handler: MessageHandler,
  ): Promise<() => Promise<void>> {
    const sub = this.ensureSubscriber();

    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
      this.refCount.set(channel, 0);
      // Guard against concurrent subscribe calls for the same channel
      if (!this.pendingSubscribes.has(channel)) {
        const p = sub.subscribe(channel).then(() => {
          this.pendingSubscribes.delete(channel);
        });
        this.pendingSubscribes.set(channel, p);
        await p;
      } else {
        await this.pendingSubscribes.get(channel);
      }
    }

    this.listeners.get(channel)!.add(handler);
    this.refCount.set(channel, (this.refCount.get(channel) || 0) + 1);

    // Return unsubscribe function
    return async () => {
      const handlers = this.listeners.get(channel);
      if (handlers) {
        handlers.delete(handler);
        const count = (this.refCount.get(channel) || 1) - 1;
        this.refCount.set(channel, count);

        if (count <= 0) {
          this.listeners.delete(channel);
          this.refCount.delete(channel);
          await sub.unsubscribe(channel).catch(() => {});
        }
      }
    };
  }
}

export const sharedSubscriber = new SharedSubscriber();
