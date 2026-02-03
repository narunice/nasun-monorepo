/**
 * QuickAmountButtons
 * Pre-set USD amount buttons for quick trading in Simple mode
 */

interface QuickAmountButtonsProps {
  onSelect: (usdAmount: number) => void;
  maxBalance?: number;
  disabled?: boolean;
  selectedAmount?: number;
}

const QUICK_AMOUNTS = [50, 100, 250, 500];

export function QuickAmountButtons({
  onSelect,
  maxBalance,
  disabled,
  selectedAmount,
}: QuickAmountButtonsProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {QUICK_AMOUNTS.map((amount) => (
        <button
          key={amount}
          onClick={() => onSelect(amount)}
          disabled={disabled || (maxBalance !== undefined && amount > maxBalance)}
          className={`py-2 px-1 text-sm xl:text-base font-medium rounded transition-colors ${
            selectedAmount === amount
              ? 'bg-pd1 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          ${amount}
        </button>
      ))}
      <button
        onClick={() => maxBalance && onSelect(maxBalance)}
        disabled={disabled || !maxBalance || maxBalance <= 0}
        className={`py-2 px-1 text-sm xl:text-base font-medium rounded transition-colors ${
          selectedAmount === maxBalance
            ? 'bg-pd1 text-white'
            : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        Max
      </button>
    </div>
  );
}
