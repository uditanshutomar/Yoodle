import { trackAIUsage } from "./tracker";

const AI_ACTION_MINUTES: Record<string, number> = {
  chat: 0.1,
  summarize: 0.5,
  "meeting-prep": 0.3,
  "workspace-action": 0.2,
};

/**
 * Track AI usage after an AI API call completes.
 * Call this at the end of AI route handlers with the action type.
 *
 * Rough estimates per action:
 * - chat: 0.1 minutes (6 seconds compute)
 * - summarize: 0.5 minutes
 * - meeting-prep: 0.3 minutes
 * - workspace-action: 0.2 minutes
 */
export async function trackAIRouteUsage(
  userId: string,
  action: "chat" | "summarize" | "meeting-prep" | "workspace-action",
): Promise<void> {
  const minutes = AI_ACTION_MINUTES[action];
  await trackAIUsage(userId, minutes);
}
