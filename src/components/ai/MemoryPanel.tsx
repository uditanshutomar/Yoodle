"use client";

import { motion } from "framer-motion";
import { Brain, Tag, Zap } from "lucide-react";

interface Memory {
  _id: string;
  category: string;
  content: string;
  source: string;
  confidence: number;
  createdAt: string;
}

interface MemoryPanelProps {
  memories: Memory[];
}

const categoryColors: Record<string, string> = {
  preference: "#FFE600",
  context: "#06B6D4",
  habit: "#7C3AED",
  fact: "#10B981",
};

export default function MemoryPanel({ memories }: MemoryPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Brain size={16} className="text-[#7C3AED]" />
        <h3 className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
          Memory Bank
        </h3>
        <span className="text-[10px] text-[#0A0A0A]/40 ml-auto" style={{ fontFamily: "var(--font-body)" }}>
          {memories.length} memories
        </span>
      </div>

      {memories.length === 0 ? (
        <p className="text-sm text-[#0A0A0A]/40 text-center py-6" style={{ fontFamily: "var(--font-body)" }}>
          No memories stored yet. Chat with Doodle Poodle to build context!
        </p>
      ) : (
        <div className="space-y-2">
          {memories.map((memory, i) => (
            <motion.div
              key={memory._id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="px-3 py-2.5 rounded-xl border-2 border-[#0A0A0A]/5 bg-white"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-full"
                  style={{
                    backgroundColor: `${categoryColors[memory.category] || "#0A0A0A"}15`,
                    color: categoryColors[memory.category] || "#0A0A0A",
                    fontFamily: "var(--font-heading)",
                  }}
                >
                  <Tag size={8} />
                  {memory.category}
                </span>
                <span className="flex items-center gap-0.5 text-[9px] text-[#0A0A0A]/30">
                  <Zap size={8} />
                  {Math.round(memory.confidence * 100)}%
                </span>
              </div>
              <p className="text-xs text-[#0A0A0A]" style={{ fontFamily: "var(--font-body)" }}>
                {memory.content}
              </p>
              <p className="text-[9px] text-[#0A0A0A]/30 mt-1">
                {memory.source} · {new Date(memory.createdAt).toLocaleDateString()}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
