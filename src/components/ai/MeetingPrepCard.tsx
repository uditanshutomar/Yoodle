"use client";

import { motion } from "framer-motion";
import { Sparkles, CheckCircle, AlertCircle, Users } from "lucide-react";
import Card from "@/components/ui/Card";

interface MeetingPrepCardProps {
  meetingTitle: string;
  suggestions: string[];
  participants?: string[];
  keyTopics?: string[];
}

export default function MeetingPrepCard({
  meetingTitle,
  suggestions,
  participants,
  keyTopics,
}: MeetingPrepCardProps) {
  return (
    <Card className="!p-5 !border-[#FFE600] !shadow-[4px_4px_0_#FFE600]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-[#FFE600]" />
        <h3 className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
          Meeting Prep: {meetingTitle}
        </h3>
      </div>

      {keyTopics && keyTopics.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold text-[#0A0A0A]/50 uppercase mb-1" style={{ fontFamily: "var(--font-heading)" }}>Key Topics</p>
          <div className="flex flex-wrap gap-1">
            {keyTopics.map((topic) => (
              <span key={topic} className="px-2 py-0.5 text-[10px] font-bold bg-[#FFE600]/20 text-[#0A0A0A] rounded-full border border-[#FFE600]" style={{ fontFamily: "var(--font-body)" }}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {participants && participants.length > 0 && (
        <div className="mb-3">
          <p className="flex items-center gap-1 text-[10px] font-bold text-[#0A0A0A]/50 uppercase mb-1" style={{ fontFamily: "var(--font-heading)" }}>
            <Users size={10} /> Participants
          </p>
          <p className="text-xs text-[#0A0A0A]/60" style={{ fontFamily: "var(--font-body)" }}>
            {participants.join(", ")}
          </p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold text-[#0A0A0A]/50 uppercase mb-2" style={{ fontFamily: "var(--font-heading)" }}>Suggestions</p>
        <div className="space-y-1.5">
          {suggestions.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-2 text-xs"
            >
              {i < 2 ? (
                <AlertCircle size={12} className="text-[#F59E0B] shrink-0 mt-0.5" />
              ) : (
                <CheckCircle size={12} className="text-[#10B981] shrink-0 mt-0.5" />
              )}
              <span style={{ fontFamily: "var(--font-body)" }}>{s}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </Card>
  );
}
