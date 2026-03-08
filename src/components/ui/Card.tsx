"use client";

import { motion } from "framer-motion";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = "", hover = false, onClick }: CardProps) {
  if (hover) {
    return (
      <motion.div
        className={`bg-white border-2 border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] p-6 ${className}`}
        whileHover={{
          y: -4,
          boxShadow: "2px 2px 0 #0A0A0A",
          transition: { duration: 0.2 },
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onClick={onClick}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      className={`bg-white border-2 border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] p-6 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
