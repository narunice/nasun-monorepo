import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../services/dynamoClient";
import { fetchCryptoPrices } from "../services/priceFetcher";

export const handler = async () => {
  const prices = await fetchCryptoPrices();
  const coinIds = ["SUI", "IOTA", "ETH", "SOL"] as const;

  await Promise.all(
    coinIds.map(async (coinId) => {
      await docClient.send(
        new PutCommand({
          TableName: "CryptoPrices",
          Item: {
            coinId,
            usd: prices[coinId].usd,
            updatedAt: new Date().toISOString(), // UTC 기준 ISO 문자열 형식
            ttl: Math.floor(Date.now() / 1000) + 1800, // 30분 TTL
          },
        })
      );
    })
  );

  return { statusCode: 200, body: "Prices updated" };
};
