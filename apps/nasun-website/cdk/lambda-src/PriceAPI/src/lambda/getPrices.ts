import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../services/dynamoClient";

export const handler = async (event: any) => {
  try {
    const batchResult = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          CryptoPrices: {
            Keys: ["SUI", "IOTA", "ETH", "SOL"].map((coinId) => ({ coinId })),
          },
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        data: batchResult.Responses?.CryptoPrices || [],
      }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: "Internal Server Error" }),
    };
  }
};
