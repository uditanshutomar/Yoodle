export default function MeetingsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="h-8 w-48 rounded-lg bg-[var(--border)] animate-pulse mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
