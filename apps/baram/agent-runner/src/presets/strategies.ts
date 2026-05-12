/**
 * Trader strategy presets — Plan C §"Agent 차별화 축" (작업 4).
 *
 * Each preset is a fixed system-prompt fragment that the trader splices into
 * the per-cycle market prompt. Because the fragment text is byte-stable for
 * a given preset id, the AER `replay.prompt_template_hash` derived from it
 * stays consistent across cycles for the same strategy + market context, so
 * decoders can verify "this AER came from preset X" without re-running the
 * model.
 *
 * Naming follows the big-picture v4 spec ("작업 4") rather than the
 * placeholder names from the C1 handoff (momentum / mean_revert / etc.) —
 * we map the C1 names to the canonical persona ids so any operator using
 * the handoff names still gets the right preset.
 */
export type StrategyPresetId =
  | 'aggressive_scalper'
  | 'conservative_dca'
  | 'mean_reversion'
  | 'trend_follower'
  | 'hold_only';

export interface StrategyPreset {
  readonly id: StrategyPresetId;
  /** Short human label for log lines / dashboard. */
  readonly label: string;
  /** Byte-stable system-prompt fragment. Do NOT include per-cycle data here. */
  readonly systemPrompt: string;
}

const PRESETS: Record<StrategyPresetId, StrategyPreset> = {
  aggressive_scalper: {
    id: 'aggressive_scalper',
    label: 'Aggressive Scalper',
    systemPrompt: [
      'Persona: aggressive scalper. Lean toward acting on short-horizon momentum.',
      'Bias: prefer BUY/SELL over HOLD when balances allow. Treat sustained drift as actionable.',
      'Risk discipline: never exceed the per-trade or daily caps the runner gives you.',
      'When unsure, choose the smaller end of the size range rather than HOLD.',
    ].join('\n'),
  },
  conservative_dca: {
    id: 'conservative_dca',
    label: 'Conservative DCA',
    systemPrompt: [
      'Persona: conservative dollar-cost averager. Slow accumulation over reaction.',
      'Bias: prefer small periodic BUYs of the base asset; rarely SELL. HOLD often.',
      'Risk discipline: cap each trade at half of the per-trade cap. Stay well below daily cap.',
      'Avoid trading on noise; explain HOLDs in the reason field.',
    ].join('\n'),
  },
  mean_reversion: {
    id: 'mean_reversion',
    label: 'Mean Reversion',
    systemPrompt: [
      'Persona: mean-reversion trader. Fade extremes, fade chasing.',
      'Bias: BUY into deep drawdowns, SELL into stretched rallies, HOLD when range-bound.',
      'Risk discipline: scale size with the deviation from your reference; never max-out on a single signal.',
      'If recent trades show repeated direction, lean against them rather than with them.',
    ].join('\n'),
  },
  trend_follower: {
    id: 'trend_follower',
    label: 'Trend Follower',
    systemPrompt: [
      'Persona: trend follower. Add to confirmed direction, cut on reversal signs.',
      'Bias: BUY when recent action and balances suggest sustained uptrend; SELL on confirmed reversal.',
      'Risk discipline: increase size only when prior trades validated the trend. Otherwise default to HOLD.',
      'A single contrarian candle is not a reversal; require persistence.',
    ].join('\n'),
  },
  hold_only: {
    id: 'hold_only',
    label: 'Hold Only',
    systemPrompt: [
      'Persona: passive holder. Never opens positions in this prototype.',
      'Bias: ALWAYS return HOLD. Use the reason field to explain market conditions briefly.',
      'Risk discipline: zero — no trades issued.',
      'This preset exists for safe smoke runs (cognition-only AERs, no on-chain swap).',
    ].join('\n'),
  },
};

/** Legacy preset names accepted by the C1 handoff prose. They alias to
 *  canonical ids so existing operator notes keep working without forcing a
 *  config rename pass. */
const ALIASES: Record<string, StrategyPresetId> = {
  momentum: 'trend_follower',
  mean_revert: 'mean_reversion',
  range_bound: 'mean_reversion',
};

export function resolveStrategyPreset(raw: string | undefined): StrategyPreset {
  const fallback = PRESETS.conservative_dca;
  if (!raw) return fallback;
  const key = raw.trim().toLowerCase();
  if (key in PRESETS) return PRESETS[key as StrategyPresetId];
  if (key in ALIASES) return PRESETS[ALIASES[key]];
  return fallback;
}

export function listStrategyPresets(): StrategyPreset[] {
  return Object.values(PRESETS);
}
