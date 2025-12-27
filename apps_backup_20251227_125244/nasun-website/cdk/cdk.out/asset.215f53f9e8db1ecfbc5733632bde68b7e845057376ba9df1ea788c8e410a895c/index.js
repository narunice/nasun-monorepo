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

// src/handlers/getWallet.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var client = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(client);
async function getWallet(request) {
  const tableName = process.env.USER_PROFILES_TABLE;
  if (!tableName) {
    throw new Error("USER_PROFILES_TABLE environment variable not set");
  }
  console.log("Getting wallet for identityId:", request.identityId);
  try {
    const result = await docClient.send(new import_lib_dynamodb.GetCommand({
      TableName: tableName,
      Key: {
        identityId: request.identityId
      }
    }));
    if (!result.Item || !result.Item.walletAddress) {
      console.log("No wallet address found for identityId:", request.identityId);
      return null;
    }
    return {
      identityId: result.Item.identityId,
      walletAddress: result.Item.walletAddress,
      blockchain: result.Item.blockchain,
      createdAt: result.Item.walletCreatedAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: result.Item.walletUpdatedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    console.error("Error getting wallet:", error);
    throw error;
  }
}

// src/handlers/saveWallet.ts
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb2 = require("@aws-sdk/lib-dynamodb");
var client2 = new import_client_dynamodb2.DynamoDBClient({});
var docClient2 = import_lib_dynamodb2.DynamoDBDocumentClient.from(client2);
async function saveWallet(request) {
  const tableName = process.env.USER_PROFILES_TABLE;
  if (!tableName) {
    throw new Error("USER_PROFILES_TABLE environment variable not set");
  }
  console.log("Saving wallet for identityId:", request.identityId);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const result = await docClient2.send(new import_lib_dynamodb2.UpdateCommand({
      TableName: tableName,
      Key: {
        identityId: request.identityId
      },
      UpdateExpression: "SET walletAddress = :wallet, blockchain = :blockchain, walletUpdatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":wallet": request.walletAddress,
        ":blockchain": request.blockchain || "sui",
        ":updatedAt": now
      },
      ReturnValues: "ALL_NEW"
    }));
    return {
      identityId: result.Attributes.identityId,
      walletAddress: result.Attributes.walletAddress,
      blockchain: result.Attributes.blockchain,
      createdAt: result.Attributes.walletCreatedAt || now,
      updatedAt: result.Attributes.walletUpdatedAt
    };
  } catch (error) {
    console.error("Error saving wallet:", error);
    throw error;
  }
}

// src/handlers/deleteWallet.ts
var import_client_dynamodb3 = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb3 = require("@aws-sdk/lib-dynamodb");
var client3 = new import_client_dynamodb3.DynamoDBClient({});
var docClient3 = import_lib_dynamodb3.DynamoDBDocumentClient.from(client3);
async function deleteWallet(request) {
  const tableName = process.env.USER_PROFILES_TABLE;
  if (!tableName) {
    throw new Error("USER_PROFILES_TABLE environment variable not set");
  }
  console.log("Deleting wallet for identityId:", request.identityId);
  try {
    await docClient3.send(new import_lib_dynamodb3.UpdateCommand({
      TableName: tableName,
      Key: {
        identityId: request.identityId
      },
      UpdateExpression: "REMOVE walletAddress, blockchain, walletCreatedAt, walletUpdatedAt"
    }));
    console.log("Wallet deleted successfully for identityId:", request.identityId);
  } catch (error) {
    console.error("Error deleting wallet:", error);
    throw error;
  }
}

// src/index.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Content-Type": "application/json"
};
var handler = async (event, context) => {
  console.log("Wallet API invoked:", {
    httpMethod: event.httpMethod,
    path: event.path,
    requestContext: event.requestContext
  });
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    };
  }
  try {
    const identityId = event.requestContext.authorizer?.claims?.sub;
    if (!identityId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Unauthorized", message: "No identity found in token" })
      };
    }
    switch (event.httpMethod) {
      case "GET": {
        const wallet = await getWallet({ identityId });
        if (!wallet) {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Not Found", message: "No wallet address found" })
          };
        }
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(wallet)
        };
      }
      case "POST": {
        const body = JSON.parse(event.body || "{}");
        if (!body.walletAddress) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Bad Request", message: "walletAddress is required" })
          };
        }
        const wallet = await saveWallet({
          identityId,
          walletAddress: body.walletAddress,
          blockchain: body.blockchain
        });
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(wallet)
        };
      }
      case "DELETE": {
        await deleteWallet({ identityId });
        return {
          statusCode: 204,
          headers: corsHeaders,
          body: ""
        };
      }
      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error.message || "Unknown error occurred"
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
