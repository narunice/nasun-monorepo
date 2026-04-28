import { trackCrossAppNav, withCrossAppParam } from "../../lib/analytics";

export function Footer() {
  return (
    <>
      <footer className="hidden md:flex items-center justify-center gap-3 py-3 text-xs text-theme-text-muted border-t border-theme-border">
        <span>Powered by</span>
        <a
          href={withCrossAppParam("https://nasun.io", "pado")}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-theme-text-primary transition-colors"
          onClick={() => trackCrossAppNav("nasun", "/")}
        >
          Nasun Network
        </a>
        <span className="text-theme-border">|</span>
        <a
          href="https://x.com/Nasun_io"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-theme-text-primary transition-colors"
          aria-label="Follow Nasun on X"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        <a
          href="https://t.me/nasun_official"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-theme-text-primary transition-colors"
          aria-label="Join Nasun on Telegram"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        </a>
      </footer>
      <div className="border-t border-theme-border bg-amber-500/5">
        <div className="mx-auto max-w-5xl px-4 py-4 text-sm leading-relaxed text-amber-200/90">
          <p>
            <span className="font-semibold text-amber-200">Disclaimer.</span>{" "}
            Pado is a proof-of-concept prototype running on Nasun Devnet. It is
            not a regulated financial product, an offer to sell securities, or
            investment advice, and nothing displayed here, including prices,
            order books, P&amp;L, or yields, should be treated as such. All
            tokens, balances, and positions are test assets with no monetary
            value and cannot be redeemed or withdrawn. The devnet may be reset
            at any time without prior notice, which will erase all balances,
            open positions, orders, and trading history.
          </p>
        </div>
      </div>
    </>
  );
}
