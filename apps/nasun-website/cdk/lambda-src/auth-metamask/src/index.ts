import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleChallenge } from './handlers/challenge';
import { handleVerify } from './handlers/verify';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const path = event.path || event.resource || '';

    if (path.includes('/challenge')) {
      return await handleChallenge(event, corsHeaders);
    } else if (path.includes('/verify')) {
      return await handleVerify(event, corsHeaders);
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Not Found' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
