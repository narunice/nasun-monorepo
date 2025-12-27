
import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityClient, GetCredentialsForIdentityCommand } from '@aws-sdk/client-cognito-identity';

const cognitoClient = new CognitoIdentityClient({ region: process.env.AWS_REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  // Define CORS headers here to be used in all return paths
  const corsHeaders = { 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Headers': 'Content-Type,Authorization', 
    'Access-Control-Allow-Methods': 'POST,OPTIONS' 
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const { identityId } = JSON.parse(event.body || '{}');
    if (!identityId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'identityId is required' }) };
    }

    const command = new GetCredentialsForIdentityCommand({
      IdentityId: identityId,
    });

    const response = await cognitoClient.send(command);

    if (!response.Credentials) {
      throw new Error('Could not retrieve credentials from Cognito');
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration,
      }),
    };

  } catch (error: any) {
    console.error('Error getting credentials for identity:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
