/**
 * PriceSuggestions Component
 * 가격 입력 도우미 버튼들 (Mid, Bid, Ask, ±%)
 */

interface PriceSuggestionsProps {
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  onSelect: (price: number) => void;
}

export function PriceSuggestions({
  midPrice,
  bestBid,
  bestAsk,
  onSelect,
}: PriceSuggestionsProps) {
  const handleSelect = (price: number) => {
    if (price > 0) {
      // 소수점 2자리까지
      onSelect(Math.round(price * 100) / 100);
    }
  };

  const handlePercentage = (percent: number) => {
    if (midPrice > 0) {
      const adjusted = midPrice * (1 + percent / 100);
      handleSelect(adjusted);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {/* Price Presets */}
      <button
        onClick={() => handleSelect(midPrice)}
        disabled={!midPrice}
        className="px-2 py-1 text-xs bg-theme-bg-secondary hover:bg-theme-bg-tertiary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Current mid price"
      >
        Mid
      </button>
      <button
        onClick={() => handleSelect(bestBid)}
        disabled={!bestBid}
        className="px-2 py-1 text-xs bg-green-700/50 hover:bg-green-700 text-green-300 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Best bid price"
      >
        Bid
      </button>
      <button
        onClick={() => handleSelect(bestAsk)}
        disabled={!bestAsk}
        className="px-2 py-1 text-xs bg-red-700/50 hover:bg-red-700 text-red-300 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Best ask price"
      >
        Ask
      </button>

      {/* Separator */}
      <span className="w-px h-6 bg-theme-bg-secondary mx-1" />

      {/* Percentage Adjustments */}
      <button
        onClick={() => handlePercentage(-5)}
        disabled={!midPrice}
        className="px-2 py-1 text-xs bg-theme-bg-secondary hover:bg-theme-bg-tertiary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="5% below mid price"
      >
        -5%
      </button>
      <button
        onClick={() => handlePercentage(-1)}
        disabled={!midPrice}
        className="px-2 py-1 text-xs bg-theme-bg-secondary hover:bg-theme-bg-tertiary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="1% below mid price"
      >
        -1%
      </button>
      <button
        onClick={() => handlePercentage(1)}
        disabled={!midPrice}
        className="px-2 py-1 text-xs bg-theme-bg-secondary hover:bg-theme-bg-tertiary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="1% above mid price"
      >
        +1%
      </button>
      <button
        onClick={() => handlePercentage(5)}
        disabled={!midPrice}
        className="px-2 py-1 text-xs bg-theme-bg-secondary hover:bg-theme-bg-tertiary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="5% above mid price"
      >
        +5%
      </button>
    </div>
  );
}
