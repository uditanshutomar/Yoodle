"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import { YoodleMascotSmall } from "./YoodleMascot";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const navLinks = ["Features", "How it Works", "About"];

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 30 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled || mobileOpen
            ? "bg-[#FAFAF8]/80 backdrop-blur-xl shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
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
          </Link>

          {/* Desktop Nav links */}
          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((item) => (
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

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 md:flex">
            <motion.a
              href="/waitlist"
              whileHover={{ scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="rounded-full border-2 border-[#0A0A0A] bg-white px-5 py-2 text-sm font-bold text-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] transition-shadow hover:shadow-[1px_1px_0_#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Join Waitlist
            </motion.a>
            <motion.a
              href="/login"
              whileHover={{ scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="rounded-full bg-[#FFE600] px-6 py-2.5 text-sm font-bold text-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] transition-shadow hover:shadow-[2px_2px_0_#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Launch App
            </motion.a>
          </div>

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="relative z-50 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#0A0A0A] bg-white shadow-[3px_3px_0_#0A0A0A] transition-shadow hover:shadow-[1px_1px_0_#0A0A0A] md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            <div className="flex h-5 w-5 flex-col items-center justify-center gap-1">
              <motion.span
                animate={mobileOpen ? { rotate: 45, y: 3 } : { rotate: 0, y: 0 }}
                className="block h-0.5 w-5 rounded-full bg-[#0A0A0A]"
                transition={{ duration: 0.2 }}
              />
              <motion.span
                animate={mobileOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
                className="block h-0.5 w-5 rounded-full bg-[#0A0A0A]"
                transition={{ duration: 0.15 }}
              />
              <motion.span
                animate={mobileOpen ? { rotate: -45, y: -5 } : { rotate: 0, y: 0 }}
                className="block h-0.5 w-5 rounded-full bg-[#0A0A0A]"
                transition={{ duration: 0.2 }}
              />
            </div>
          </button>
        </div>
      </motion.nav>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-[#0A0A0A]/20 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile menu panel */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-[72px] left-4 right-4 z-40 rounded-2xl border-2 border-[#0A0A0A] bg-[#FAFAF8] p-6 shadow-[6px_6px_0_#0A0A0A] md:hidden"
          >
            {/* Nav links */}
            <div className="flex flex-col gap-1 mb-6">
              {navLinks.map((item, i) => (
                <motion.a
                  key={item}
                  href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => setMobileOpen(false)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl px-4 py-3 text-base font-bold text-[#0A0A0A]/80 transition-colors hover:bg-[#FFE600]/20 hover:text-[#0A0A0A]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {item}
                </motion.a>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col gap-3 border-t-2 border-[#0A0A0A]/10 pt-5">
              <a
                href="/waitlist"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center rounded-full border-2 border-[#0A0A0A] bg-white px-6 py-3 text-sm font-bold text-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] transition-shadow hover:shadow-[1px_1px_0_#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Join Waitlist
              </a>
              <a
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center rounded-full bg-[#FFE600] px-6 py-3 text-sm font-bold text-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] transition-shadow hover:shadow-[2px_2px_0_#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Launch App
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
