"use client";

import { m } from "framer-motion";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { container: "h-8 w-8", stroke: 3 },
  md: { container: "h-16 w-16", stroke: 3 },
  lg: { container: "h-24 w-24", stroke: 3 },
};

export default function LoadingSpinner({ size = "md", className = "" }: LoadingSpinnerProps) {
  const s = sizeMap[size];

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <m.div
        className={`${s.container} relative`}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        {/* Outer doodle spiral */}
        <svg viewBox="0 0 50 50" fill="none" className="h-full w-full">
          <m.circle
            cx="25"
            cy="25"
            r="20"
            stroke="#FFE600"
            strokeWidth={s.stroke}
            strokeLinecap="round"
            strokeDasharray="80 40"
            fill="none"
          />
          <m.circle
            cx="25"
            cy="25"
            r="12"
            stroke="#0A0A0A"
            strokeWidth={s.stroke}
            strokeLinecap="round"
            strokeDasharray="50 25"
            fill="none"
            initial={{ rotate: 0 }}
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
          {/* Center dot */}
          <m.circle
            cx="25"
            cy="25"
            r="3"
            fill="#FFE600"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </svg>
      </m.div>
    </div>
  );
}
