/**
 * Preset registry for the heartbeat loop.
 *
 * Why a separate file:
 *   PRESETS is consulted by both `run-cycle.ts` (dispatch) and
 *   `index.ts` (startup banner — "Preset: <name> (<key>)"). Keeping it
 *   in run-cycle.ts would force main() to import the dispatcher just to
 *   read a human label, which inverts the dependency: main owns
 *   startup, run-cycle owns dispatch.
 *
 * Why TRADER_PLACEHOLDER exists:
 *   The trader preset does not use the generic `generateSteps()` flow —
 *   it runs `runTraderCycle` which builds prompts on-the-fly from live
 *   on-chain balances. The placeholder satisfies the `Preset` shape
 *   only so the registry stays uniform and `PRESETS[config.preset].name`
 *   still works for logging. `runCycle` short-circuits the trader path
 *   before generateSteps is ever called.
 */

import { researchPreset } from '../presets/research.js';
import { contentPreset } from '../presets/content.js';
import { analysisPreset } from '../presets/analysis.js';
import type { Preset } from '../presets/types.js';
import type { PresetName } from '../config.js';

const TRADER_PLACEHOLDER: Preset = {
  name: 'Pado Trader Agent',
  description: 'Autonomous NBTC/NUSDC trading on Pado DeepBook v3',
  generateSteps: () => [{ prompt: '', category: 'ai_inference' }],
};

export const PRESETS: Record<PresetName, Preset> = {
  research: researchPreset,
  content: contentPreset,
  analysis: analysisPreset,
  trader: TRADER_PLACEHOLDER,
};
