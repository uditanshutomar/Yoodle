"use client";

import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12">
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

      {/* Decorative corner elements */}
      <div className="pointer-events-none absolute top-8 left-8 h-16 w-16 rounded-full bg-[#FFE600]/30 blur-2xl" />
      <div className="pointer-events-none absolute bottom-8 right-8 h-20 w-20 rounded-full bg-[#7C3AED]/20 blur-2xl" />
      <div className="pointer-events-none absolute top-1/4 right-12 h-12 w-12 rounded-full bg-[#FF6B6B]/20 blur-xl" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
