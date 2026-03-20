"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { YoodleMascotSmall } from "@/components/YoodleMascot";
import GoogleIcon from "@/components/icons/GoogleIcon";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google?redirect=/dashboard");

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.warn("[SignupPage] Non-JSON response from /api/auth/google:", res.status, parseErr);
        toast.error("Server returned an unexpected response. Please try again later.");
        setLoading(false);
        return;
      }

      if (res.ok && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        toast.error(data.message || "Failed to start Google sign-up.");
        setLoading(false);
      }
    } catch (err) {
      console.error("[SignupPage] Google sign-up failed:", err);
      toast.error("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, type: "spring", stiffness: 200, damping: 25 }}
    >
      <Card className="relative overflow-hidden">
        {/* Violet accent strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#7C3AED]" />

        <div className="pt-2">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7C3AED]/20 border-2 border-[var(--border-strong)]">
                <YoodleMascotSmall className="h-10 w-10" />
              </div>
            </motion.div>
            <div>
              <h1
                className="text-2xl font-black text-[var(--text-primary)] font-heading"
              >
                Join the vibe
              </h1>
              <p
                className="text-sm text-[var(--text-secondary)] font-body"
              >
                Create your Yoodle account in one click
              </p>
            </div>
          </div>

          {/* Google Sign-Up */}
          <div className="space-y-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
              onClick={handleGoogleSignUp}
            >
              <span className="flex items-center gap-3">
                <GoogleIcon />
                Sign up with Google
              </span>
            </Button>

            <p
              className="text-xs text-[var(--text-muted)] text-center leading-relaxed font-body"
            >
              By signing up, you&apos;ll connect your Google Workspace so Yoodle
              can help with your emails, calendar, docs, and everything else.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-[var(--border)] text-center">
            <p
              className="text-sm text-[var(--text-secondary)] font-body"
            >
              Already vibing?{" "}
              <Link
                href="/login"
                className="font-bold text-[#7C3AED] hover:underline font-heading"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
