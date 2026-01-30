import { useTranslation } from "react-i18next";

export function ArchitectureOnChainBar() {
  const { t } = useTranslation("baram");

  // Reuse blockchain layer items from solution.detail
  const contracts = t("solution.detail.layers.blockchain.items", { returnObjects: true }) as string[];

  return (
    <div className="bg-gradient-to-r from-nasun-c4/[0.04] to-nasun-c5/[0.06] border border-nasun-c4/20 rounded-xl p-5">
      <p className="text-nasun-c4 text-xs font-medium uppercase tracking-wider mb-3">
        {t("architecture.onChainLabel")}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {contracts.map((contract) => (
          <div
            key={contract}
            className="bg-white/70 border border-nasun-c4/10 rounded-lg px-3 py-2 text-center"
          >
            <span className="text-emerald-600 text-xs font-mono">{contract}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
