import type {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from "aws-lambda";
import { createRemoteJWKSet, jwtVerify } from "jose";

// JWKS is cached in Lambda memory across invocations (module scope)
const JWKS = createRemoteJWKSet(
  new URL("https://cognito-identity.amazonaws.com/.well-known/jwks_uri")
);

// Cognito Identity Pool ID for audience validation
const IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;

function generatePolicy(
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  // Allow access to all methods under this API stage
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
    console.warn("No token provided in Authorization header");
    return generatePolicy("anonymous", "Deny", event.methodArn);
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "https://cognito-identity.amazonaws.com",
      audience: IDENTITY_POOL_ID,
    });

    const identityId = payload.sub;
    if (!identityId) {
      console.warn("Token missing sub claim");
      return generatePolicy("anonymous", "Deny", event.methodArn);
    }

    console.log(`Authorized: ${identityId}`);
    return generatePolicy(identityId, "Allow", event.methodArn, {
      identityId,
    });
  } catch (error: any) {
    console.warn("Token verification failed:", error.message);
    return generatePolicy("anonymous", "Deny", event.methodArn);
  }
}
