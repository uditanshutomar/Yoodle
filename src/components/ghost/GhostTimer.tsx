"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface GhostTimerProps {
  expiresAt: Date;
}

export default function GhostTimer({ expiresAt }: GhostTimerProps) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const totalSeconds = timeLeft.hours * 3600 + timeLeft.minutes * 60 + timeLeft.seconds;
  const isUrgent = totalSeconds < 300; // under 5 minutes
  const isWarning = totalSeconds < 900; // under 15 minutes

  const color = isUrgent ? "#FF6B6B" : isWarning ? "#F59E0B" : "#7C3AED";

  return (
    <motion.div
      className="flex items-center gap-2 px-4 py-2 rounded-full border-2 font-mono text-lg font-bold"
      style={{
        borderColor: color,
        color,
        fontFamily: "var(--font-heading)",
      }}
      animate={isUrgent ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 1, repeat: Infinity }}
    >
      <motion.div
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      {String(timeLeft.hours).padStart(2, "0")}:
      {String(timeLeft.minutes).padStart(2, "0")}:
      {String(timeLeft.seconds).padStart(2, "0")}
    </motion.div>
  );
}

function getTimeLeft(expiresAt: Date) {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  return {
    hours: Math.floor(diff / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}
