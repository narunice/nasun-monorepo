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
    icon: '📝',
    title: 'Write a story',
    description: 'about a robot discovering emotions',
    prompt: 'Write a short story about a robot that discovers it can feel emotions for the first time.',
  },
  {
    icon: '💡',
    title: 'Brainstorm ideas',
    description: 'for a mobile app startup',
    prompt: 'Brainstorm 5 innovative mobile app ideas that could solve everyday problems.',
  },
  {
    icon: '🔍',
    title: 'Explain a concept',
    description: 'like quantum computing',
    prompt: 'Explain quantum computing in simple terms that a high school student could understand.',
  },
  {
    icon: '🧮',
    title: 'Help with code',
    description: 'debug or write a function',
    prompt: 'Write a TypeScript function that checks if a string is a valid palindrome, ignoring spaces and punctuation.',
  },
];

interface WelcomeScreenProps {
  onSuggestionClick: (prompt: string) => void;
}

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Logo/Icon */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-baram-1 to-baram-2 flex items-center justify-center mb-6">
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
      <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2 text-center">
        Private AI with TEE Protection
      </h2>
      <p className="text-[var(--color-text-secondary)] text-center max-w-md mb-8">
        Your prompts are encrypted and processed inside a Trusted Execution Environment.
        No one can see what you ask.
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
    </div>
  );
}
