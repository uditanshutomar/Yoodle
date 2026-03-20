"use client";

import { motion } from "framer-motion";
import { DoodleCheckmark, DoodleSparkles, DoodleStar } from "./Doodles";
import { YoodleMascotLarge } from "./YoodleMascot";

const capabilities = [
  "Reminds you what to say in meetings",
  "Estimates task time, finds calendar slots",
  "Handles file naming, saving — the boring stuff",
  "Summarizes plans, proofreads everything",
  "Nearby coworker? It knows. Go grab coffee.",
  "Remembers the small things you always forget",
];

export default function AIAssistant() {
  return (
    <section id="about" className="relative overflow-hidden px-6 py-24 lg:px-8">
      {/* Yellow background stripe */}
      <div className="absolute inset-0 -skew-y-2 bg-[#FFE600]" />

      <div className="relative mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: Mascot illustration */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="text-center">
              <YoodleMascotLarge className="w-full max-w-[300px] mx-auto" />
              <p
                className="mt-3 text-lg font-bold italic text-[#0A0A0A]/80 font-heading"
              >
                Your AI-powered executive assistant.
              </p>
            </div>
          </motion.div>

          {/* Right: Text + capabilities */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="mb-2 flex items-center gap-2">
                <DoodleSparkles className="inline-block" />
                <span
                  className="text-sm font-bold tracking-wider text-[#0A0A0A]/70 font-heading"
                >
                  YOUR AI SIDEKICK
                </span>
              </div>

              <h2
                className="mb-8 text-4xl font-black tracking-tight text-[#0A0A0A] sm:text-5xl font-heading"
              >
                It just gets you.
              </h2>
            </motion.div>

            <div className="space-y-4">
              {capabilities.map((text, i) => (
                <motion.div
                  key={text}
                  className="flex items-center gap-3 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[3px_3px_0_var(--border-strong)]"
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  whileHover={{ x: -3, boxShadow: "1px 1px 0 var(--border-strong)" }}
                >
                  <DoodleCheckmark color="var(--doodle)" />
                  <span
                    className="text-sm font-medium text-[var(--text-primary)] font-body"
                  >
                    {text}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DoodleStar className="absolute top-8 right-20 hidden lg:block" color="var(--doodle)" size={24} />
    </section>
  );
}
