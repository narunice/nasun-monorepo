"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient_1 = require("../services/dynamoClient");
const priceFetcher_1 = require("../services/priceFetcher");
const handler = async () => {
    const prices = await (0, priceFetcher_1.fetchCryptoPrices)();
    const coinIds = ["SUI", "IOTA", "ETH", "SOL"];
    await Promise.all(coinIds.map(async (coinId) => {
        await dynamoClient_1.docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: "CryptoPrices",
            Item: {
                coinId,
                usd: prices[coinId].usd,
                updatedAt: new Date().toISOString(), // UTC 기준 ISO 문자열 형식
                ttl: Math.floor(Date.now() / 1000) + 1800, // 30분 TTL
            },
        }));
    }));
    return { statusCode: 200, body: "Prices updated" };
};
exports.handler = handler;
