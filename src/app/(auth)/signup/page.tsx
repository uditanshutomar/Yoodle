"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { YoodleMascotSmall } from "@/components/YoodleMascot";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function SignupPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google?redirect=/dashboard");
      const data = await res.json();

      if (res.ok && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        toast.error(data.message || "Failed to start Google sign-up.");
        setLoading(false);
      }
    } catch {
      toast.error("Network error. Please try again.");
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7C3AED]/20 border-2 border-[#0A0A0A]">
                <YoodleMascotSmall className="h-10 w-10" />
              </div>
            </motion.div>
            <div>
              <h1
                className="text-2xl font-black text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Join the vibe
              </h1>
              <p
                className="text-sm text-[#0A0A0A]/60"
                style={{ fontFamily: "var(--font-body)" }}
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
              className="text-xs text-[#0A0A0A]/40 text-center leading-relaxed"
              style={{ fontFamily: "var(--font-body)" }}
            >
              By signing up, you&apos;ll connect your Google Workspace so Yoodle
              can help with your emails, calendar, docs, and everything else.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-[#0A0A0A]/10 text-center">
            <p
              className="text-sm text-[#0A0A0A]/60"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Already vibing?{" "}
              <Link
                href="/login"
                className="font-bold text-[#7C3AED] hover:underline"
                style={{ fontFamily: "var(--font-heading)" }}
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
