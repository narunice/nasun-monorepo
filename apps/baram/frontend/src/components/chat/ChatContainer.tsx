/**
 * ChatContainer - Main chat layout container
 */

import { ReactNode } from 'react';

interface ChatContainerProps {
  header: ReactNode;
  children: ReactNode;
  inputArea: ReactNode;
}

export function ChatContainer({ header, children, inputArea }: ChatContainerProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      {header}

      {/* Main Content Area - scrollable */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>

      {/* Input Area - fixed at bottom */}
      <div className="sticky bottom-0 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {inputArea}
        </div>
      </div>
    </div>
  );
}
