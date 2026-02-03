/**
 * TradingToggles
 * Compact toggle bar for One-Click Trading and Auto Deposit settings.
 * Displayed next to MarketInfoBar in Pro mode, grid-aligned with the Order Form column.
 */

import { useState, useCallback } from "react";
import { useOrderForm } from "../context/OrderFormContext";
import { useOrderActions } from "../hooks/useOrderActions";

export function TradingToggles() {
  const { oneClickEnabled, setOneClickEnabled, autoDepositEnabled, setAutoDepositEnabled } =
    useOrderForm();
  const { isAutoDepositing } = useOrderActions();

  // One-Click warning modal state
  const [showWarning, setShowWarning] = useState(false);

  const handleOneClickToggle = useCallback(() => {
    if (oneClickEnabled) {
      setOneClickEnabled(false);
      return;
    }
    // Check if user already acknowledged the warning
    try {
      if (localStorage.getItem("pado:oneClickAcknowledged") === "true") {
        setOneClickEnabled(true);
        return;
      }
    } catch {
      /* ignore */
    }
    setShowWarning(true);
  }, [oneClickEnabled, setOneClickEnabled]);

  const confirmOneClick = useCallback(() => {
    setOneClickEnabled(true);
    setShowWarning(false);
    try {
      localStorage.setItem("pado:oneClickAcknowledged", "true");
    } catch {
      /* ignore */
    }
  }, [setOneClickEnabled]);

  return (
    <>
      <div className="bg-theme-bg-secondary rounded-lg px-3 py-1.5 h-full flex flex-col justify-center">
        {/* Toggle row */}
        <div className="flex items-center justify-between">
          {/* One-Click Toggle */}
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            title="Execute orders immediately without confirmation"
          >
            <span className="text-xs xl:text-sm text-theme-text-muted whitespace-nowrap">One-Click</span>
            <button
              onClick={handleOneClickToggle}
              className={`w-7 h-3.5 rounded-full transition-colors ${
                oneClickEnabled ? "bg-purple-500" : "bg-theme-toggle-off"
              }`}
            >
              <span
                className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                  oneClickEnabled ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>

          {/* Auto Deposit Toggle */}
          <div className="flex items-center gap-2">
            <label
              className="flex items-center gap-1.5 cursor-pointer"
              title="Automatically deposit from wallet when balance is insufficient"
            >
              <span className="text-xs xl:text-sm text-theme-text-muted whitespace-nowrap">Auto Deposit</span>
              <button
                onClick={() => setAutoDepositEnabled(!autoDepositEnabled)}
                className={`w-7 h-3.5 rounded-full transition-colors ${
                  autoDepositEnabled ? "bg-green-500" : "bg-theme-toggle-off"
                }`}
              >
                <span
                  className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                    autoDepositEnabled ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
            {isAutoDepositing && (
              <span className="text-[10px] xl:text-xs text-pd3 animate-pulse">Depositing...</span>
            )}
          </div>
        </div>

        {/* Info text row */}
        <div className="flex items-center justify-between mt-1">
          <span
            className={`text-[10px] xl:text-xs leading-tight ${oneClickEnabled ? "text-purple-400" : "text-theme-text-muted"}`}
          >
            {oneClickEnabled ? "Orders execute immediately" : "Requires confirmation"}
          </span>
          <span
            className={`text-[10px] xl:text-xs leading-tight ${
              autoDepositEnabled ? "text-theme-text-muted" : "text-orange-500 dark:text-yellow-600"
            }`}
          >
            {autoDepositEnabled ? "Auto-deposits from wallet" : "Manual deposit required"}
          </span>
        </div>
      </div>

      {/* One-Click Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-theme-bg-secondary rounded-lg p-5 max-w-sm mx-4 border border-theme-border">
            <h3 className="text-sm xl:text-base font-semibold text-theme-text-primary mb-3">
              Enable One-Click Trading
            </h3>
            <p className="text-xs xl:text-sm text-theme-text-secondary mb-4 leading-relaxed">
              Orders will execute immediately without a confirmation step. On-chain transactions
              cannot be cancelled or reversed. Make sure you review price and amount before clicking
              Buy or Sell.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowWarning(false)}
                className="flex-1 py-2 text-xs xl:text-sm font-medium rounded-lg bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmOneClick}
                className="flex-1 py-2 text-xs xl:text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
