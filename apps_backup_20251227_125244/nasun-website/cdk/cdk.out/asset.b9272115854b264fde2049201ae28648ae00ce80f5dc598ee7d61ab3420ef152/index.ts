import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import axios from "axios";

const CMC_API_KEY = process.env.CMC_API_KEY;
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-northeast-2" }));

export const handler = async () => {
  try {
    const prices = await fetchCMCPrices();
    await updateDynamoDB(prices);
    return { statusCode: 200, body: "Backup prices updated!" };
  } catch (error) {
    console.error("Error:", error);
    return { statusCode: 500, body: "Failed to update backup prices" };
  }
};

async function fetchCMCPrices() {
  const response = await axios.get(
    "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest",
    {
      params: { id: "20947,1720,1027,5426", convert: "USD" },
      headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY },
    }
  );
  return {
    SUI: { usd: response.data.data["20947"].quote.USD.price, updatedAt: new Date().toISOString() },
    IOTA: { usd: response.data.data["1720"].quote.USD.price, updatedAt: new Date().toISOString() },
    ETH: { usd: response.data.data["1027"].quote.USD.price, updatedAt: new Date().toISOString() },
    SOL: { usd: response.data.data["5426"].quote.USD.price, updatedAt: new Date().toISOString() },
  };
}

async function updateDynamoDB(prices: Record<string, { usd: number; updatedAt: string }>) {
  await Promise.all(
    Object.entries(prices).map(async ([coinId, data]) => {
      await dynamoClient.send(
        new PutCommand({
          TableName: "CryptoBackupPrices",
          Item: {
            coinId,
            usd: data.usd,
            updatedAt: data.updatedAt,
            ttl: Math.floor(Date.now() / 1000) + 1800, // 30분 후 만료
          },
        })
      );
    })
  );
}
