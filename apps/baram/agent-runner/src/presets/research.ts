/**
 * Research preset — AI regulation and blockchain news summary
 *
 * Runs every 30 minutes (default), 1 LLM call per cycle
 */

import type { Preset } from './types.js';

export const researchPreset: Preset = {
  name: 'AI Research Agent',
  description: 'Summarizes latest AI regulation and blockchain industry developments',

  generateSteps() {
    const date = new Date().toLocaleString('en-US');
    return [
      {
        prompt: [
          `You are an AI research agent monitoring regulatory and industry developments.`,
          `Current time: ${date}`,
          ``,
          `Provide a concise briefing (200-300 words) covering:`,
          `1. Recent AI regulation developments (EU AI Act, US executive orders, etc.)`,
          `2. Blockchain/crypto regulatory updates`,
          `3. Notable AI-blockchain integration projects`,
          `4. Key risks or opportunities identified`,
          ``,
          `Format as a structured briefing with clear sections.`,
        ].join('\n'),
        category: 'research',
      },
    ];
  },
};
