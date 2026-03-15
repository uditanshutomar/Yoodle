"use client";

import { motion, type Variants } from "framer-motion";

const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { duration: 1.2, ease: "easeInOut" as const }, opacity: { duration: 0.3 } },
  },
};

export function DoodleArrow({ className = "", direction = "right" }: { className?: string; direction?: "right" | "down" | "left" }) {
  const rotation = direction === "down" ? 90 : direction === "left" ? 180 : 0;
  return (
    <motion.svg
      className={className}
      width="80"
      height="40"
      viewBox="0 0 80 40"
      fill="none"
      style={{ rotate: rotation }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M5 25C15 20 30 15 50 18C55 19 60 20 65 18"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        variants={draw}
      />
      <motion.path
        d="M58 12L67 18L58 24"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleUnderline({ className = "", color = "#FFE600", width = 200 }: { className?: string; color?: string; width?: number }) {
  return (
    <motion.svg
      className={className}
      width={width}
      height="12"
      viewBox={`0 0 ${width} 12`}
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d={`M2 8C${width * 0.15} 3 ${width * 0.35} 10 ${width * 0.5} 6C${width * 0.65} 2 ${width * 0.85} 9 ${width - 2} 5`}
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleStar({ className = "", color = "#FFE600", size = 32 }: { className?: string; color?: string; size?: number }) {
  return (
    <motion.svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M16 2L18 12L28 10L20 16L28 22L18 20L16 30L14 20L4 22L12 16L4 10L14 12Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleSquiggle({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      width="120"
      height="30"
      viewBox="0 0 120 30"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M3 15C13 5 23 25 33 15C43 5 53 25 63 15C73 5 83 25 93 15C103 5 113 25 117 15"
        stroke="#1A1A1A"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleLightning({ className = "", color = "#FFE600" }: { className?: string; color?: string }) {
  return (
    <motion.svg
      className={className}
      width="28"
      height="40"
      viewBox="0 0 28 40"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M18 2L6 18H14L10 38L24 16H15L18 2Z"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleCheckmark({ className = "", color = "#1A1A1A" }: { className?: string; color?: string }) {
  return (
    <motion.svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M4 12L10 18L20 6"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleSparkles({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      initial={{ opacity: 0, scale: 0 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, type: "spring" }}
    >
      <path d="M20 4L22 16L34 14L24 20L34 26L22 24L20 36L18 24L6 26L16 20L6 14L18 16Z" fill="#FFE600" />
    </motion.svg>
  );
}

