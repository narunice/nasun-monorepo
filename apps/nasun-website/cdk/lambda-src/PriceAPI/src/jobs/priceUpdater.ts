// src/jobs/priceUpdater.ts
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../services/dynamoClient";
import { fetchCryptoPrices } from "../services/priceFetcher";

const TABLE_NAME = "CryptoPrices";

export async function updatePricesInDynamo() {
  const prices = await fetchCryptoPrices(); // e.g. { SUI: {...}, ETH: {...}, ... }

  const coinIds = ["SUI", "IOTA", "ETH", "SOL"] as const;

  await Promise.all(
    coinIds.map(async (coinId) => {
      const coinPriceData = prices[coinId];

      if (!coinPriceData) {
        console.warn(`⚠️ No data found for coin ${coinId}`);
        return;
      }

      // DynamoDB에 저장할 때 TTL 설정
      const TTL_DURATION_SECONDS = 30 * 60; // 30분간 유효

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            coinId,
            usd: coinPriceData.usd,
            updatedAt: coinPriceData.updatedAt,
            ttl: Math.floor(Date.now() / 1000) + TTL_DURATION_SECONDS,
          },
        })
      );
    })
  );

  console.log("✅ Updated prices in DynamoDB");
}
