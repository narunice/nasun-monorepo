/**
 * LandingScreen - Disconnected state landing with vision communication
 */

export function LandingScreen() {
  return (
    <div className="flex flex-col items-center px-4 py-4">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-baram-1 to-baram-2 flex items-center justify-center mb-4">
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
          Your Prompts, Your Eyes Only
        </h1>
        <p className="text-[var(--color-text-secondary)] max-w-lg text-sm leading-relaxed">
          End-to-end encrypted AI inference inside a hardware enclave. No logs, no training, no leaks.
        </p>
      </div>

      {/* How It Works */}
      <div className="w-full max-w-2xl mb-6">
        <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-center mb-4">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Step 1: Encrypt */}
          <div className="p-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-baram-1/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-baram-1/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
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
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-baram-1/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {[
          { label: 'AES-256-GCM Encryption', d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
          { label: 'AWS Nitro Enclaves', d: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
          { label: 'On-Chain Compliance Records', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Open Source Contracts', d: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
        ].map(({ label, d }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-full"
          >
            <svg className="w-3.5 h-3.5 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
            </svg>
            {label}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div className="text-center mb-4">
        <p className="text-sm text-[var(--color-text-muted)] mb-3">
          Connect your wallet to start a private AI session.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs text-baram-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          <span>Use the wallet button in the top right</span>
        </div>
      </div>

      {/* Community Links */}
      <div className="flex flex-wrap justify-center gap-3 pb-4">
        <a
          href="https://x.com/Nasun_io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg hover:border-baram-1/50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Twitter / X
        </a>
        {/* TODO: Replace with actual Discord invite link when created */}
        <span className="inline-flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg cursor-default">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
          </svg>
          Discord (Coming Soon)
        </span>
        <a
          href="https://nasun.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg hover:border-baram-1/50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          Nasun.io
        </a>
      </div>
    </div>
  );
}
