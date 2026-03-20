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
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Clear all pending timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const addReaction = useCallback((emoji: string, userName: string) => {
    const id = `reaction-${Date.now()}-${counterRef.current++}`;
    const x = 10 + Math.random() * 80; // random horizontal position 10%-90%

    setReactions((prev) => [...prev, { id, emoji, userName, x }]);

    // Remove after animation completes
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
    timersRef.current.add(timer);
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
              className="text-[10px] font-bold text-white bg-black/50 rounded-full px-2 py-0.5 mt-1 whitespace-nowrap font-heading"
            >
              {reaction.userName}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
