/**
 * NFT Event Withdraw Token Authorizer
 *
 * Validates Cognito Identity Pool OIDC tokens for the withdraw endpoint.
 * Reuses the same JWKS verification pattern as AdminStack's tokenAuthorizer.
 */

import type {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from "aws-lambda";
import { verifyIdentityId } from "../../../_shared/auth/dual-jwks";

function generatePolicy(
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  const arnParts = resource.split(":");
  const apiGatewayArn = arnParts[5].split("/");
  const wildcardArn = `${arnParts[0]}:${arnParts[1]}:${arnParts[2]}:${arnParts[3]}:${arnParts[4]}:${apiGatewayArn[0]}/${apiGatewayArn[1]}/*`;

  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: wildcardArn,
        },
      ],
    },
    ...(context && { context }),
  };
}

export async function handler(
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  const token = event.authorizationToken?.replace(/^Bearer\s+/i, "");

  if (!token) {
    console.warn("[nft-event-authorizer] No token in Authorization header");
    return generatePolicy("anonymous", "Deny", event.methodArn);
  }

  const identityId = await verifyIdentityId(token);
  if (!identityId) {
    console.warn("[nft-event-authorizer] Token verification failed or missing sub");
    return generatePolicy("anonymous", "Deny", event.methodArn);
  }

  console.log(`[nft-event-authorizer] Authorized: ${identityId}`);
  return generatePolicy(identityId, "Allow", event.methodArn, { identityId });
}
