"use client";

import { motion } from "framer-motion";
import { Sparkles, FileText, CheckSquare, Brain, Calendar } from "lucide-react";

interface QuickActionsProps {
  onAction: (prompt: string) => void;
}

const actions = [
  {
    icon: Sparkles,
    label: "Meeting Prep",
    prompt: "Help me prepare for my next meeting. What should I know and what questions should I ask?",
    color: "#FFE600",
  },
  {
    icon: FileText,
    label: "Summarize Notes",
    prompt: "Summarize my recent meeting notes and highlight the key takeaways.",
    color: "#7C3AED",
  },
  {
    icon: CheckSquare,
    label: "Extract Tasks",
    prompt: "Extract action items and tasks from my recent meetings.",
    color: "#06B6D4",
  },
  {
    icon: Brain,
    label: "Brainstorm",
    prompt: "Let's brainstorm ideas for improving our team's productivity and meeting efficiency.",
    color: "#10B981",
  },
  {
    icon: Calendar,
    label: "Schedule",
    prompt: "Help me plan my schedule for the week and suggest optimal meeting times.",
    color: "#F59E0B",
  },
];

export default function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="space-y-3">
      <h3
        className="text-sm font-bold text-[#0A0A0A]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Quick Actions
      </h3>
      <div className="space-y-2">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAction(action.prompt)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm rounded-xl border-2 border-[#0A0A0A]/10 hover:border-[#0A0A0A]/20 bg-white transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-[#0A0A0A]"
                style={{ backgroundColor: action.color }}
              >
                <Icon size={14} className="text-[#0A0A0A]" />
              </div>
              <span className="font-bold text-[#0A0A0A]">{action.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
