"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { DoodleStar, DoodleSparkles } from "./Doodles";

const features = [
  "Unlimited 1:1 meetings",
  "Group calls up to 25 people",
  "AI meeting assistant (bring your own key)",
  "Screen sharing & recording",
  "Ghost rooms",
  "Chat, reactions & hand raise",
  "Grid & bubble views",
  "Host controls & waiting room",
  "Self-host with Docker",
];

const comparisonRows = [
  { feature: "1:1 meetings", community: "Unlimited", cloud: "Unlimited" },
  { feature: "Group calls", community: "Up to 25", cloud: "Up to 100" },
  { feature: "AI assistant", community: "Bring your key", cloud: "Managed" },
  { feature: "Recording", community: "Client-side", cloud: "Server-side" },
  { feature: "Live captions", community: "\u2014", cloud: "\u2713" },
  { feature: "Custom branding", community: "\u2014", cloud: "\u2713" },
  { feature: "Infrastructure", community: "Self-host", cloud: "Managed" },
];

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

export default function Pricing() {
  return (
    <section id="pricing" className="relative px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="relative mb-16 text-center">
          <DoodleSparkles className="absolute -top-6 left-1/2 -translate-x-16" />
          <motion.h2
            className="text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl font-heading"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Free. Like, actually free.
          </motion.h2>
          <motion.p
            className="mt-4 text-lg text-[var(--text-muted)] font-body"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            No credit card. No trial. No catch.
          </motion.p>
        </div>

        {/* Pricing card */}
        <motion.div
          className="mx-auto max-w-md"
          variants={cardVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <div className="relative rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[4px_4px_0_var(--border-strong)]">
            {/* Colored dot */}
            <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full border-2 border-[var(--border-strong)] bg-[#22C55E]" />

            {/* Price */}
            <div className="mb-6 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span
                  className="text-7xl font-black text-[var(--text-primary)] font-heading"
                >
                  $0
                </span>
                <span
                  className="text-xl text-[var(--text-muted)] font-body"
                >
                  /forever
                </span>
              </div>
              <p
                className="mt-2 text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] font-heading"
              >
                Yoodle Community
              </p>
            </div>

            {/* Divider */}
            <div className="mb-6 border-t-2 border-dashed border-[var(--border)]" />

            {/* Feature list */}
            <ul className="mb-8 space-y-3">
              {features.map((feature, i) => (
                <motion.li
                  key={feature}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i, duration: 0.4 }}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border-strong)] bg-[#22C55E]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 12L10 18L20 6"
                        stroke="#0A0A0A"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span
                    className="text-sm text-[var(--text-secondary)] font-body"
                  >
                    {feature}
                  </span>
                </motion.li>
              ))}
            </ul>

            {/* CTA button */}
            <Link href="/login">
              <motion.button
                className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-6 py-3.5 text-base font-bold text-[#0A0A0A] shadow-[4px_4px_0_var(--border-strong)] transition-shadow hover:shadow-[2px_2px_0_var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:outline-none font-heading"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                Get Started &mdash; It&apos;s Free
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* Comparison table */}
        <motion.div
          className="mx-auto mt-16 max-w-2xl"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <h3
            className="mb-6 text-center text-xl font-bold text-[var(--text-primary)] font-heading"
          >
            Community vs Cloud
          </h3>

          <div className="overflow-hidden rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
            {/* Table header */}
            <div className="grid grid-cols-3 border-b-2 border-[var(--border-strong)] bg-[var(--surface-hover)]">
              <div
                className="px-4 py-3 text-sm font-bold text-[var(--text-muted)] font-heading"
              >
                Feature
              </div>
              <div
                className="border-l-2 border-[var(--border)] px-4 py-3 text-center text-sm font-bold text-[var(--text-primary)] font-heading"
              >
                Community
                <span className="ml-1.5 inline-block rounded-full border border-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#22C55E]">
                  Free
                </span>
              </div>
              <div
                className="relative border-l-2 border-[var(--border)] px-4 py-3 text-center text-sm font-bold text-[var(--text-muted)] font-heading"
              >
                Cloud
                <span className="ml-1.5 inline-block rounded-full border border-[#A855F7] bg-[#A855F7]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#A855F7]">
                  Coming 2026
                </span>
              </div>
            </div>

            {/* Table rows */}
            {comparisonRows.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 ${
                  i < comparisonRows.length - 1 ? "border-b border-[var(--border)]" : ""
                }`}
              >
                <div
                  className="px-4 py-3 text-sm text-[var(--text-muted)] font-body"
                >
                  {row.feature}
                </div>
                <div
                  className="border-l-2 border-[var(--border)] px-4 py-3 text-center text-sm font-medium text-[var(--text-primary)] font-body"
                >
                  {row.community}
                </div>
                <div
                  className="border-l-2 border-[var(--border)] px-4 py-3 text-center text-sm text-[var(--text-muted)] font-body"
                >
                  {row.cloud}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Floating doodles */}
        <DoodleStar className="absolute top-16 right-12 hidden lg:block" color="#22C55E" size={24} />
        <DoodleStar className="absolute bottom-24 left-8 hidden lg:block" color="#FFE600" size={18} />
      </div>
    </section>
  );
}
