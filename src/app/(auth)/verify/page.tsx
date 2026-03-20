"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Button from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

function VerifyContent() {
  // useSearchParams() triggers the Suspense boundary for client navigation
  useSearchParams();
  const router = useRouter();
  const { refreshSession } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // With Google OAuth, this page is mostly a redirect handler.
    // The actual auth happens via /api/auth/google/callback.
    // If we reach here, check if user is already authenticated.
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout>;

    const COOKIE_SETTLE_DELAY_MS = 500;
    const REDIRECT_DELAY_MS = 1500;

    const checkAuth = async () => {
      try {
        await refreshSession();
        if (!cancelled) {
          setStatus("success");
          redirectTimer = setTimeout(() => {
            router.push("/dashboard");
          }, REDIRECT_DELAY_MS);
        }
      } catch (err) {
        console.warn("[VerifyPage] Auth check failed:", err);
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Authentication not complete. Please sign in with Google.");
        }
      }
    };

    // Small delay to allow cookies to be set from callback redirect
    const timer = setTimeout(checkAuth, COOKIE_SETTLE_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(redirectTimer);
    };
    // searchParams intentionally omitted — not read inside the effect
  }, [router, refreshSession]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="text-center py-8">
        {status === "loading" && (
          <div className="space-y-4">
            <LoadingSpinner size="lg" />
            <h2
              className="text-lg font-bold text-[var(--text-primary)] font-heading"
            >
              Verifying your session...
            </h2>
            <p
              className="text-sm text-[var(--text-secondary)] font-body"
            >
              Hang tight, we&apos;re finishing up
            </p>
          </div>
        )}

        {status === "success" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <motion.div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 border-2 border-[var(--border-strong)]"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle size={32} className="text-green-600" />
            </motion.div>
            <h2
              className="text-lg font-bold text-[var(--text-primary)] font-heading"
            >
              You&apos;re in!
            </h2>
            <p
              className="text-sm text-[var(--text-secondary)] font-body"
            >
              Redirecting you to your dashboard...
            </p>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 border-2 border-[var(--border-strong)]">
              <XCircle size={32} className="text-[#FF6B6B]" />
            </div>
            <h2
              className="text-lg font-bold text-[var(--text-primary)] font-heading"
            >
              Oops, that didn&apos;t work
            </h2>
            <p
              className="text-sm text-[var(--text-secondary)] max-w-xs mx-auto font-body"
            >
              {errorMessage}
            </p>
            <Button variant="primary" size="md" href="/login">
              Try again
            </Button>
          </motion.div>
        )}
      </Card>
    </motion.div>
  );
}

function VerifyFallback() {
  return (
    <Card className="text-center py-8">
      <div className="space-y-4">
        <LoadingSpinner size="lg" />
        <h2
          className="text-lg font-bold text-[var(--text-primary)] font-heading"
        >
          Verifying...
        </h2>
      </div>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyContent />
    </Suspense>
  );
}
