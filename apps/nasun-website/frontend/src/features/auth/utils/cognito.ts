import { CognitoIdentityClient, GetIdCommand, GetOpenIdTokenCommand } from "@aws-sdk/client-cognito-identity";
import logger from "@/lib/logger";

export const getCognitoIdentityId = async (
  provider: "Google",
  token: string
): Promise<string | undefined> => {
  logger.debug(`Attempting to get Cognito Identity ID for provider: ${provider}`);
  const identityPoolId = import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID;
  const region = import.meta.env.VITE_AWS_REGION;

  if (provider === "Google") {
    const cognitoIdentity = new CognitoIdentityClient({ region });
    const loginKey = "accounts.google.com";
    const getIdCommand = new GetIdCommand({
      IdentityPoolId: identityPoolId,
      Logins: { [loginKey]: token },
    });
    try {
      const result = await cognitoIdentity.send(getIdCommand);
      return result.IdentityId;
    } catch (error) {
      logger.error("Failed to get Cognito Identity ID for Google.", error);
      throw error;
    }
  }
  return undefined;
};

/**
 * Get a signed OIDC token from Cognito Identity Pool for an already-authenticated identity.
 * Used for Google OAuth where GetIdCommand only returns identityId but no OIDC token.
 */
export const getCognitoOidcToken = async (
  identityId: string,
  googleIdToken: string
): Promise<string | undefined> => {
  const region = import.meta.env.VITE_AWS_REGION;

  try {
    const cognitoClient = new CognitoIdentityClient({ region });
    const result = await cognitoClient.send(
      new GetOpenIdTokenCommand({
        IdentityId: identityId,
        Logins: { "accounts.google.com": googleIdToken },
      })
    );
    return result.Token ?? undefined;
  } catch (error) {
    // GetOpenIdToken may fail if Identity Pool's Basic (Classic) Flow is disabled.
    // cognitoToken is only needed for admin API auth — regular login works without it.
    logger.debug("Failed to get Cognito OIDC token for Google.", error);
    return undefined;
  }
};
