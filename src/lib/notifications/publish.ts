import mongoose from "mongoose";
import Notification, {
  type NotificationType,
  type NotificationPriority,
  type NotificationSourceType,
} from "@/lib/infra/db/models/notification";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import connectDB from "@/lib/infra/db/client";

const log = createLogger("notifications:publish");

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  priority?: NotificationPriority;
}

/**
 * Create a notification in MongoDB and publish to Redis for real-time delivery.
 * Safe to call from any API route — catches and logs errors instead of throwing.
 */
export async function publishNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await connectDB();
    const notification = await Notification.create({
      userId: new mongoose.Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      body: input.body,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      priority: input.priority || "normal",
    });

    try {
      const redis = getRedisClient();
      await redis.publish(
        `notifications:${input.userId}`,
        JSON.stringify({
          type: "notification",
          data: {
            id: notification._id.toString(),
            type: notification.type,
            title: notification.title,
            body: notification.body,
            sourceType: notification.sourceType,
            sourceId: notification.sourceId,
            priority: notification.priority,
            read: false,
            createdAt: notification.createdAt,
          },
        }),
      );
    } catch (err) {
      log.warn({ err, userId: input.userId }, "Redis publish failed for notification (saved to DB)");
    }
  } catch (err) {
    log.error({ err, userId: input.userId, type: input.type }, "Failed to create notification");
  }
}

export async function publishNotificationToMany(
  userIds: string[],
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  await Promise.allSettled(
    userIds.map((userId) => publishNotification({ ...input, userId })),
  );
}
