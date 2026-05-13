/**
 * WelcomeScreen - Empty state with welcome message and suggestions
 */

import { SuggestionCard } from './SuggestionCard';

interface Suggestion {
  icon: string;
  title: string;
  description: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: '\u{1F512}',
    title: 'Private analysis',
    description: 'encrypted end-to-end, processed in TEE',
    prompt: 'Analyze the following confidential business strategy and highlight potential risks: ...',
  },
  {
    icon: '\u{1F6E1}',
    title: 'Verifiable AI output',
    description: 'every response gets on-chain proof',
    prompt: 'Summarize the key risks of smart contract upgrades and explain how on-chain audit trails improve accountability.',
  },
  {
    icon: '\u{1F916}',
    title: 'Agent-ready inference',
    description: 'trustless execution for AI agents',
    prompt: 'How can autonomous AI agents use on-chain execution reports to prove their actions were legitimate?',
  },
  {
    icon: '\u{1F4CB}',
    title: 'Execution reports',
    description: 'tamper-proof execution history',
    prompt: 'What are the regulatory benefits of recording AI inference metadata on a public blockchain?',
  },
];

interface WelcomeScreenProps {
  onSuggestionClick: (prompt: string) => void;
}

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Logo/Icon */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-br-1 to-br-2 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      </div>

      {/* Welcome Text */}
      <h2 className="text-2xl lg:text-3xl font-semibold text-[var(--color-text-primary)] mb-2 text-center">
        AI Inference with Cryptographic Proof
      </h2>
      <p className="text-[var(--color-text-secondary)] text-center max-w-md mb-8">
        Every request is processed in hardware isolation.
        Every response gets a tamper-proof execution report on-chain.
      </p>

      {/* Suggestion Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
        {SUGGESTIONS.map((suggestion, index) => (
          <SuggestionCard
            key={index}
            icon={suggestion.icon}
            title={suggestion.title}
            description={suggestion.description}
            onClick={() => onSuggestionClick(suggestion.prompt)}
          />
        ))}
      </div>

      {/* Why Private? callout */}
      <div className="mt-6 p-4 bg-br-1/5 border border-br-1/20 rounded-xl max-w-lg mx-auto">
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Why does this matter?
        </p>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Regular AI providers can read, store, and train on your prompts.
          Nasun AI processes inference inside a Trusted Execution Environment
          and records every execution as an on-chain Execution Report —
          a verifiable record that no party can tamper with.
        </p>
      </div>
    </div>
  );
}
