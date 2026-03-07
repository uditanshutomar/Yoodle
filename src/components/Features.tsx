"use client";

import { motion } from "framer-motion";
import { DoodleStar, DoodleLightning } from "./Doodles";

const features = [
  {
    title: "Crystal Calls",
    desc: "Zero awkward lag. Video & audio that just works.",
    color: "#FFE600",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="12" width="26" height="20" rx="4" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M32 18L42 12V36L32 30" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="19" cy="22" r="4" fill="#FFE600" />
      </svg>
    ),
  },
  {
    title: "AI Brain",
    desc: "Remembers everything. Notes, tasks, follow-ups on autopilot.",
    color: "#7C3AED",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="16" stroke="#1A1A1A" strokeWidth="2.5" fill="none" />
        <path d="M16 24C16 20 20 16 24 16C28 16 32 20 32 24" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="20" cy="22" r="2" fill="#7C3AED" />
        <circle cx="28" cy="22" r="2" fill="#7C3AED" />
        <path d="M20 28C20 28 22 31 24 31C26 31 28 28 28 28" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M10 16L6 12" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
        <path d="M38 16L42 12" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
        <path d="M24 6V2" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Ghost Rooms",
    desc: "Brainstorm. Then poof. Everything vanishes.",
    color: "#FF6B6B",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <path d="M12 38V14C12 8 17 4 24 4C31 4 36 8 36 14V38L32 34L28 38L24 34L20 38L16 34L12 38Z" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="19" cy="18" r="2.5" fill="#FF6B6B" />
        <circle cx="29" cy="18" r="2.5" fill="#FF6B6B" />
        <path d="M19 26C19 26 21 29 24 29C27 29 29 26 29 26" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none" />
        <motion.path
          d="M8 20C5 18 3 14 5 10"
          stroke="#FF6B6B"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="20"
          initial={{ strokeDashoffset: 20, opacity: 0.4 }}
          animate={{ strokeDashoffset: 0, opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.path
          d="M40 20C43 18 45 14 43 10"
          stroke="#FF6B6B"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="20"
          initial={{ strokeDashoffset: 20, opacity: 0.4 }}
          animate={{ strokeDashoffset: 0, opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
        />
      </svg>
    ),
  },
  {
    title: "Ship Together",
    desc: "Shared AI codespace. Prompt, code, review — live.",
    color: "#06B6D4",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="8" width="36" height="28" rx="4" stroke="#1A1A1A" strokeWidth="2.5" fill="none" />
        <path d="M16 20L12 24L16 28" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32 20L36 24L32 28" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M26 18L22 30" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" />
        <line x1="6" y1="40" x2="20" y2="40" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" />
        <line x1="28" y1="40" x2="42" y2="40" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="40" r="2" fill="#06B6D4" />
      </svg>
    ),
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

export default function Features() {
  return (
    <section id="features" className="relative px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="relative mb-16 text-center">
          <DoodleLightning className="absolute -top-8 left-1/2 -translate-x-12" color="#FFE600" />
          <motion.h2
            className="text-4xl font-black tracking-tight text-[#0A0A0A] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Everything you need.
            <br />
            <span className="text-[#0A0A0A]/40">Nothing you don&apos;t.</span>
          </motion.h2>
        </div>

        {/* Feature cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              whileHover={{
                y: -6,
                rotate: i % 2 === 0 ? 1 : -1,
                transition: { type: "spring", stiffness: 400 },
              }}
              className="group relative cursor-default rounded-2xl border-2 border-[#0A0A0A] bg-white p-6 shadow-[4px_4px_0_#0A0A0A] transition-shadow hover:shadow-[2px_2px_0_#0A0A0A]"
            >
              {/* Colored dot */}
              <div
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full border-2 border-[#0A0A0A]"
                style={{ background: feature.color }}
              />

              {/* Icon */}
              <div className="mb-4">{feature.icon}</div>

              {/* Title */}
              <h3
                className="mb-2 text-xl font-bold text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p
                className="text-sm leading-relaxed text-[#0A0A0A]/55"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Floating doodles */}
        <DoodleStar className="absolute top-20 right-12 hidden lg:block" color="#FFE600" size={28} />
        <DoodleStar className="absolute bottom-20 left-8 hidden lg:block" color="#1A1A1A" size={18} />
      </div>
    </section>
  );
}
