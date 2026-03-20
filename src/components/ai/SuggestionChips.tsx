"use client";

import { usePageContext, type PageContext } from "@/hooks/usePageContext";

interface ChipConfig {
  label: string;
  prompt: string;
}

const CHIP_MAP: Record<PageContext, ChipConfig[]> = {
  dashboard: [
    { label: "Draft standup", prompt: "Draft my standup update for today" },
    { label: "What's overdue?", prompt: "Show me all my overdue tasks" },
    {
      label: "Prep for next meeting",
      prompt: "Prepare me for my next upcoming meeting",
    },
    {
      label: "Summarize yesterday",
      prompt: "Summarize what happened yesterday",
    },
  ],
  meeting: [
    { label: "Summarize meeting", prompt: "Summarize this meeting" },
    {
      label: "Create action items",
      prompt: "Create action items from this meeting",
    },
    {
      label: "Draft follow-up",
      prompt: "Draft a follow-up message for this meeting",
    },
  ],
  board: [
    {
      label: "What should I do next?",
      prompt: "What should I work on next based on my tasks?",
    },
    {
      label: "Stale task check",
      prompt: "Which of my tasks haven't been updated recently?",
    },
    {
      label: "Sprint progress",
      prompt: "Summarize sprint progress for my board",
    },
  ],
  messages: [
    {
      label: "Summarize thread",
      prompt: "Summarize this conversation thread",
    },
    {
      label: "Draft a reply",
      prompt: "Help me draft a reply to this conversation",
    },
    {
      label: "Find related tasks",
      prompt: "Find tasks related to this conversation",
    },
  ],
  settings: [
    {
      label: "What can you do?",
      prompt: "What are all the things you can help me with?",
    },
  ],
  unknown: [
    { label: "Summarize my day", prompt: "Summarize my day" },
    { label: "What's pending?", prompt: "What tasks are pending for me?" },
  ],
};

function getMondayChips(): ChipConfig[] {
  const now = new Date();
  if (now.getDay() === 1 && now.getHours() < 12) {
    return [
      {
        label: "Weekly plan",
        prompt: "Help me plan my week based on my tasks and meetings",
      },
      {
        label: "This week's meetings",
        prompt: "What meetings do I have this week?",
      },
    ];
  }
  return [];
}

interface SuggestionChipsProps {
  onSelect: (prompt: string) => void;
  maxChips?: number;
}

export default function SuggestionChips({
  onSelect,
  maxChips = 4,
}: SuggestionChipsProps) {
  const { context } = usePageContext();

  const mondayChips = getMondayChips();
  const contextChips = CHIP_MAP[context] || CHIP_MAP.unknown;
  const chips = [...mondayChips, ...contextChips].slice(0, maxChips);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onSelect(chip.prompt)}
          className="shrink-0 text-[10px] font-medium px-2.5 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[#FFE600] hover:bg-[#FFE600]/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-body"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
