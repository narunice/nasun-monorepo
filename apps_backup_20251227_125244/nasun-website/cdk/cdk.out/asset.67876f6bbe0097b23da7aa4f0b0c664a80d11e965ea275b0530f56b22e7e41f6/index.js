"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(index_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var client = new import_client_dynamodb.DynamoDBClient({ region: "ap-northeast-2" });
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(client);
var TABLE_NAME = "CryptoBackupPrices";
var corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,OPTIONS"
};
var handler = async () => {
  try {
    const data = await docClient.send(new import_lib_dynamodb.ScanCommand({ TableName: TABLE_NAME }));
    const prices = {};
    for (const item of data.Items ?? []) {
      prices[item.coinId] = {
        usd: item.usd,
        updatedAt: item.updatedAt
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify(prices),
      headers: corsHeaders
    };
  } catch (err) {
    console.error("Error reading DynamoDB:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch backup prices" }),
      headers: corsHeaders
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
