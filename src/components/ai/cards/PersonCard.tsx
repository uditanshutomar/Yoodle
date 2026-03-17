"use client";

import { User, MessageSquare } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { PersonCardData } from "./types";

interface PersonCardProps {
  data: PersonCardData;
  onMessage?: (personId: string) => void;
}

export default function PersonCard({ data, onMessage }: PersonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2.5"
    >
      {data.avatar ? (
        <Image
          src={data.avatar}
          alt={data.name}
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFE600]/15 text-[#FFE600]">
          <User size={14} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-medium leading-snug text-[var(--text-primary)] truncate"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {data.name}
        </p>
        {data.role && (
          <p className="text-[10px] text-[var(--text-muted)] truncate">
            {data.role}
          </p>
        )}
      </div>

      {data.status && (
        <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border bg-[#FFE600]/15 text-[#B8A200] border-[#FFE600]/30">
          {data.status}
        </span>
      )}

      <button
        onClick={() => onMessage?.(data.id)}
        className="shrink-0 flex items-center gap-1 rounded-lg bg-[var(--surface-hover)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[#FFE600] transition-colors"
      >
        <MessageSquare size={10} />
        Message
      </button>
    </motion.div>
  );
}
