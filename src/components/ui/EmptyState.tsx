"use client";

import { motion } from "framer-motion";
import { YoodleMascotSmall } from "../YoodleMascot";
import Button from "./Button";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export default function EmptyState({ title, description, action, className = "" }: EmptyStateProps) {
  return (
    <motion.div
      className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Mascot with bounce */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="mb-4"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFE600]/20 border-2 border-dashed border-[var(--border)]">
          <YoodleMascotSmall className="h-12 w-12" />
        </div>
      </motion.div>

      <h3
        className="text-lg font-bold text-[var(--text-primary)] mb-1"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {title}
      </h3>
      <p
        className="text-sm text-[var(--text-secondary)] max-w-xs mb-5"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {description}
      </p>

      {action && (
        <Button
          variant="primary"
          size="sm"
          icon={action.icon}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}
