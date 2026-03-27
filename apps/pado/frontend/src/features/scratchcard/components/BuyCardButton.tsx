import { Spinner } from '../../../components/common';
import { CARD_PRICE_DISPLAY } from '../constants';

interface BuyCardButtonProps {
  onClick: () => void;
  isBuying: boolean;
  disabled?: boolean;
}

export function BuyCardButton({ onClick, isBuying, disabled }: BuyCardButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isBuying}
      className="w-full px-6 py-3 rounded-lg bg-theme-accent hover:bg-theme-accent-hover
        text-white font-semibold text-lg transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isBuying ? (
        <span className="flex items-center justify-center gap-2">
          <Spinner size="sm" />
          Purchasing...
        </span>
      ) : (
        `Buy Card - ${CARD_PRICE_DISPLAY} NUSDC`
      )}
    </button>
  );
}
