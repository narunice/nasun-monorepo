import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
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
