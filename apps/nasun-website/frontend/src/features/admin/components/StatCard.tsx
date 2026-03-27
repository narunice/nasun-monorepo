export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-nasun-dark-700/70 border border-nasun-dark-500/45 rounded-lg p-4">
      <p className="text-nasun-white/70 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-nasun-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-nasun-white/60 text-xs mt-1">{sub}</p>}
    </div>
  );
}
