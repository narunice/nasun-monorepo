/**
 * Content preset -- social media post generation
 *
 * Runs every 24 hours (default), 1 LLM call per cycle
 */

import type { Preset } from './types.js';

export const contentPreset: Preset = {
  name: 'Content Agent',
  description: 'Generates social media posts about AI and blockchain topics',

  generateSteps() {
    const topics = [
      'AI agents managing their own budgets on blockchain',
      'How transparent AI audit trails build trust',
      'The intersection of AI compliance and decentralized finance',
      'Why AI spending needs the same controls as corporate cards',
      'Autonomous AI agents and the future of digital labor',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    return [
      {
        prompt: [
          `You are a social media content creator specializing in AI and blockchain topics.`,
          ``,
          `Create a Twitter/X thread (3-5 tweets) about: "${topic}"`,
          ``,
          `Requirements:`,
          `- Each tweet under 280 characters`,
          `- Use a professional but engaging tone`,
          `- Include 1-2 relevant hashtags per tweet`,
          `- The thread should tell a compelling story`,
          `- No emojis unless natural for emphasis`,
          ``,
          `Format each tweet with "Tweet 1:", "Tweet 2:", etc.`,
        ].join('\n'),
        category: 'content',
      },
    ];
  },
};
