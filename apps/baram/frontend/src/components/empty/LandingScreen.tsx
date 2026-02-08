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
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] mb-3">
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
              Every request gets a Compliance Record — cryptographic proof on-chain.
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
            label: "On-Chain Compliance Records",
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
