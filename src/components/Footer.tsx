"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const socials = [
  {
    label: "Twitter",
    href: "https://x.com",
    path: "M23 3a10.9 10.9 0 0 1-3.14 1.53A4.48 4.48 0 0 0 12 7.5v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z",
  },
  {
    label: "GitHub",
    href: "https://github.com/AarnaTechLabs/yoodle",
    path: "M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.71.115 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.16.58.67.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z",
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com",
    path: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  },
];

export default function Footer() {
  return (
    <footer className="border-t-2 border-[#0A0A0A]/10 px-6 py-12 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1">
          <span
            className="text-2xl font-black tracking-tight"
            style={{
              fontFamily: "var(--font-heading)",
              color: "#0A0A0A",
              textShadow: "2px 2px 0 #FFE600",
            }}
          >
            Yoodle
          </span>
        </Link>

        {/* Tagline */}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
          <p
            className="text-sm text-[#0A0A0A]/40"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Made for the new workforce.
          </p>
          <span className="text-sm text-[#0A0A0A]/25">|</span>
          <p
            className="text-sm text-[#0A0A0A]/40"
            style={{ fontFamily: "var(--font-body)" }}
          >
            MIT License
          </p>
          <a
            href="https://github.com/AarnaTechLabs/yoodle"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0A0A0A]/20 px-3 py-1 text-xs font-bold text-[#0A0A0A]/60 transition-colors hover:border-[#0A0A0A] hover:bg-[#FFE600] hover:text-[#0A0A0A]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.71.115 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.16.58.67.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"
                fill="currentColor"
              />
            </svg>
            Open Source
          </a>
        </div>

        {/* Social icons */}
        <div className="flex items-center gap-4">
          {socials.map((social) => (
            <motion.a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ y: -2, scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#0A0A0A]/20 transition-colors hover:border-[#0A0A0A] hover:bg-[#FFE600]"
              aria-label={social.label}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d={social.path} stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.a>
          ))}
        </div>
      </div>
    </footer>
  );
}
