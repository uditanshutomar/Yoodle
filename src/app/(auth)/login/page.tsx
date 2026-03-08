"use client";

import { Suspense, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mail, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { YoodleMascotSmall } from "@/components/YoodleMascot";
import { useAuth } from "@/hooks/useAuth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That link is invalid. Please request a new one.",
  link_expired: "Your magic link has expired. Please request a new one.",
  verification_failed: "Verification failed. Please try again.",
};

function LoginContent() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { login } = useAuth();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error && ERROR_MESSAGES[error]) {
      toast.error(ERROR_MESSAGES[error]);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    const result = await login(email);
    setLoading(false);

    if (result.success) {
      setSent(true);
      toast.success(result.message);
    } else {
      toast.error(result.message);
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[#0A0A0A]">
                <YoodleMascotSmall className="h-10 w-10 mix-blend-multiply" />
              </div>
            </motion.div>
            <div>
              <h1
                className="text-2xl font-black text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Welcome back!
              </h1>
              <p
                className="text-sm text-[#0A0A0A]/60"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Let&apos;s get you back in the vibe
              </p>
            </div>
          </div>

          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <motion.div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 border-2 border-[#0A0A0A]"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
              >
                <Mail size={28} className="text-green-600" />
              </motion.div>
              <h2
                className="text-lg font-bold text-[#0A0A0A] mb-1"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Check your inbox!
              </h2>
              <p
                className="text-sm text-[#0A0A0A]/60 mb-4"
                style={{ fontFamily: "var(--font-body)" }}
              >
                We sent a magic link to <strong>{email}</strong>
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-sm font-medium text-[#7C3AED] hover:underline cursor-pointer"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Use a different email
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                icon={Mail}
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                icon={ArrowRight}
                className="w-full"
              >
                Send Magic Link
              </Button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-[#0A0A0A]/10 text-center">
            <p
              className="text-sm text-[#0A0A0A]/60"
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
