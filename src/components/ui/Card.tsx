"use client";

import { m } from "framer-motion";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = "", hover = false, onClick }: CardProps) {
  const base = `bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-card)] p-6 ${className}`;

  // When clickable, add keyboard accessibility (Enter/Space to activate)
  const interactiveProps = onClick
    ? {
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
        style: { cursor: "pointer" },
      }
    : {};

  if (hover) {
    return (
      <m.div
        className={base}
        whileHover={{
          y: -4,
          boxShadow: "2px 2px 0 var(--border-strong)",
          transition: { duration: 0.2 },
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onClick={onClick}
        {...interactiveProps}
      >
        {children}
      </m.div>
    );
  }

  return (
    <div className={base} onClick={onClick} {...interactiveProps}>
      {children}
    </div>
  );
}
