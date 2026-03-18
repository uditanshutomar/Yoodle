"use client";

import type { CardData } from "./types";
import TaskCard from "./TaskCard";
import MeetingCard from "./MeetingCard";
import PersonCard from "./PersonCard";
import DataSummaryCard from "./DataSummaryCard";
import DraftCard from "./DraftCard";
import DiffPreviewCard from "./DiffPreviewCard";
import WorkflowProgressCard from "./WorkflowProgressCard";
import BatchActionCard from "./BatchActionCard";
import MeetingBriefCard from "./MeetingBriefCard";
import MeetingAnalyticsCard from "./MeetingAnalyticsCard";
import MeetingCascadeCard from "./MeetingCascadeCard";

interface CardRendererProps {
  cards: CardData[];
  onAction?: (actionType: string, args: Record<string, unknown>) => void;
}

export default function CardRenderer({ cards, onAction }: CardRendererProps) {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-1.5">
      {cards.map((card, i) => {
        const key = `card-${i}-${card.type}`;
        switch (card.type) {
          case "task":
            return <TaskCard key={key} data={card} />;
          case "task_list":
            return (
              <div key={key} className="flex flex-col gap-1.5">
                {card.title && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] px-1" style={{ fontFamily: "var(--font-heading)" }}>
                    {card.title}
                  </p>
                )}
                {card.tasks.map((t, j) => (
                  <TaskCard key={`${key}-task-${j}`} data={t} compact />
                ))}
              </div>
            );
          case "meeting":
            return <MeetingCard key={key} data={card} />;
          case "person":
            return <PersonCard key={key} data={card} />;
          case "data_summary":
            return <DataSummaryCard key={key} data={card} />;
          case "draft":
            return (
              <DraftCard
                key={key}
                data={card}
                onSend={(actionType, args) => onAction?.(actionType, args)}
              />
            );
          case "diff_preview":
            return (
              <DiffPreviewCard
                key={key}
                data={card}
                onConfirm={(actionType, args) => onAction?.(actionType, args)}
              />
            );
          case "workflow_progress":
            return <WorkflowProgressCard key={key} data={card} />;
          case "batch_action":
            return (
              <BatchActionCard
                key={key}
                data={card}
                onConfirm={(ids, actionType, items) =>
                  onAction?.("batch_confirm", { actionType, items: items.map((i) => ({ id: i.id, args: i.args })) })
                }
              />
            );
          case "meeting_brief":
            return <MeetingBriefCard key={key} data={card} />;
          case "meeting_analytics":
            return <MeetingAnalyticsCard key={key} data={card} />;
          case "meeting_cascade":
            return (
              <MeetingCascadeCard
                key={key}
                data={card}
                onUndo={(token) => onAction?.("undo_cascade_action", { undoToken: token })}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
