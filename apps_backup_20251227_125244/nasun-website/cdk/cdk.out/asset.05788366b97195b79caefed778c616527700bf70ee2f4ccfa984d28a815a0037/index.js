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
var import_client_cognito_identity = require("@aws-sdk/client-cognito-identity");
var USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;
var ddbClient = new import_client_dynamodb.DynamoDBClient({});
var cognitoClient = new import_client_cognito_identity.CognitoIdentityClient({});
var handler = async () => {
  console.log("[AccountPurge] Starting job to purge deactivated accounts.");
  const now = Math.floor(Date.now() / 1e3);
  let accountsToPurge = [];
  let lastEvaluatedKey = void 0;
  try {
    do {
      const scanCmd = new import_client_dynamodb.ScanCommand({
        TableName: USER_PROFILES_TABLE,
        FilterExpression: "#status = :status AND #deletionScheduledAt <= :now",
        ExpressionAttributeNames: {
          "#status": "status",
          "#deletionScheduledAt": "deletionScheduledAt"
        },
        ExpressionAttributeValues: {
          ":status": { S: "DEACTIVATED" },
          ":now": { N: String(now) }
        },
        ExclusiveStartKey: lastEvaluatedKey
      });
      const { Items, LastEvaluatedKey } = await ddbClient.send(scanCmd);
      if (Items) {
        accountsToPurge.push(...Items);
      }
      lastEvaluatedKey = LastEvaluatedKey;
    } while (lastEvaluatedKey);
    console.log(`[AccountPurge] Found ${accountsToPurge.length} accounts to purge.`);
    for (const account of accountsToPurge) {
      const identityId = account.identityId.S;
      if (!identityId)
        continue;
      try {
        const describeCmd = new import_client_cognito_identity.DescribeIdentityCommand({ IdentityId: identityId });
        const { Logins: currentLogins } = await cognitoClient.send(describeCmd);
        if (currentLogins && currentLogins.length > 0) {
          const unlinkCmd = new import_client_cognito_identity.UnlinkIdentityCommand({
            IdentityId: identityId,
            Logins: currentLogins.reduce((acc, login) => ({ ...acc, [login]: account[login]?.S || "" }), {}),
            LoginsToRemove: currentLogins
          });
          await cognitoClient.send(unlinkCmd);
          console.log(`[AccountPurge] Unlinked logins for IdentityId: ${identityId}`);
        }
        const deleteCmd = new import_client_dynamodb.DeleteItemCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId: { S: identityId } }
        });
        await ddbClient.send(deleteCmd);
        console.log(`[AccountPurge] Deleted profile from DynamoDB for IdentityId: ${identityId}`);
      } catch (error) {
        console.error(`[AccountPurge] Failed to process account ${identityId}:`, error);
      }
    }
    console.log("[AccountPurge] Job finished.");
  } catch (error) {
    console.error("[AccountPurge] Job failed with an error:", error);
    throw error;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
