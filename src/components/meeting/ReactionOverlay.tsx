"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect, useRef } from "react";

interface Reaction {
  id: string;
  emoji: string;
  userName: string;
  x: number; // percentage from left 0-100
}

interface ReactionOverlayProps {
  /** Call this to programmatically trigger a reaction from outside */
  onReactionRef?: React.MutableRefObject<
    ((emoji: string, userName: string) => void) | null
  >;
}

export default function ReactionOverlay({ onReactionRef }: ReactionOverlayProps) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const counterRef = useRef(0);

  const addReaction = useCallback((emoji: string, userName: string) => {
    const id = `reaction-${Date.now()}-${counterRef.current++}`;
    const x = 10 + Math.random() * 80; // random horizontal position 10%-90%

    setReactions((prev) => [...prev, { id, emoji, userName, x }]);

    // Remove after animation completes
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  }, []);

  // Expose addReaction to parent
  useEffect(() => {
    if (onReactionRef) {
      onReactionRef.current = addReaction;
    }
    return () => {
      if (onReactionRef) {
        onReactionRef.current = null;
      }
    };
  }, [addReaction, onReactionRef]);

  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden" aria-live="polite" role="log" aria-label="Reactions">
      <AnimatePresence>
        {reactions.map((reaction) => (
          <motion.div
            key={reaction.id}
            className="absolute flex flex-col items-center"
            style={{ left: `${reaction.x}%`, bottom: 100 }}
            initial={{ opacity: 1, y: 0, scale: 0.5 }}
            animate={{
              opacity: [1, 1, 0],
              y: -300,
              scale: [0.5, 1.2, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.5, ease: "easeOut" }}
          >
            <span className="text-4xl">{reaction.emoji}</span>
            <span
              className="text-[10px] font-bold text-white bg-[#0A0A0A]/50 rounded-full px-2 py-0.5 mt-1 whitespace-nowrap"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {reaction.userName}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
