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
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshSession } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      // Defer state update to next tick to satisfy React strict mode
      const timer = setTimeout(() => {
        setStatus("error");
        setErrorMessage("No verification token found. Try logging in again.");
      }, 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.ok) {
          setStatus("success");
          await refreshSession();
          setTimeout(() => {
            router.push("/dashboard");
          }, 1500);
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setErrorMessage(data.message || "Verification failed. The link may have expired.");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Something went wrong. Please try again.");
        }
      }
    };

    verify();

    return () => { cancelled = true; };
  }, [searchParams, router, refreshSession]);

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
              className="text-lg font-bold text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Checking your link...
            </h2>
            <p
              className="text-sm text-[#0A0A0A]/60"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Hang tight, we&apos;re verifying your magic link
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
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 border-2 border-[#0A0A0A]"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle size={32} className="text-green-600" />
            </motion.div>
            <h2
              className="text-lg font-bold text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              You&apos;re in!
            </h2>
            <p
              className="text-sm text-[#0A0A0A]/60"
              style={{ fontFamily: "var(--font-body)" }}
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
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 border-2 border-[#0A0A0A]">
              <XCircle size={32} className="text-[#FF6B6B]" />
            </div>
            <h2
              className="text-lg font-bold text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Oops, that didn&apos;t work
            </h2>
            <p
              className="text-sm text-[#0A0A0A]/60 max-w-xs mx-auto"
              style={{ fontFamily: "var(--font-body)" }}
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
          className="text-lg font-bold text-[#0A0A0A]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Checking your link...
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
