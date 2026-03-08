"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, User, AtSign, ArrowRight } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { YoodleMascotSmall } from "@/components/YoodleMascot";
import { useAuth } from "@/hooks/useAuth";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !displayName.trim() || !email.trim()) return;

    setLoading(true);
    const result = await signup(email, name, displayName);
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
                Create your Yoodle account in seconds
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
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#7C3AED]/10 border-2 border-[#0A0A0A]"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
              >
                <Mail size={28} className="text-[#7C3AED]" />
              </motion.div>
              <h2
                className="text-lg font-bold text-[#0A0A0A] mb-1"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                You&apos;re almost in!
              </h2>
              <p
                className="text-sm text-[#0A0A0A]/60 mb-4"
                style={{ fontFamily: "var(--font-body)" }}
              >
                We sent a verification link to <strong>{email}</strong>
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
                label="Name"
                type="text"
                icon={User}
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />

              <Input
                label="Display Name"
                type="text"
                icon={AtSign}
                placeholder="coolvibes42"
                value={displayName}
                onChange={(e) =>
                  setDisplayName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())
                }
                required
              />

              <Input
                label="Email"
                type="email"
                icon={Mail}
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                icon={ArrowRight}
                className="w-full"
              >
                Create Account
              </Button>
            </form>
          )}

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
