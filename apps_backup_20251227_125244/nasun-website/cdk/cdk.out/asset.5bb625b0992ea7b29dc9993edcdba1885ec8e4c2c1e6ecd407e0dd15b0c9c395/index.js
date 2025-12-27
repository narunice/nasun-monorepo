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
var src_exports = {};
__export(src_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(src_exports);
var import_aws_sdk = require("aws-sdk");
var docClient = new import_aws_sdk.DynamoDB.DocumentClient();
var TABLE = process.env.TABLE_NAME || "";
var corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,OPTIONS"
};
var handler = async (event) => {
  console.log("\u{1F680} Received event:", JSON.stringify(event, null, 2));
  console.log("\u{1F511} Using DynamoDB table:", TABLE);
  let tier = event.pathParameters?.tier;
  if (!tier && event.pathParameters?.proxy) {
    const proxyPath = event.pathParameters.proxy;
    const parts = proxyPath.split("/");
    tier = parts[parts.length - 1];
  }
  if (!tier && event.path) {
    const pathParts = event.path.split("/").filter(Boolean);
    tier = pathParts[pathParts.length - 1];
  }
  console.log("\u{1F3F7}  Extracted tier:", tier);
  if (!tier) {
    console.error("\u274C Missing required path parameter: tier");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing tier" }),
      headers: corsHeaders
    };
  }
  try {
    console.log(`\u{1F50D} Querying DynamoDB for tier = ${tier}...`);
    const result = await docClient.query({
      TableName: TABLE,
      KeyConditionExpression: "tier = :t",
      ExpressionAttributeValues: { ":t": tier },
      ProjectionExpression: "mintedCount",
      ConsistentRead: true
    }).promise();
    console.log("\u{1F4E6} DynamoDB query.Items:", JSON.stringify(result.Items, null, 2));
    const items = result.Items || [];
    console.log(
      "\u2797 Reducing items to total mintedCount:",
      items.map((i) => i.mintedCount)
    );
    const currentCount = items.reduce(
      (sum, item) => sum + (item.mintedCount ?? 0),
      0
    );
    console.log("\u2705 Computed currentCount:", currentCount);
    return {
      statusCode: 200,
      body: JSON.stringify({ tier, currentCount }),
      headers: corsHeaders
    };
  } catch (error) {
    console.error("\u{1F4A5} getSupplyCount error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
      headers: corsHeaders
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
