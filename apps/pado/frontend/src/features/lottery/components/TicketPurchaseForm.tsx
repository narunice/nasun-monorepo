import { useState, useCallback } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useLotteryActions } from "../hooks";
import { useToast } from "@/components/common/Toast";
import { generateQuickPick, formatNusdc } from "../lib/lottery-client";
import { MAX_NUMBER, TICKET_PRICE, NUMBERS_COUNT } from "../constants";
import type { LotteryRound } from "../types";

interface TicketPurchaseFormProps {
  round: LotteryRound;
  onPurchaseSuccess?: () => void;
}

export function TicketPurchaseForm({ round, onPurchaseSuccess }: TicketPurchaseFormProps) {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { buyTicket, isBuying, error } = useLotteryActions();
  const { showToast } = useToast();
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());

  // Detect both regular wallet and zkLogin connection
  const isConnected = isZkLoggedIn || (status === "unlocked" && !!account);
  const isRoundOpen = Date.now() < round.closeTime;
  const canPurchase =
    isConnected && isRoundOpen && selectedNumbers.size === NUMBERS_COUNT && !isBuying;

  const handleNumberClick = useCallback((num: number) => {
    setSelectedNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(num)) {
        next.delete(num);
      } else if (next.size < NUMBERS_COUNT) {
        next.add(num);
      }
      return next;
    });
  }, []);

  const handleQuickPick = useCallback(() => {
    const numbers = generateQuickPick();
    setSelectedNumbers(new Set(numbers));
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedNumbers(new Set());
  }, []);

  const handlePurchase = useCallback(async () => {
    if (!canPurchase) return;

    const numbers = [...selectedNumbers].sort((a, b) => a - b);
    showToast("Processing ticket purchase...", "info");

    const success = await buyTicket(round.id, numbers);

    if (success) {
      showToast(`Ticket purchased! Numbers: ${numbers.join(", ")}`, "success");
      setSelectedNumbers(new Set());
      onPurchaseSuccess?.();
    } else {
      showToast("Failed to purchase ticket. Check error below.", "error");
    }
  }, [canPurchase, selectedNumbers, round.id, buyTicket, onPurchaseSuccess, showToast]);

  // Generate number grid (1-32)
  const numberGrid = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1);

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          Select {NUMBERS_COUNT} Numbers
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleQuickPick}
            className="px-3 py-1 text-sm bg-theme-accent text-white rounded hover:opacity-90 transition-opacity"
          >
            Quick Pick
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:opacity-90 transition-opacity"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Number Grid */}
      <div className="grid grid-cols-8 gap-2">
        {numberGrid.map((num) => {
          const isSelected = selectedNumbers.has(num);
          return (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              disabled={!isRoundOpen}
              className={`
                aspect-square flex items-center justify-center
                text-lg font-medium rounded-lg transition-all
                ${
                  isSelected
                    ? "bg-theme-accent text-white scale-105 shadow-lg"
                    : "bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-hover"
                }
                ${!isRoundOpen ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Selected Numbers Display */}
      <div className="flex items-center gap-2">
        <span className="text-theme-text-secondary text-sm">Selected:</span>
        <div className="flex gap-1">
          {[...selectedNumbers]
            .sort((a, b) => a - b)
            .map((num) => (
              <span
                key={num}
                className="w-8 h-8 flex items-center justify-center bg-theme-accent text-white rounded-full text-sm font-medium"
              >
                {num}
              </span>
            ))}
          {Array.from({ length: NUMBERS_COUNT - selectedNumbers.size }).map((_, i) => (
            <span
              key={`empty-${i}`}
              className="w-8 h-8 flex items-center justify-center border border-dashed border-gray-500 rounded-full text-sm"
            >
              ?
            </span>
          ))}
        </div>
      </div>

      {/* Price and Purchase Button */}
      <div className="flex items-center justify-between pt-2 border-t border-theme-border">
        <div className="text-theme-text-secondary">
          <span className="text-sm">Ticket Price: </span>
          <span className="text-lg font-semibold text-theme-text-primary">
            {formatNusdc(TICKET_PRICE)} NUSDC
          </span>
        </div>
        <button
          onClick={handlePurchase}
          disabled={!canPurchase}
          className={`
            px-6 py-2 rounded-lg font-medium transition-all
            ${
              canPurchase
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-600 text-gray-400 cursor-not-allowed"
            }
          `}
        >
          {isBuying ? "Purchasing..." : "Buy Ticket"}
        </button>
      </div>

      {/* Error Display */}
      {error && <div className="text-red-500 text-sm text-center">{error}</div>}

      {/* Connection Warning */}
      {!isConnected && (
        <div className="text-yellow-500 text-sm text-center">
          Connect your wallet to purchase tickets
        </div>
      )}

      {/* Round Closed Warning */}
      {!isRoundOpen && (
        <div className="text-orange-500 text-sm text-center">
          This round is closed for ticket sales
        </div>
      )}
    </div>
  );
}
