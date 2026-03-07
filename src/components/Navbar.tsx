"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { YoodleMascotSmall } from "./YoodleMascot";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 30 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[#FAFAF8]/80 backdrop-blur-xl shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#FFE600] border-2 border-[#0A0A0A]">
            <YoodleMascotSmall className="h-9 w-9 mix-blend-multiply" />
          </span>
          <span
            className="text-3xl font-black tracking-tight"
            style={{
              fontFamily: "var(--font-heading)",
              color: "#0A0A0A",
              textShadow: "3px 3px 0 #FFE600",
            }}
          >
            Yoodle
          </span>
        </a>

        {/* Nav links */}
        <div className="hidden items-center gap-8 md:flex">
          {["Features", "How it Works", "About"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm font-medium text-[#0A0A0A]/70 transition-colors hover:text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {item}
            </a>
          ))}
        </div>

        {/* CTA */}
        <motion.a
          href="#cta"
          whileHover={{ scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="rounded-full bg-[#FFE600] px-6 py-2.5 text-sm font-bold text-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] transition-shadow hover:shadow-[2px_2px_0_#0A0A0A]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Launch App
        </motion.a>
      </div>
    </motion.nav>
  );
}
