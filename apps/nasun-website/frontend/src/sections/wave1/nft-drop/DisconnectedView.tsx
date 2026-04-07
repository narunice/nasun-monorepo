import { motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ButtonV3 } from "@/components/ui/button-v3";

interface DisconnectedViewProps {
  isDeployed: boolean;
  isDropEnded: boolean;
}

export function DisconnectedView({ isDeployed, isDropEnded }: DisconnectedViewProps) {
  const isMobileNonMetaMask =
    typeof window !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask;

  if (!isDeployed) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="rounded-2xl border border-white/10 px-8 py-8 text-center max-w-md"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)" }}
        >
          <p className="text-nasun-white/80 text-base">Contract not deployed on this network.</p>
        </div>
      </section>
    );
  }

  if (isDropEnded) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <p className="text-nasun-white/80 text-xl font-medium">The drop has ended.</p>
          <p className="text-nasun-white/50 text-sm mt-2">Thank you for participating.</p>
        </motion.div>
      </section>
    );
  }

  return (
    <>
      <section className="min-h-[60vh] flex items-start justify-center px-4 pt-4">
        {/* Desktop / MetaMask-available: Connect Wallet card */}
        {!isMobileNonMetaMask && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full flex justify-center"
          >
            <div
              className="rounded-2xl border border-amber-400/20 px-8 py-8 text-center max-w-lg w-full"
              style={{ background: "linear-gradient(135deg, rgba(249,168,36,0.06) 0%, rgba(249,168,36,0.02) 100%)" }}
            >
              <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f9a824" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="14" rx="3" />
                  <path d="M2 10h20" />
                  <circle cx="16" cy="16" r="2" />
                </svg>
              </div>
              <p className="text-nasun-white text-lg font-semibold mb-2">Connect Your Wallet</p>
              <p className="text-nasun-white/70 text-sm mb-6 leading-relaxed max-w-[360px] mx-auto">
                Connect your Ethereum wallet to check your eligibility and mint your Genesis Pass.
              </p>
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <ButtonV3
                    variant="c1-gradient"
                    size="xl"
                    className="!px-14 !py-4 !text-lg !font-semibold !rounded-xl"
                    onClick={openConnectModal}
                  >
                    Connect Wallet
                  </ButtonV3>
                )}
              </ConnectButton.Custom>
            </div>
          </motion.div>
        )}

        {/* Mobile without MetaMask: info card */}
        {isMobileNonMetaMask && (
          <div
            className="mt-10 rounded-2xl border border-amber-400/20 px-8 py-6 text-center max-w-lg mx-auto sm:hidden"
            style={{ background: "linear-gradient(135deg, rgba(249,168,36,0.06) 0%, rgba(249,168,36,0.02) 100%)" }}
          >
            <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-7 h-7" />
            </div>
            <p className="text-nasun-white text-lg font-semibold mb-2">Open in MetaMask</p>
            <p className="text-nasun-white/70 text-sm leading-relaxed max-w-sm mx-auto">
              Tap the button at the bottom of your screen to open this page in MetaMask's built-in browser, where your wallet connects automatically.
            </p>
          </div>
        )}
      </section>

      {/* Mobile sticky bottom bar for MetaMask deep link */}
      {isMobileNonMetaMask && (
        <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden px-4 pb-4 pt-3 bg-gradient-to-t from-black via-black/95 to-transparent">
          <a
            href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`}
            className="flex items-center justify-center gap-3 w-full rounded-xl py-3 text-left transition-all"
            style={{ background: "linear-gradient(135deg, #E2761B 0%, #CD6116 100%)", color: "#fff" }}
          >
            <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0">
              <img src="/MetaMask_Fox.svg" alt="" className="w-4.5 h-4.5" />
            </span>
            <span className="flex flex-col">
              <span className="text-base font-semibold leading-tight">Open in MetaMask to Mint</span>
              <span className="text-[11px] text-white/70 leading-tight">For a better mobile minting experience</span>
            </span>
          </a>
        </div>
      )}
    </>
  );
}
