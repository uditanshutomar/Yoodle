"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { YoodleMascotSmall } from "@/components/YoodleMascot";
import { DoodleStar, DoodleLightning, DoodleSparkles } from "@/components/Doodles";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "already" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch waitlist count on mount
  useEffect(() => {
    fetch("/api/waitlist")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.count != null) {
          setWaitlistCount(d.data.count);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg("Email is required.");
      inputRef.current?.focus();
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error?.message || "Something went wrong.");
        return;
      }

      if (data.data?.alreadyJoined) {
        setStatus("already");
      } else {
        setStatus("success");
        if (data.data?.position) setPosition(data.data.position);
        setWaitlistCount((prev) => (prev != null ? prev + 1 : null));
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FAFAF8]">
      {/* Background doodle pattern */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/yoodle-banner.png"
          alt=""
          fill
          className="object-cover opacity-[0.08]"
          priority
        />
      </div>

      {/* Floating doodles */}
      <DoodleStar
        className="absolute top-20 left-[8%] hidden md:block"
        color="#FFE600"
        size={28}
      />
      <DoodleStar
        className="absolute top-40 right-[10%] hidden md:block"
        color="#FFE600"
        size={20}
      />
      <DoodleLightning
        className="absolute bottom-32 left-[12%] hidden md:block"
        color="#FF6B6B"
      />
      <DoodleSparkles className="absolute bottom-20 right-[8%] hidden md:block" />

      {/* Confetti dots */}
      {[
        { w: 6, t: "15%", l: "5%", c: "#FFE600" },
        { w: 4, t: "25%", l: "90%", c: "#FF6B6B" },
        { w: 5, t: "70%", l: "8%", c: "#7C3AED" },
        { w: 7, t: "80%", l: "85%", c: "#06B6D4" },
        { w: 4, t: "45%", l: "95%", c: "#FFE600" },
        { w: 6, t: "60%", l: "3%", c: "#FF6B6B" },
      ].map((dot, i) => (
        <motion.div
          key={i}
          className="absolute hidden rounded-full md:block"
          style={{
            width: dot.w,
            height: dot.w,
            top: dot.t,
            left: dot.l,
            background: dot.c,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.5, scale: 1 }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
        />
      ))}

      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[#0A0A0A] bg-[#FFE600]">
            <YoodleMascotSmall className="h-8 w-8 mix-blend-multiply" />
          </span>
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

        <Link
          href="/"
          className="text-sm font-medium text-[#0A0A0A]/60 transition-colors hover:text-[#0A0A0A]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Back to Home
        </Link>
      </nav>

      {/* Main content */}
      <div className="relative z-10 flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6 pb-20">
        <motion.div
          className="w-full max-w-lg"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Tag */}
          <motion.div
            className="mb-6 flex justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#0A0A0A] bg-white px-4 py-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E]" />
              <span
                className="text-xs font-semibold tracking-wide text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                EARLY ACCESS
              </span>
            </div>
          </motion.div>

          {/* Heading */}
          <h1
            className="text-center text-4xl font-black leading-tight tracking-tight text-[#0A0A0A] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Get in before
            <br />
            <span
              className="relative inline-block"
              style={{
                color: "#0A0A0A",
              }}
            >
              everyone else.
              <motion.span
                className="absolute -bottom-1 left-0 h-3 w-full rounded-sm bg-[#FFE600]"
                style={{ zIndex: -1 }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
              />
            </span>
          </h1>

          <p
            className="mx-auto mt-4 max-w-sm text-center text-base leading-relaxed text-[#0A0A0A]/60"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Yoodle is invite-only for now. Drop your email and
            we&apos;ll let you in when your spot opens up.
          </p>

          {/* Waitlist count */}
          {waitlistCount != null && waitlistCount > 0 && status === "idle" && (
            <motion.p
              className="mt-3 text-center text-sm font-medium text-[#0A0A0A]/40"
              style={{ fontFamily: "var(--font-body)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              {waitlistCount} {waitlistCount === 1 ? "person" : "people"} already
              on the list
            </motion.p>
          )}

          {/* Form / Success state */}
          <AnimatePresence mode="wait">
            {status === "success" || status === "already" ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
                className="mx-auto mt-10 w-full max-w-md"
              >
                <div className="rounded-2xl border-2 border-[#0A0A0A] bg-white p-8 shadow-[6px_6px_0_#0A0A0A]">
                  {/* Checkmark */}
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#22C55E]">
                    <motion.svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.3, duration: 0.5 }}
                    >
                      <motion.path
                        d="M5 12L10 17L19 7"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                      />
                    </motion.svg>
                  </div>

                  <h2
                    className="text-center text-2xl font-black text-[#0A0A0A]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {status === "already"
                      ? "You're already in!"
                      : "You're on the list!"}
                  </h2>

                  <p
                    className="mt-2 text-center text-sm text-[#0A0A0A]/60"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {status === "already"
                      ? "We already have your email. We'll reach out when your spot is ready."
                      : position
                        ? `You're #${position} on the waitlist. We'll email you when it's your turn.`
                        : "We'll email you when it's your turn."}
                  </p>

                  {/* Share section */}
                  <div className="mt-6 rounded-xl border-2 border-dashed border-[#0A0A0A]/20 p-4">
                    <p
                      className="text-center text-xs font-semibold uppercase tracking-wide text-[#0A0A0A]/40"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Tell your friends
                    </p>
                    <div className="mt-3 flex justify-center gap-3">
                      <ShareButton
                        label="Twitter"
                        onClick={() =>
                          window.open(
                            `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                              "Just joined the waitlist for @yoodle_app — meetings reimagined! Get in early: "
                            )}&url=${encodeURIComponent(
                              "https://yoodle.vercel.app/waitlist"
                            )}`,
                            "_blank"
                          )
                        }
                        icon={
                          <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53A4.48 4.48 0 0 0 12 7.5v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5 0-.28 0-.56-.02-.83A7.72 7.72 0 0 0 23 3z" />
                        }
                      />
                      <ShareButton
                        label="LinkedIn"
                        onClick={() =>
                          window.open(
                            `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                              "https://yoodle.vercel.app/waitlist"
                            )}`,
                            "_blank"
                          )
                        }
                        icon={
                          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
                        }
                      />
                      <ShareButton
                        label="Copy Link"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "https://yoodle.vercel.app/waitlist"
                          );
                        }}
                        icon={
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        }
                      />
                    </div>
                  </div>

                  <Link
                    href="/"
                    className="mt-6 block text-center text-sm font-medium text-[#0A0A0A]/50 underline decoration-[#FFE600] decoration-2 underline-offset-4 transition-colors hover:text-[#0A0A0A]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Back to homepage
                  </Link>
                </div>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mx-auto mt-10 w-full max-w-md"
              >
                <div className="rounded-2xl border-2 border-[#0A0A0A] bg-white p-6 shadow-[6px_6px_0_#0A0A0A] sm:p-8">
                  {/* Name field */}
                  <div className="mb-4">
                    <label
                      htmlFor="waitlist-name"
                      className="mb-1.5 block text-sm font-semibold text-[#0A0A0A]"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Name{" "}
                      <span className="text-[#0A0A0A]/30 font-normal">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="waitlist-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-xl border-2 border-[#0A0A0A]/20 bg-[#FAFAF8] px-4 py-3 text-sm text-[#0A0A0A] placeholder-[#0A0A0A]/30 outline-none transition-all focus:border-[#0A0A0A] focus:shadow-[3px_3px_0_#FFE600]"
                      style={{ fontFamily: "var(--font-body)" }}
                    />
                  </div>

                  {/* Email field */}
                  <div className="mb-5">
                    <label
                      htmlFor="waitlist-email"
                      className="mb-1.5 block text-sm font-semibold text-[#0A0A0A]"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Email <span className="text-[#FF6B6B]">*</span>
                    </label>
                    <input
                      ref={inputRef}
                      id="waitlist-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMsg) setErrorMsg("");
                      }}
                      placeholder="you@company.com"
                      required
                      className={`w-full rounded-xl border-2 bg-[#FAFAF8] px-4 py-3 text-sm text-[#0A0A0A] placeholder-[#0A0A0A]/30 outline-none transition-all focus:shadow-[3px_3px_0_#FFE600] ${
                        errorMsg
                          ? "border-[#FF6B6B] focus:border-[#FF6B6B]"
                          : "border-[#0A0A0A]/20 focus:border-[#0A0A0A]"
                      }`}
                      style={{ fontFamily: "var(--font-body)" }}
                    />
                    {errorMsg && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-1.5 text-xs font-medium text-[#FF6B6B]"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        {errorMsg}
                      </motion.p>
                    )}
                  </div>

                  {/* Submit */}
                  <motion.button
                    type="submit"
                    disabled={status === "loading"}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full rounded-xl bg-[#FFE600] px-6 py-3.5 text-base font-bold text-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] transition-all hover:shadow-[2px_2px_0_#0A0A0A] disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {status === "loading" ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span
                          className="inline-block h-4 w-4 rounded-full border-2 border-[#0A0A0A] border-t-transparent"
                          animate={{ rotate: 360 }}
                          transition={{
                            repeat: Infinity,
                            duration: 0.6,
                            ease: "linear",
                          }}
                        />
                        Joining...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Join the Waitlist
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 20 20"
                          fill="none"
                        >
                          <path
                            d="M5 10H15M15 10L10 5M15 10L10 15"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </motion.button>

                  <p
                    className="mt-4 text-center text-xs text-[#0A0A0A]/35"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    No spam, ever. We&apos;ll only email you when your spot is
                    ready.
                  </p>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Bottom features */}
          <motion.div
            className="mt-12 flex flex-wrap items-center justify-center gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {[
              { icon: "🎥", text: "HD Video Calls" },
              { icon: "🤖", text: "AI Meeting Notes" },
              { icon: "👻", text: "Ghost Rooms" },
              { icon: "🔒", text: "End-to-End Secure" },
            ].map((feature) => (
              <div
                key={feature.text}
                className="flex items-center gap-2 rounded-full border border-[#0A0A0A]/10 bg-white/60 px-4 py-2 backdrop-blur-sm"
              >
                <span className="text-base">{feature.icon}</span>
                <span
                  className="text-xs font-medium text-[#0A0A0A]/60"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {feature.text}
                </span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Share button helper ─── */
function ShareButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#0A0A0A]/20 bg-white transition-colors hover:border-[#0A0A0A] hover:bg-[#FFE600]"
      aria-label={label}
      title={label}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0A0A0A"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
    </motion.button>
  );
}
