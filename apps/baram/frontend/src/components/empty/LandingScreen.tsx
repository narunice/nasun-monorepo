/**
 * LandingScreen - Disconnected state landing with vision communication
 */

export function LandingScreen() {
  return (
    <div className="flex flex-col items-center py-4">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-br-1 to-br-2 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--color-text-primary)] mb-3">
          Your Prompts, For Your Eyes Only
        </h1>
        <p className="text-[var(--color-text-secondary)] max-w-3xl text-sm leading-relaxed">
          End-to-end encrypted AI inference inside a hardware enclave. No logs, no training, no
          leaks.
        </p>
      </div>

      {/* How It Works */}
      <div className="w-full  mb-6">
        <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-center mb-4">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Step 1: Encrypt */}
          <div className="p-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-br-1/10 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-br-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div className="font-medium text-sm text-[var(--color-text-primary)] mb-1">
              1. Encrypt
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              Encrypted with the enclave&apos;s public key before leaving your browser.
            </p>
          </div>

          {/* Step 2: Process in TEE */}
          <div className="p-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-br-1/10 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-br-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
            </div>
            <div className="font-medium text-sm text-[var(--color-text-primary)] mb-1">
              2. Process in TEE
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              Runs inside an AWS Nitro Enclave — even the host cannot access it.
            </p>
          </div>

          {/* Step 3: Verify On-Chain */}
          <div className="p-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-br-1/10 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-br-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="font-medium text-sm text-[var(--color-text-primary)] mb-1">
              3. Verify On-Chain
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              Every request gets an Execution Report — cryptographic proof on-chain.
            </p>
          </div>
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="flex flex-wrap justify-center gap-2 mb-6 w-full">
        {[
          {
            label: "AES-256-GCM Encryption",
            d: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
          },
          {
            label: "AWS Nitro Enclaves",
            d: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
          },
          {
            label: "On-Chain Execution Reports",
            d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
          },
          { label: "Open Source Contracts", d: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
        ].map(({ label, d }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-full"
          >
            <svg
              className="w-3.5 h-3.5 text-[var(--color-text-muted)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
            </svg>
            {label}
          </span>
        ))}
      </div>

      {/* Community Links */}
      <div className="flex flex-wrap justify-center gap-3 pb-4 mt-10">
        <a
          href="https://x.com/Nasun_io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg hover:border-br-1/50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Twitter / X
        </a>

        <a
          href="https://discord.gg/nasun"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg hover:border-br-1/50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
          </svg>
          Discord
        </a>

        <a
          href="https://nasun.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg hover:border-br-1/50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
            />
          </svg>
          Nasun.io
        </a>
      </div>
    </div>
  );
}
