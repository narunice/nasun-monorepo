export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-nasun-dark-700/50 border border-nasun-dark-500/30 rounded-lg p-4">
      <p className="text-nasun-white/50 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-nasun-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-nasun-white/40 text-xs mt-1">{sub}</p>}
    </div>
  );
}
