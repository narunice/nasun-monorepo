import { Link } from "react-router-dom";
import { useMarkets } from "../../prediction";
import { calculateProbabilityFromOrderbook } from "../../prediction/types";

function LoadingCard() {
  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <div className="animate-pulse">
        <div className="h-4 bg-theme-bg-tertiary rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-16 bg-theme-bg-tertiary rounded" />
          <div className="h-16 bg-theme-bg-tertiary rounded" />
        </div>
      </div>
    </div>
  );
}

interface MarketRowProps {
  question: string;
  category: string;
  yesProbability: number;
}

function MarketRow({ question, category, yesProbability }: MarketRowProps) {
  const noProbability = 100 - yesProbability;

  const cryptoSymbol = category === "crypto" ? extractCryptoSymbol(question) : null;
  const stockTicker = category === "finance" ? extractStockTicker(question) : null;

  // Dynamic Icon Logic - Larger scale for the new layout
  const renderIcon = () => {
    if (cryptoSymbol && hasIcon(cryptoSymbol)) {
      return (
        <img
          src={`/crypto-icons/${cryptoSymbol.toLowerCase()}.svg`}
          alt={cryptoSymbol}
          className="w-10 h-10 drop-shadow-sm"
        />
      );
    }

    if (stockTicker && hasStockIcon(stockTicker)) {
      return (
        <img
          src={`/stock-icons/${stockTicker}.svg`}
          alt={stockTicker}
          className="w-10 h-10 object-contain drop-shadow-sm"
        />
      );
    }

    // Category-based fallback icons (larger)
    switch (category?.toLowerCase()) {
      case "crypto":
        return (
          <svg
            className="w-8 h-8 text-yellow-500 opacity-80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "politics":
        return (
          <svg
            className="w-8 h-8 text-blue-500 opacity-80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        );
      case "sports":
        return (
          <svg
            className="w-8 h-8 text-green-500 opacity-80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2 2 2 0 012 2v.657M7 20h11a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v11a2 2 0 002 2z"
            />
          </svg>
        );
      case "finance":
        return (
          <svg
            className="w-8 h-8 text-indigo-500 opacity-80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-8 h-8 text-theme-text-muted opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        );
    }
  };

  return (
    <div className="group flex items-start gap-4 p-3 -mx-1 rounded-lg hover:bg-theme-bg-tertiary transition-colors cursor-pointer">
      {/* Icon Column - No container, direct symbol display */}
      <div className="w-12 h-12 shrink-0 flex items-center justify-center">
        {renderIcon()}
      </div>

      {/* Content Column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm xl:text-base font-medium text-theme-text-secondary line-clamp-1 flex-1">
            {question}
          </p>
          <svg
            className="w-4 h-4 shrink-0 text-theme-text-muted hidden group-hover:block"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[10px] xl:text-xs min-w-[30px]">
            <span className="text-green-500 font-bold">
              {Math.round(yesProbability)}%
            </span>
          </div>
          <div className="flex-1">
            <div className="h-1.5 bg-red-500/10 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500"
                style={{ width: `${yesProbability}%` }}
              />
              <div
                className="h-full bg-red-500"
                style={{ width: `${noProbability}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] xl:text-xs min-w-[30px] text-right">
            <span className="text-red-500 font-bold">
              {Math.round(noProbability)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PredictionHighlight() {
  const { markets, isLoading } = useMarkets();

  if (isLoading) {
    return <LoadingCard />;
  }

  if (markets.length === 0) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <h2 className="font-bold text-theme-text-primary mb-1">
          Prediction Markets
        </h2>
        <p className="text-xs xl:text-sm text-theme-text-muted mb-3">
          Predict future events and earn rewards
        </p>
        <span className="text-sm xl:text-base text-theme-text-muted cursor-not-allowed font-medium">
          Explore Markets &rarr;
        </span>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-theme-text-primary">
          Prediction Markets
        </h2>
        <Link
          to="/predict"
          className="text-xs xl:text-sm text-pd3 hover:text-pd3/80 transition-colors"
        >
          View All →
        </Link>
      </div>
      <p className="text-xs xl:text-sm text-theme-text-muted mb-4">
        Predict future events and earn rewards
      </p>

      <div className="flex-1 flex flex-col justify-around">
        {markets.slice(0, 3).map(({ market, yesOrderbook, noOrderbook }) => {
          const { yesProbability } = calculateProbabilityFromOrderbook(
            yesOrderbook,
            noOrderbook,
          );
          return (
            <Link key={market.id} to={`/predict/${market.id}`} className="block">
              <MarketRow
                question={market.question}
                category={market.category}
                yesProbability={yesProbability}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Utility functions copied from MarketCard for consistency
function extractCryptoSymbol(question: string): string | null {
  const paren = question.match(/\(([A-Z]{2,6})\/[A-Z]{2,5}\)/);
  if (paren) return paren[1];
  const match = question.match(/Will\s+([A-Z]{2,6})(?:\/|\s)/);
  return match ? match[1] : null;
}

function extractStockTicker(question: string): string | null {
  const match = question.match(/\(([A-Z0-9.\-]{1,20})\)/);
  return match ? match[1] : null;
}

const STOCK_ICON_TICKERS = new Set(["AAPL", "NVDA", "005930.KS"]);
function hasStockIcon(ticker: string): boolean {
  return STOCK_ICON_TICKERS.has(ticker);
}

const ICON_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "MATIC",
  "LINK",
  "DOT",
  "UNI",
  "ATOM",
  "LTC",
  "BCH",
  "XLM",
  "TRX",
  "ALGO",
]);
function hasIcon(symbol: string): boolean {
  return ICON_SYMBOLS.has(symbol.toUpperCase());
}
