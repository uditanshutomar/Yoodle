import { createLogger } from "@/lib/infra/logger";
import connectDB from "@/lib/infra/db/client";

const log = createLogger("knowledge-builder");

/**
 * Build/update the knowledge graph from a meeting's MoM.
 * Extracts decisions, action items, and participant expertise nodes.
 */
export async function updateKnowledgeGraph(
  userId: string,
  meetingId: string,
): Promise<void> {
  await connectDB();

  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
  const MeetingKnowledge = (await import("@/lib/infra/db/models/meeting-knowledge")).default;

  const meeting = await Meeting.findById(meetingId)
    .populate("participants.userId", "displayName name")
    .lean();
  if (!meeting) {
    log.warn({ meetingId }, "Meeting not found");
    return;
  }

  if (!meeting.mom) {
    log.warn({ meetingId }, "Meeting has no MoM — skipping knowledge build");
    return;
  }

  const mom = meeting.mom;
  const meetingDate = meeting.scheduledAt || meeting.createdAt || new Date();
  const meetingTitle = meeting.title;
  const participantNames = (meeting.participants || []).map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = p.userId as any;
    if (user && typeof user === "object") {
      return user.displayName || user.name || user._id?.toString() || "unknown";
    }
    return user?.toString() ?? "unknown";
  });

  const baseEntry = {
    meetingId: String(meeting._id),
    meetingTitle,
    date: meetingDate,
    participants: participantNames,
  };

  // Extract topic keys from summary and discussion points
  const topicSentences = [
    ...(mom.summary ? mom.summary.split(".").filter((s) => s.trim()) : []),
    ...(mom.discussionPoints || []),
  ];
  const topicKeys = topicSentences.map((sentence) =>
    sentence
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(" ")
      .toLowerCase(),
  ).filter((k) => k.length > 0);

  // Upsert decisions
  for (const decision of mom.keyDecisions || []) {
    const key = decision
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join(" ")
      .toLowerCase();

    if (!key) continue;

    try {
      await MeetingKnowledge.updateOne(
        { userId, nodeType: "decision", key },
        {
          $push: { entries: { ...baseEntry, content: decision } },
          $addToSet: { relatedKeys: { $each: topicKeys.slice(0, 5) } },
          $set: { lastUpdated: new Date() },
        },
        { upsert: true },
      );
    } catch (err) {
      log.error({ err, key }, "Failed to upsert decision node");
    }
  }

  // Upsert action items
  for (const actionItem of mom.actionItems || []) {
    const key = actionItem.task
      .toLowerCase()
      .trim()
      .slice(0, 50);

    if (!key) continue;

    const content = `${actionItem.task} (owner: ${actionItem.owner || "unassigned"}, due: ${actionItem.due || "TBD"})`;

    try {
      await MeetingKnowledge.updateOne(
        { userId, nodeType: "action_evolution", key },
        {
          $push: { entries: { ...baseEntry, content } },
          $addToSet: { relatedKeys: { $each: topicKeys.slice(0, 5) } },
          $set: { lastUpdated: new Date() },
        },
        { upsert: true },
      );
    } catch (err) {
      log.error({ err, key }, "Failed to upsert action_evolution node");
    }
  }

  // Upsert person expertise for participants involved in decisions
  if ((mom.keyDecisions || []).length > 0) {
    for (const participantName of participantNames) {
      const key = participantName.toLowerCase().trim();
      if (!key) continue;

      const decisionSummary = (mom.keyDecisions || []).join("; ");
      const content = `Involved in decisions: ${decisionSummary}`;

      try {
        await MeetingKnowledge.updateOne(
          { userId, nodeType: "person_expertise", key },
          {
            $push: { entries: { ...baseEntry, content } },
            $addToSet: { relatedKeys: { $each: topicKeys.slice(0, 5) } },
            $set: { lastUpdated: new Date() },
          },
          { upsert: true },
        );
      } catch (err) {
        log.error({ err, key }, "Failed to upsert person_expertise node");
      }
    }
  }

  log.info(
    {
      meetingId,
      decisions: (mom.keyDecisions || []).length,
      actions: (mom.actionItems || []).length,
      participants: participantNames.length,
    },
    "Knowledge graph updated",
  );
}
