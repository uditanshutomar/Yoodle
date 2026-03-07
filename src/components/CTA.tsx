"use client";

import { motion } from "framer-motion";
import { DoodleStar, DoodleSparkles, DoodleLightning } from "./Doodles";

export default function CTA() {
  return (
    <section
      id="cta"
      className="relative overflow-hidden px-6 py-28 lg:px-8"
    >
      {/* Black background with slight rounded edges at top */}
      <div className="absolute inset-0 bg-[#0A0A0A]" />

      <div className="relative mx-auto max-w-3xl text-center">
        {/* Floating doodles */}
        <DoodleStar className="absolute -top-4 left-8" color="#FFE600" size={32} />
        <DoodleStar className="absolute top-12 right-4" color="#FFE600" size={20} />
        <DoodleLightning className="absolute -bottom-6 left-16" color="#FF6B6B" />
        <DoodleSparkles className="absolute bottom-0 right-12" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h2
            className="text-4xl font-black tracking-tight text-white sm:text-6xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Ready to ditch
            <br />
            <span
              style={{
                color: "#FFE600",
                textShadow: "3px 3px 0 rgba(255,230,0,0.2)",
              }}
            >
              boring meetings?
            </span>
          </h2>

          <p
            className="mx-auto mt-6 max-w-md text-lg text-white/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Join the new workforce. Meetings that feel like hanging out with your team.
          </p>

          <motion.div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <motion.a
              href="#"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-full bg-[#FFE600] px-10 py-4 text-lg font-bold text-[#0A0A0A] shadow-[5px_5px_0_rgba(255,230,0,0.3)] transition-all hover:shadow-[3px_3px_0_rgba(255,230,0,0.3)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Launch Yoodle
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 10H15M15 10L10 5M15 10L10 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.a>

            <span className="text-sm text-white/30" style={{ fontFamily: "var(--font-body)" }}>
              Free forever for small teams
            </span>
          </motion.div>
        </motion.div>

        {/* Doodle confetti dots */}
        {[
          { w: 7, t: "12%", l: "8%", c: "#FFE600" },
          { w: 4, t: "25%", l: "85%", c: "#FF6B6B" },
          { w: 6, t: "68%", l: "15%", c: "#7C3AED" },
          { w: 5, t: "82%", l: "72%", c: "#06B6D4" },
          { w: 8, t: "40%", l: "92%", c: "#FFFFFF" },
          { w: 4, t: "55%", l: "45%", c: "#FFE600" },
          { w: 6, t: "18%", l: "62%", c: "#FF6B6B" },
          { w: 5, t: "75%", l: "30%", c: "#7C3AED" },
          { w: 7, t: "90%", l: "55%", c: "#06B6D4" },
          { w: 3, t: "35%", l: "5%", c: "#FFFFFF" },
          { w: 5, t: "8%", l: "38%", c: "#FFE600" },
          { w: 4, t: "60%", l: "80%", c: "#FF6B6B" },
        ].map((dot, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: dot.w,
              height: dot.w,
              top: dot.t,
              left: dot.l,
              background: dot.c,
            }}
            initial={{ opacity: 0, scale: 0 }}
            whileInView={{ opacity: 0.4, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
          />
        ))}
      </div>
    </section>
  );
}
