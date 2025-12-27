import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Lambda Handler Template
 * 
 * 이 템플릿을 복사하여 새로운 Lambda 함수를 생성하세요.
 * 
 * @param event - API Gateway Event (또는 다른 이벤트 타입)
 * @param context - Lambda Context
 * @returns API Gateway Response
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Lambda invoked:', {
    requestId: context.requestId,
    functionName: context.functionName,
    event: JSON.stringify(event, null, 2)
  });

  try {
    // TODO: 비즈니스 로직 구현
    const result = {
      message: 'Hello from Lambda!',
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Lambda execution error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
