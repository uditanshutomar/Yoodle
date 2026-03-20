"use client";

import { motion } from "framer-motion";
import { DoodleStar, DoodleLightning } from "./Doodles";

const terminalLines = [
  { type: "command", text: "$ git clone https://github.com/uditanshutomar/Yoodle.git" },
  { type: "command", text: "$ cd yoodle" },
  { type: "command", text: "$ docker compose up -d" },
  { type: "output", text: "\uD83D\uDE80 Yoodle running at http://localhost:3000" },
];

const featureCards = [
  {
    title: "Your Data",
    desc: "Everything stays on your servers. Full GDPR compliance out of the box.",
    color: "#22C55E",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="6" y="8" width="28" height="24" rx="4" stroke="var(--doodle)" strokeWidth="2" fill="none" />
        <path d="M6 16H34" stroke="var(--doodle)" strokeWidth="2" />
        <circle cx="12" cy="12" r="1.5" fill="#22C55E" />
        <circle cx="17" cy="12" r="1.5" fill="#22C55E" />
        <path d="M14 24L18 28L26 20" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Your Rules",
    desc: "Bring your own AI keys. Choose your providers. No vendor lock-in.",
    color: "#06B6D4",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="16" r="8" stroke="var(--doodle)" strokeWidth="2" fill="none" />
        <path d="M20 24V34" stroke="var(--doodle)" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 28H26" stroke="var(--doodle)" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 32H24" stroke="var(--doodle)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="20" cy="16" r="3" fill="#06B6D4" />
      </svg>
    ),
  },
  {
    title: "Your Stack",
    desc: "Docker Compose, Redis, MongoDB, LiveKit. Production-ready infrastructure.",
    color: "#A855F7",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="8" y="6" width="24" height="8" rx="2" stroke="var(--doodle)" strokeWidth="2" fill="none" />
        <rect x="8" y="16" width="24" height="8" rx="2" stroke="var(--doodle)" strokeWidth="2" fill="none" />
        <rect x="8" y="26" width="24" height="8" rx="2" stroke="var(--doodle)" strokeWidth="2" fill="none" />
        <circle cx="27" cy="10" r="1.5" fill="#A855F7" />
        <circle cx="27" cy="20" r="1.5" fill="#A855F7" />
        <circle cx="27" cy="30" r="1.5" fill="#A855F7" />
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

export default function OpenSource() {
  return (
    <section id="open-source" className="relative px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="relative mb-16 text-center">
          <DoodleLightning className="absolute -top-8 left-1/2 -translate-x-12" color="#A855F7" />
          <motion.h2
            className="text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl font-heading"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Own your meetings.
          </motion.h2>
          <motion.p
            className="mt-4 text-lg text-[var(--text-muted)] font-body"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            MIT-licensed. Self-host in 5 minutes.
          </motion.p>
        </div>

        {/* Terminal card */}
        <motion.div
          className="mx-auto max-w-2xl"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="overflow-hidden rounded-2xl border-2 border-[var(--border-strong)] bg-[#0A0A0A] shadow-[4px_4px_0_var(--border-strong)]">
            {/* Terminal title bar */}
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-[#FF6B6B]" />
              <div className="h-3 w-3 rounded-full bg-[#FFE600]" />
              <div className="h-3 w-3 rounded-full bg-[#22C55E]" />
              <span
                className="ml-2 text-xs text-white/30 font-mono"
              >
                terminal
              </span>
            </div>

            {/* Terminal body */}
            <div className="px-5 py-5">
              {terminalLines.map((line, i) => (
                <motion.div
                  key={i}
                  className="mb-2 last:mb-0"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.3, duration: 0.4 }}
                >
                  <code
                    className={`text-sm font-mono ${
                      line.type === "command" ? "text-[#22C55E]" : "text-white/50"
                    }`}
                  >
                    {line.text}
                  </code>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Feature cards */}
        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {featureCards.map((card, i) => (
            <motion.div
              key={card.title}
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
              className="group relative cursor-default rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--border-strong)] transition-shadow hover:shadow-[2px_2px_0_var(--border-strong)]"
            >
              {/* Colored dot */}
              <div
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full border-2 border-[var(--border-strong)]"
                style={{ background: card.color }}
              />

              {/* Icon */}
              <div className="mb-4">{card.icon}</div>

              {/* Title */}
              <h3
                className="mb-2 text-xl font-bold text-[var(--text-primary)] font-heading"
              >
                {card.title}
              </h3>

              {/* Description */}
              <p
                className="text-sm leading-relaxed text-[var(--text-muted)] font-body"
              >
                {card.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* GitHub CTA */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <motion.a
            href="https://github.com/uditanshutomar/Yoodle"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-8 py-3.5 text-base font-bold text-[#0A0A0A] shadow-[4px_4px_0_var(--border-strong)] transition-shadow hover:shadow-[2px_2px_0_var(--border-strong)] font-heading"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.71.115 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.16.58.67.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"
                fill="currentColor"
              />
            </svg>
            Star on GitHub
          </motion.a>
        </motion.div>

        {/* Floating doodles */}
        <DoodleStar className="absolute top-20 right-12 hidden lg:block" color="#A855F7" size={28} />
        <DoodleStar className="absolute bottom-20 left-8 hidden lg:block" color="var(--doodle)" size={18} />
      </div>
    </section>
  );
}
