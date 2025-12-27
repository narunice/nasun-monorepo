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
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;
var ddbClient = new import_client_dynamodb.DynamoDBClient({});
var handler = async (event) => {
  console.log("[AccountDeactivation] Request received:", JSON.stringify(event, null, 2));
  const identityId = event.queryStringParameters?.identityId;
  if (!identityId) {
    console.error("[AccountDeactivation] IdentityId not found in query parameters.");
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: "Bad Request: identityId query parameter is required" })
    };
  }
  console.log(`[AccountDeactivation] Initiated for IdentityId: ${identityId}`);
  const deletionTime = Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60;
  try {
    const updateCmd = new import_client_dynamodb.UpdateItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId: { S: identityId } },
      UpdateExpression: "SET #status = :status, #deletionScheduledAt = :ts",
      ExpressionAttributeNames: {
        "#status": "status",
        "#deletionScheduledAt": "deletionScheduledAt"
      },
      ExpressionAttributeValues: {
        ":status": { S: "DEACTIVATED" },
        ":ts": { N: String(deletionTime) }
      },
      // Ensure the item exists before updating
      ConditionExpression: "attribute_exists(identityId)"
    });
    await ddbClient.send(updateCmd);
    console.log(`[AccountDeactivation] Successfully scheduled deletion for IdentityId: ${identityId}`);
    return {
      statusCode: 202,
      // Accepted
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: "Account deactivation request accepted." })
    };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      console.warn(`[AccountDeactivation] Profile not found for IdentityId: ${identityId}. Considering as success.`);
      return {
        statusCode: 202,
        // Still return Accepted, as the goal is a deleted state
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ message: "Account already deleted or does not exist." })
      };
    }
    console.error(`[AccountDeactivation] Failed for IdentityId: ${identityId}`, error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: "Internal server error during account deactivation." })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
