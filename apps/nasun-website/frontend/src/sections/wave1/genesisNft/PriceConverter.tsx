import React from "react";
import { useCoinPrice } from "../../../hooks/PayAndMintNFT/useCoinPrice";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Button } from "@/components/ui/button";

interface PriceConverterProps {
  usdPrice: number;
}

const DATA_SOURCE_INFO: Record<string, { name: string; url: string }> = {
  coingecko: {
    name: "CoinGecko",
    url: "https://www.coingecko.com/",
  },
  coinmarketcap: {
    name: "CoinMarketCap",
    url: "https://coinmarketcap.com/",
  },
};

function PriceConverterComponent({ usdPrice }: PriceConverterProps) {
  const { currentPrice, loading, error, dataSource } = useCoinPrice();

  const formatAmount = (amount: number) => {
    if (amount === 0) return "0";
    if (amount < 0.0001) return amount.toExponential(4);
    const integerLength = Math.max(0, Math.floor(Math.log10(amount))) + 1;
    const decimals = Math.min(Math.max(6 - integerLength, 4), 8);
    return amount.toFixed(decimals);
  };

  if (error) {
    return <p className="my-3 p-2 bg-red-900 rounded-lg text-sm">Price data unavailable</p>;
  }

  if (loading) {
    return (
      <p className="my-3 p-2 bg-gray-800 rounded-lg text-sm animate-pulse">
        Loading conversion rate...
      </p>
    );
  }

  return (
    <div className="my-3 px-4">
      <div className="flex justify-between items-center">
        <span className="text-base md:text-lg lg:text-xl">${usdPrice.toLocaleString()} USD</span>
        <span className="font-medium flex items-center">
          ≈ {formatAmount(usdPrice / currentPrice)} SUI
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-1 h-5 w-5 text-gray-500 hover:text-gray-700"
              >
                <InfoCircledIcon className="w-3 h-3 text-gray-300" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="px-2 py-1 rounded-lg text-xs shadow-lg bg-gray-300 text-nasun-black/70 border border-gray-500"
                sideOffset={5}
              >
                Price converted to token value refreshes automatically every minute.
                {dataSource === "coinmarketcap" && (
                  <span className="block mt-1 text-yellow-400">
                    Using backup data source (CoinMarketCap)
                  </span>
                )}
                <Tooltip.Arrow className="fill-gray-300" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </span>
      </div>

      <div className="text-gray-400">
        <div className="flex flex-col w-full items-end">
          <span className="text-xs text-gray-400">
            Data provided by{" "}
            <a
              href={DATA_SOURCE_INFO[dataSource].url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center font-semibold hover:underline"
            >
              {DATA_SOURCE_INFO[dataSource].name}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3 ml-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}

export const PriceConverter = React.memo(PriceConverterComponent);
