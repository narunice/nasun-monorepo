"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePricesInDynamo = updatePricesInDynamo;
// src/jobs/priceUpdater.ts
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient_1 = require("../services/dynamoClient");
const priceFetcher_1 = require("../services/priceFetcher");
const TABLE_NAME = "CryptoPrices";
async function updatePricesInDynamo() {
    const prices = await (0, priceFetcher_1.fetchCryptoPrices)(); // e.g. { SUI: {...}, ETH: {...}, ... }
    const coinIds = ["SUI", "IOTA", "ETH", "SOL"];
    await Promise.all(coinIds.map(async (coinId) => {
        const coinPriceData = prices[coinId];
        if (!coinPriceData) {
            console.warn(`⚠️ No data found for coin ${coinId}`);
            return;
        }
        // DynamoDB에 저장할 때 TTL 설정
        const TTL_DURATION_SECONDS = 30 * 60; // 30분간 유효
        await dynamoClient_1.docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLE_NAME,
            Item: {
                coinId,
                usd: coinPriceData.usd,
                updatedAt: coinPriceData.updatedAt,
                ttl: Math.floor(Date.now() / 1000) + TTL_DURATION_SECONDS,
            },
        }));
    }));
    console.log("✅ Updated prices in DynamoDB");
}
