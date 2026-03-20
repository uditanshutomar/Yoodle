"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { DoodleUnderline } from "./Doodles";

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden px-6 pt-28 pb-20 lg:px-8">
      {/* Full doodle background */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/yoodle-banner.png"
          alt=""
          fill
          className="object-cover opacity-[0.18]"
          priority
        />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-center text-center">
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Small tag */}
              <motion.div
                className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-[var(--border-strong)] bg-[var(--surface)] px-4 py-1.5"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E]" />
                <span
                  className="text-xs font-semibold tracking-wide text-[var(--text-primary)] font-heading"
                >
                  MEETINGS REIMAGINED
                </span>
              </motion.div>

              {/* Headline */}
              <h1
                className="text-5xl font-black leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-6xl lg:text-7xl font-heading"
              >
                Meetings
                <br />
                that actually
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">slap.</span>
                  <DoodleUnderline
                    className="absolute -bottom-2 left-0 z-0"
                    width={180}
                    color="#FFE600"
                  />
                </span>
              </h1>

              {/* Subtext */}
              <motion.p
                className="mt-6 mx-auto max-w-md text-lg leading-relaxed text-[var(--text-secondary)] font-body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Video calls. AI notes. Shared workspaces.
                <br />
                Built for how you actually work.
              </motion.p>

              {/* CTA Group */}
              <motion.div
                className="mt-10 flex items-center justify-center gap-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <motion.a
                  href="/login"
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 rounded-full bg-[#FFE600] px-8 py-4 text-lg font-bold text-[#0A0A0A] shadow-[5px_5px_0_var(--border-strong)] transition-all hover:shadow-[3px_3px_0_var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:outline-none font-heading"
                >
                  Launch App
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <path
                      d="M5 10H15M15 10L10 5M15 10L10 15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.a>

                <a
                  href="/waitlist"
                  className="text-sm font-semibold text-[var(--text-primary)] underline decoration-[#FFE600] decoration-2 underline-offset-4 transition-colors hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none focus-visible:rounded font-heading"
                >
                  Join Waitlist
                </a>
              </motion.div>

            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
