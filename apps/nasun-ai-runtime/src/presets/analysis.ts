/**
 * Analysis preset -- 3-step sequential analysis (collect → analyze → report)
 *
 * Runs every 24 hours (default), 3 LLM calls per cycle.
 * Each step produces a separate on-chain request + AER.
 * Supports checkpointing: if step 2 fails, restart resumes from step 2.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import type { Preset, PresetStep } from './types.js';

const CHECKPOINT_FILE = 'analysis.checkpoint.json';

interface Checkpoint {
  step: number;
  results: string[];
  startedAt: string;
}

export function loadCheckpoint(): Checkpoint | null {
  if (!existsSync(CHECKPOINT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8')) as Checkpoint;
  } catch {
    return null;
  }
}

export function saveCheckpoint(checkpoint: Checkpoint): void {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
}

export function clearCheckpoint(): void {
  if (existsSync(CHECKPOINT_FILE)) {
    unlinkSync(CHECKPOINT_FILE);
  }
}

export const analysisPreset: Preset = {
  name: 'Analysis Agent',
  description: '3-step sequential analysis: data collection → analysis → executive report',

  generateSteps(previousResult?: string): PresetStep[] {
    // Step 1: Data Collection
    const step1: PresetStep = {
      prompt: [
        `You are a data collection agent. Gather and organize the following information:`,
        ``,
        `1. Current state of AI agent payment infrastructure`,
        `2. Key players and their approaches (Visa, Google, Coinbase, etc.)`,
        `3. Regulatory requirements for AI financial transactions`,
        `4. Technical challenges in AI-to-blockchain integration`,
        ``,
        `Present the raw findings in a structured format with clear categories.`,
        `Be comprehensive but factual. 400-500 words.`,
      ].join('\n'),
      category: 'analysis',
    };

    // Step 2: Analysis (uses step 1 result)
    const step2: PresetStep = {
      prompt: [
        `You are an analytical agent. Based on the collected data below, perform a thorough analysis:`,
        ``,
        `--- COLLECTED DATA ---`,
        previousResult ?? '[Step 1 data will be injected here]',
        `--- END DATA ---`,
        ``,
        `Analyze:`,
        `1. Market trends and direction`,
        `2. Competitive landscape gaps`,
        `3. Regulatory risk assessment`,
        `4. Technology maturity evaluation`,
        ``,
        `Provide clear conclusions with supporting evidence. 300-400 words.`,
      ].join('\n'),
      category: 'analysis',
    };

    // Step 3: Executive Report (uses step 2 result)
    const step3: PresetStep = {
      prompt: [
        `You are an executive report writer. Based on the analysis below, create a concise executive summary:`,
        ``,
        `--- ANALYSIS ---`,
        previousResult ?? '[Step 2 analysis will be injected here]',
        `--- END ANALYSIS ---`,
        ``,
        `Create an executive summary with:`,
        `1. Key findings (3-5 bullet points)`,
        `2. Strategic recommendations`,
        `3. Risk factors to monitor`,
        `4. Suggested next steps`,
        ``,
        `Keep it concise and actionable. 200-300 words.`,
      ].join('\n'),
      category: 'analysis',
    };

    return [step1, step2, step3];
  },
};
