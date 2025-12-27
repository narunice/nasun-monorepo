// src/services/dynamoClient.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: "ap-northeast-2", // Seoul
});
export const docClient = DynamoDBDocumentClient.from(client);
