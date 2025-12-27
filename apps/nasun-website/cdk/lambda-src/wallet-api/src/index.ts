import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { getWallet } from './handlers/getWallet';
import { saveWallet } from './handlers/saveWallet';
import { deleteWallet } from './handlers/deleteWallet';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Content-Type': 'application/json'
};

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Wallet API invoked:', {
    httpMethod: event.httpMethod,
    path: event.path,
    requestContext: event.requestContext
  });

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // Extract identityId from Cognito authorizer
    const identityId = event.requestContext.authorizer?.claims?.sub;

    if (!identityId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized', message: 'No identity found in token' })
      };
    }

    // Route based on HTTP method
    switch (event.httpMethod) {
      case 'GET': {
        const wallet = await getWallet({ identityId });

        if (!wallet) {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Not Found', message: 'No wallet address found' })
          };
        }

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(wallet)
        };
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}');

        if (!body.walletAddress) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Bad Request', message: 'walletAddress is required' })
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

      case 'DELETE': {
        await deleteWallet({ identityId });

        return {
          statusCode: 204,
          headers: corsHeaders,
          body: ''
        };
      }

      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }
  } catch (error: any) {
    console.error('Error processing request:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message || 'Unknown error occurred'
      })
    };
  }
};
