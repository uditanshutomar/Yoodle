"use client";

import { Suspense, useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { YoodleMascotSmall } from "@/components/YoodleMascot";
import GoogleIcon from "@/components/icons/GoogleIcon";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That link is invalid. Please try again.",
  link_expired: "Your link has expired. Please try again.",
  verification_failed: "Verification failed. Please try again.",
  google_denied: "Google sign-in was cancelled. Please try again.",
  google_no_code: "Google sign-in failed. No authorization code received.",
  google_token_failed: "Google sign-in failed. Could not exchange tokens.",
  google_auth_failed: "Google sign-in failed. Please try again.",
};

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      toast.error(ERROR_MESSAGES[error] || "Something went wrong. Please try again.");
    }
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const rawRedirect = searchParams.get("redirect") || "/dashboard";
      // Validate redirect to prevent open-redirect if server-side Zod is ever relaxed
      const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes("://")
        ? rawRedirect
        : "/dashboard";
      const res = await fetch(`/api/auth/google?redirect=${encodeURIComponent(redirect)}`);

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.warn("[LoginPage] Non-JSON response from /api/auth/google:", res.status, parseErr);
        toast.error("Server returned an unexpected response. Please try again later.");
        setLoading(false);
        return;
      }

      if (res.ok && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        toast.error(data.message || "Failed to start Google sign-in.");
        setLoading(false);
      }
    } catch (err) {
      console.error("[LoginPage] Google sign-in failed:", err);
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
        {/* Yellow accent strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#FFE600]" />

        <div className="pt-2">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <motion.div
              animate={{ rotate: [0, -10, 10, -5, 0] }}
              transition={{ duration: 1.5, delay: 0.5 }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)]">
                <YoodleMascotSmall className="h-10 w-10 mix-blend-multiply" />
              </div>
            </motion.div>
            <div>
              <h1
                className="text-2xl font-black text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Welcome back!
              </h1>
              <p
                className="text-sm text-[var(--text-secondary)]"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Let&apos;s get you back in the vibe
              </p>
            </div>
          </div>

          {/* Google Sign-In */}
          <div className="space-y-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
              onClick={handleGoogleSignIn}
            >
              <span className="flex items-center gap-3">
                <GoogleIcon />
                Sign in with Google
              </span>
            </Button>

            <p
              className="text-xs text-[var(--text-muted)] text-center leading-relaxed"
              style={{ fontFamily: "var(--font-body)" }}
            >
              We&apos;ll connect your Google Workspace so Yoodle can help manage
              your emails, calendar, drive, and more.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-[var(--border)] text-center">
            <p
              className="text-sm text-[var(--text-secondary)]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              New here?{" "}
              <Link
                href="/signup"
                className="font-bold text-[#7C3AED] hover:underline"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function LoginFallback() {
  return (
    <Card className="text-center py-8">
      <LoadingSpinner size="md" />
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
