import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

export type XChangeType = 'initial_link' | 'handle_rename' | 'account_switch' | 'unlink';

interface XHistoryEntry {
  changedAt: string;
  changeType: XChangeType;
  oldHandle?: string;
  newHandle?: string;
  oldTwitterId?: string;
  newTwitterId?: string;
}

export async function appendXHistory(
  client: DynamoDBClient,
  tableName: string,
  identityId: string,
  entry: Omit<XHistoryEntry, 'changedAt'>
): Promise<void> {
  const entryMap: Record<string, { S: string }> = {
    changedAt:  { S: new Date().toISOString() },
    changeType: { S: entry.changeType },
  };
  if (entry.oldHandle)    entryMap.oldHandle    = { S: entry.oldHandle };
  if (entry.newHandle)    entryMap.newHandle    = { S: entry.newHandle };
  if (entry.oldTwitterId) entryMap.oldTwitterId = { S: entry.oldTwitterId };
  if (entry.newTwitterId) entryMap.newTwitterId = { S: entry.newTwitterId };

  await client.send(new UpdateItemCommand({
    TableName: tableName,
    Key: { identityId: { S: identityId } },
    UpdateExpression: 'SET xHistory = list_append(if_not_exists(xHistory, :empty), :entry)',
    ExpressionAttributeValues: {
      ':entry': { L: [{ M: entryMap }] },
      ':empty': { L: [] },
    },
  }));
}
