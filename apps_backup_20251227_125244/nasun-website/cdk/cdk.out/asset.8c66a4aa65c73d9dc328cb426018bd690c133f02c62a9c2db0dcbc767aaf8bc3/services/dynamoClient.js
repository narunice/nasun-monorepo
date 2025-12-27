"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.docClient = void 0;
// src/services/dynamoClient.ts
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({
    region: "ap-northeast-2", // Seoul
});
exports.docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
