export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="h-10 w-64 rounded-lg bg-[var(--border)] animate-pulse mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] animate-pulse" />
        <div className="h-96 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] animate-pulse" />
      </div>
    </div>
  );
}
