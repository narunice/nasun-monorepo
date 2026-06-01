/**
 * Live alpha capacity surfaces: global queue/slot info visible to every
 * viewer (no eligibility / Genesis Pass / per-wallet gating). Fed by the
 * public capacity endpoint via useAlphaCapacity, so the numbers render the
 * same for everyone. Two flat presentational components:
 *   - AlphaCapacityBox   desktop, top of AgentsSidebar
 *   - AlphaCapacityStrip mobile, one line under AlphaNoticePanel
 *
 * Per-user position ("#X on the waitlist") intentionally stays in
 * AlphaNoticePanel; this widget is the shared, public view only.
 */

import type { AlphaCapacity } from "../alpha/alphaApiClient";

// Render only once the alpha gate is open on a migrated schema. schema_ready
// guards against a pre-migration fallback that would count exempt slots.
function gateOpen(cap: AlphaCapacity | null): cap is AlphaCapacity {
  return !!cap && cap.gate_enabled && cap.schema_ready;
}

export function AlphaCapacityBox({
  capacity,
  className,
}: {
  capacity: AlphaCapacity | null;
  className?: string;
}) {
  if (!gateOpen(capacity)) return null;
  const { used, total, queue_depth: waiting } = capacity;
  // active fills first, invited (claim-window) slots fill next; both clamped so
  // a stale used/invited > total never over-fills the meter.
  const active = Math.max(0, Math.min(used, total));
  const invited = Math.max(0, Math.min(capacity.invited ?? 0, total - active));

  return (
    <div
      className={`rounded-lg border border-uju-border/60 bg-uju-bg/40 px-3 py-2.5 text-xs space-y-2 ${
        className ?? ""
      }`}
      aria-label={`${used} of ${total} alpha slots in use, ${invited} claiming, ${waiting} waiting`}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-uju-secondary">Live testers</span>
          <span className="text-white font-medium">
            {used} / {total} slots
          </span>
        </div>
        {/* Segmented meter: active (solid) then invited/claiming (amber) then
            free. Falls back to text only for a pathologically large total. */}
        {total >= 1 && total <= 24 && (
          <div className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-[1px] ${
                  i < active
                    ? "bg-pado-2"
                    : i < active + invited
                      ? "bg-amber-400/70"
                      : "bg-uju-border/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>
      {invited > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-uju-secondary">In claim window</span>
          <span className="text-amber-300 font-medium">{invited} claiming</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-uju-secondary">Waitlist</span>
        <span className="text-white font-medium">{waiting} waiting</span>
      </div>
    </div>
  );
}

export function AlphaCapacityStrip({
  capacity,
  className,
}: {
  capacity: AlphaCapacity | null;
  className?: string;
}) {
  if (!gateOpen(capacity)) return null;
  const { used, total, queue_depth: waiting } = capacity;
  const invited = capacity.invited ?? 0;

  return (
    <div
      className={`rounded-lg border border-pado-2/30 bg-pado-2/5 px-3 py-1.5 text-xs text-uju-secondary ${
        className ?? ""
      }`}
    >
      <span className="text-white font-medium">
        {used}/{total}
      </span>{" "}
      slots{invited > 0 ? ` · ${invited} claiming` : ""} · {waiting} waiting
    </div>
  );
}
