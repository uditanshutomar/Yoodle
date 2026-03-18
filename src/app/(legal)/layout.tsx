import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Minimal header */}
      <header className="border-b-2 border-[var(--border)] px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="flex items-center gap-1">
            <span
              className="text-xl font-black tracking-tight"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--text-primary)",
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
      <footer className="border-t-2 border-[var(--border)] px-6 py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between text-sm text-[var(--text-muted)]">
          <span style={{ fontFamily: "var(--font-body)" }}>
            &copy; {new Date().getFullYear()} Yoodle
          </span>
          <div className="flex gap-4" style={{ fontFamily: "var(--font-body)" }}>
            <Link href="/privacy" className="hover:text-[var(--text-secondary)] transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-secondary)] transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
