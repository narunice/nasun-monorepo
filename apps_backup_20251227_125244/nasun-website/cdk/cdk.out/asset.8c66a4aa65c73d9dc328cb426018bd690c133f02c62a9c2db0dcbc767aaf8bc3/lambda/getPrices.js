"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient_1 = require("../services/dynamoClient");
const handler = async (event) => {
    try {
        const batchResult = await dynamoClient_1.docClient.send(new lib_dynamodb_1.BatchGetCommand({
            RequestItems: {
                CryptoPrices: {
                    Keys: ["SUI", "IOTA", "ETH", "SOL"].map((coinId) => ({ coinId })),
                },
            },
        }));
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                success: true,
                data: batchResult.Responses?.CryptoPrices || [],
            }),
        };
    }
    catch (err) {
        console.error("Error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: "Internal Server Error" }),
        };
    }
};
exports.handler = handler;
