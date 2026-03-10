import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Minimal header */}
      <header className="border-b-2 border-[#0A0A0A]/10 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="flex items-center gap-1">
            <span
              className="text-xl font-black tracking-tight"
              style={{
                fontFamily: "var(--font-heading)",
                color: "#0A0A0A",
                textShadow: "2px 2px 0 #FFE600",
              }}
            >
              Yoodle
            </span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12 lg:px-8">
        {children}
      </main>

      {/* Minimal footer */}
      <footer className="border-t-2 border-[#0A0A0A]/10 px-6 py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between text-sm text-[#0A0A0A]/40">
          <span style={{ fontFamily: "var(--font-body)" }}>
            &copy; {new Date().getFullYear()} Yoodle
          </span>
          <div className="flex gap-4" style={{ fontFamily: "var(--font-body)" }}>
            <Link href="/privacy" className="hover:text-[#0A0A0A]/70 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[#0A0A0A]/70 transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
