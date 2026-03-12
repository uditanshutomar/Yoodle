export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="h-10 w-64 rounded-lg bg-[#0A0A0A]/10 animate-pulse mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 rounded-xl border-2 border-[#0A0A0A]/10 bg-white animate-pulse" />
        <div className="h-96 rounded-xl border-2 border-[#0A0A0A]/10 bg-white animate-pulse" />
      </div>
    </div>
  );
}
