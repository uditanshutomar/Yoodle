"use client";

import { motion } from "framer-motion";
import { DoodleArrow, DoodleStar } from "./Doodles";

const steps = [
  {
    num: "01",
    title: "Drop in",
    desc: "One click. You're in the room.",
    icon: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="24" stroke="var(--doodle)" strokeWidth="2.5" fill="none" />
        <path d="M26 28L32 22L38 28" stroke="#FFE600" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="32" y1="22" x2="32" y2="42" stroke="var(--doodle)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Do your thing",
    desc: "Meet. Code. Brainstorm. Whatever.",
    icon: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="10" y="14" width="44" height="32" rx="6" stroke="var(--doodle)" strokeWidth="2.5" fill="none" />
        <circle cx="24" cy="28" r="5" fill="#FFE600" />
        <circle cx="40" cy="28" r="5" fill="#FFE600" />
        <path d="M24 38H40" stroke="var(--doodle)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" />
        <line x1="32" y1="46" x2="32" y2="52" stroke="var(--doodle)" strokeWidth="2" strokeLinecap="round" />
        <line x1="24" y1="52" x2="40" y2="52" stroke="var(--doodle)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "AI handles the rest",
    desc: "Notes. Tasks. Follow-ups. Done.",
    icon: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <path d="M20 44L28 36L32 40L44 24" stroke="var(--doodle)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="44" cy="24" r="4" fill="#FFE600" />
        <rect x="10" y="12" width="44" height="40" rx="6" stroke="var(--doodle)" strokeWidth="2.5" fill="none" />
        <path d="M10 20H54" stroke="var(--doodle)" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="1.5" fill="#FF6B6B" />
        <circle cx="22" cy="16" r="1.5" fill="#FFE600" />
        <circle cx="28" cy="16" r="1.5" fill="#22C55E" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2
            className="text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl font-heading"
          >
            Stupid simple.
          </h2>
          <p
            className="mt-3 text-lg text-[var(--text-muted)] font-body"
          >
            Three steps. That&apos;s it.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative grid gap-8 md:grid-cols-3 md:gap-4">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              className="relative flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2, duration: 0.6 }}
            >
              {/* Step number */}
              <span
                className="mb-4 text-6xl font-black text-[#FFE600]"
                style={{
                  WebkitTextStroke: "2px var(--doodle)",
                }}
              >
                {step.num}
              </span>

              {/* Icon */}
              <div className="mb-4">{step.icon}</div>

              {/* Title */}
              <h3
                className="mb-2 text-xl font-bold text-[var(--text-primary)] font-heading"
              >
                {step.title}
              </h3>

              {/* Desc */}
              <p
                className="text-sm text-[var(--text-muted)] font-body"
              >
                {step.desc}
              </p>

              {/* Arrow between steps (only on md+) */}
              {i < steps.length - 1 && (
                <div className="absolute top-16 -right-8 hidden md:block">
                  <DoodleArrow direction="right" className="opacity-40" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      <DoodleStar className="absolute bottom-16 right-16 hidden lg:block" color="#FFE600" size={24} />
    </section>
  );
}
