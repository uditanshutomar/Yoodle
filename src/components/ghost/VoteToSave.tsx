"use client";

import { motion } from "framer-motion";
import { Save, Check, Users } from "lucide-react";
import Button from "@/components/ui/Button";

interface VoteToSaveProps {
  roomId: string;
  totalParticipants: number;
  totalVotes: number;
  hasVoted: boolean;
  onVote: () => void;
}

export default function VoteToSave({
  totalParticipants,
  totalVotes,
  hasVoted,
  onVote,
}: VoteToSaveProps) {
  const percentage = totalParticipants > 0 ? Math.round((totalVotes / totalParticipants) * 100) : 0;
  const allVoted = totalVotes === totalParticipants && totalParticipants > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[var(--surface)] border-2 border-[#7C3AED] rounded-2xl shadow-[4px_4px_0_#7C3AED] p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Save size={18} className="text-[#7C3AED]" />
        <h3 className="text-base font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          Vote to Save
        </h3>
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-4" style={{ fontFamily: "var(--font-body)" }}>
        All participants must unanimously vote to save this ghost room&apos;s data. Otherwise, everything vanishes.
      </p>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="flex items-center gap-1 text-[var(--text-secondary)]">
            <Users size={12} /> {totalVotes} of {totalParticipants}
          </span>
          <span className="font-bold text-[#7C3AED]">{percentage}%</span>
        </div>
        <div className="h-3 bg-[var(--surface-hover)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#7C3AED] to-[#9333EA] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {allVoted ? (
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="flex items-center justify-center gap-2 py-3 bg-green-50 border-2 border-green-500 rounded-xl"
        >
          <Check size={18} className="text-green-600" />
          <span className="text-sm font-bold text-green-700" style={{ fontFamily: "var(--font-heading)" }}>
            Unanimous! Data saved ✨
          </span>
        </motion.div>
      ) : (
        <Button
          variant={hasVoted ? "secondary" : "primary"}
          size="md"
          icon={hasVoted ? Check : Save}
          onClick={onVote}
          disabled={hasVoted}
          className={`w-full ${hasVoted ? "" : "!bg-[#7C3AED] !text-white !border-[var(--border-strong)] !shadow-[var(--shadow-card)]"}`}
        >
          {hasVoted ? "You voted ✓" : "Vote to Save"}
        </Button>
      )}
    </motion.div>
  );
}
