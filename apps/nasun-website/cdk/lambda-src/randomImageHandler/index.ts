import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandler } from 'aws-lambda';

const client = new DynamoDBClient({ region: 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE = process.env.TABLE_NAME!;
const MAX_COUNTS: Record<string, number> = JSON.parse(process.env.MAX_MINT_COUNTS!);
const MAX_RETRIES = 5;

interface ImageItem {
  tier: string;
  imageUrl: string;
  mintedCount: number;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { tier } = JSON.parse(event.body || '{}');
    if (!tier || !MAX_COUNTS[tier]) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid or missing tier' }),
      };
    }

    const { Items = [] } = await docClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'tier = :t',
        ExpressionAttributeValues: { ':t': tier },
        ConsistentRead: true,
      })
    );

    let candidates = (Items as ImageItem[]).filter(
      (item) => item.mintedCount < MAX_COUNTS[tier]
    );
    if (candidates.length === 0) {
      return {
        statusCode: 410,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `${tier} images sold out` }),
      };
    }

    for (let attempt = 0; attempt < MAX_RETRIES && candidates.length > 0; attempt++) {
      const idx = Math.floor(Math.random() * candidates.length);
      const choice = candidates[idx];

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { tier, imageUrl: choice.imageUrl },
            UpdateExpression: 'SET mintedCount = mintedCount + :inc',
            ConditionExpression: 'mintedCount < :max',
            ExpressionAttributeValues: {
              ':inc': 1,
              ':max': MAX_COUNTS[tier],
            },
          })
        );

        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ imageUrl: choice.imageUrl }),
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
          candidates.splice(idx, 1);
          continue;
        }
        throw err;
      }
    }

    return {
      statusCode: 410,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: `${tier} images sold out` }),
    };
  } catch (err) {
    console.error('randomImageHandler error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
