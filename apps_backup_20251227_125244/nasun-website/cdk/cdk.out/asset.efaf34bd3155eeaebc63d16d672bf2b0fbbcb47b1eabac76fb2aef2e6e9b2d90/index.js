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
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var region = process.env.AWS_REGION || "ap-northeast-2";
var ddbClient = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({ region }));
var USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";
var LEADERBOARD_TABLE = process.env.CUMULATIVE_TABLE_NAME || "nasun-leaderboard-data";
async function deleteAllCommunityMembers() {
  console.log("\u{1F5D1}\uFE0F [DELETE] \uAE30\uC874 \uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84 \uBAA9\uB85D \uC0AD\uC81C \uC2DC\uC791...");
  const queryParams = {
    TableName: LEADERBOARD_TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": "COMMUNITY_MEMBERS"
    }
  };
  const result = await ddbClient.send(new import_lib_dynamodb.QueryCommand(queryParams));
  if (!result.Items || result.Items.length === 0) {
    console.log("   \u2139\uFE0F \uC0AD\uC81C\uD560 \uD56D\uBAA9 \uC5C6\uC74C");
    return 0;
  }
  const totalItems = result.Items.length;
  console.log(`   \u{1F50D} ${totalItems}\uAC1C \uD56D\uBAA9 \uBC1C\uACAC`);
  let deletedCount = 0;
  for (let i = 0; i < totalItems; i += 25) {
    const batch = result.Items.slice(i, i + 25);
    const deleteRequests = batch.map((item) => ({
      DeleteRequest: {
        Key: {
          pk: item.pk,
          sk: item.sk
        }
      }
    }));
    await ddbClient.send(new import_lib_dynamodb.BatchWriteCommand({
      RequestItems: {
        [LEADERBOARD_TABLE]: deleteRequests
      }
    }));
    deletedCount += batch.length;
    console.log(`   \u2713 ${deletedCount}/${totalItems} \uC0AD\uC81C \uC644\uB8CC`);
  }
  console.log(`\u2705 [DELETE] \uC804\uCCB4 \uC0AD\uC81C \uC644\uB8CC: ${deletedCount}\uAC1C \uD56D\uBAA9`);
  return deletedCount;
}
async function getAllTwitterAccounts() {
  const twitterAccounts = [];
  let lastEvaluatedKey = void 0;
  let scanCount = 0;
  do {
    scanCount++;
    console.log(`\u{1F50D} [SCAN] UserProfiles \uC2A4\uCE94 \uC911... (${scanCount}\uBC88\uC9F8)`);
    const params = {
      TableName: USER_PROFILES_TABLE,
      ExclusiveStartKey: lastEvaluatedKey
    };
    const result = await ddbClient.send(new import_lib_dynamodb.ScanCommand(params));
    result.Items?.forEach((item) => {
      if (item.twitterId && item.twitterHandle) {
        twitterAccounts.push({
          twitterId: item.twitterId,
          twitterHandle: item.twitterHandle
        });
      }
    });
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  console.log(`\u2705 [SCAN] \uC2A4\uCE94 \uC644\uB8CC: ${scanCount}\uAC1C \uD398\uC774\uC9C0, ${twitterAccounts.length}\uAC1C \uACC4\uC815`);
  return twitterAccounts;
}
async function saveCommunityMembers(accounts) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  let savedCount = 0;
  for (let i = 0; i < accounts.length; i += 25) {
    const batch = accounts.slice(i, i + 25);
    console.log(`\u{1F4BE} [SAVE] ${i + 1}-${Math.min(i + 25, accounts.length)}\uBC88\uC9F8 \uACC4\uC815 \uC800\uC7A5 \uC911...`);
    const putRequests = batch.map((account) => ({
      PutRequest: {
        Item: {
          pk: "COMMUNITY_MEMBERS",
          sk: `TWITTER#${account.twitterId}`,
          twitterId: account.twitterId,
          twitterHandle: account.twitterHandle,
          lastVerified: timestamp
        }
      }
    }));
    await ddbClient.send(new import_lib_dynamodb.BatchWriteCommand({
      RequestItems: { [LEADERBOARD_TABLE]: putRequests }
    }));
    savedCount += batch.length;
    console.log(`   \u2713 ${savedCount}/${accounts.length} \uC800\uC7A5 \uC644\uB8CC`);
  }
  console.log(`\u2705 [SAVE] \uC804\uCCB4 \uC800\uC7A5 \uC644\uB8CC: ${savedCount}\uAC1C \uACC4\uC815`);
}
var handler = async () => {
  console.log("\u{1F504} [SYNC] \uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84 DB \uB3D9\uAE30\uD654 \uC2DC\uC791...");
  console.log(`\u{1F4CA} [SYNC] UserProfiles \uD14C\uC774\uBE14: ${USER_PROFILES_TABLE}`);
  console.log(`\u{1F4CA} [SYNC] Leaderboard \uD14C\uC774\uBE14: ${LEADERBOARD_TABLE}`);
  try {
    const deletedCount = await deleteAllCommunityMembers();
    const twitterAccounts = await getAllTwitterAccounts();
    console.log(`\u2705 [SYNC] ${twitterAccounts.length}\uBA85\uC758 \uD2B8\uC704\uD130 \uACC4\uC815 \uBC1C\uACAC`);
    if (twitterAccounts.length > 0) {
      await saveCommunityMembers(twitterAccounts);
      console.log("\u2705 [SYNC] \uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84 DB \uC5C5\uB370\uC774\uD2B8 \uC644\uB8CC");
    }
    console.log(`\u{1F4C8} [SYNC] \uB3D9\uAE30\uD654 \uC644\uB8CC: \uC0AD\uC81C ${deletedCount}\uBA85, \uCD94\uAC00 ${twitterAccounts.length}\uBA85`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Community members synced successfully",
        deletedCount,
        totalMembers: twitterAccounts.length,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
  } catch (error) {
    console.error("\u274C [SYNC] \uB3D9\uAE30\uD654 \uC2E4\uD328:", error);
    throw error;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
