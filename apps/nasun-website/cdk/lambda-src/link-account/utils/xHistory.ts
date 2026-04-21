import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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
  client: DynamoDBDocumentClient,
  tableName: string,
  identityId: string,
  entry: Omit<XHistoryEntry, 'changedAt'>
): Promise<void> {
  const item: Record<string, string> = {
    changedAt:  new Date().toISOString(),
    changeType: entry.changeType,
  };
  if (entry.oldHandle)    item.oldHandle    = entry.oldHandle;
  if (entry.newHandle)    item.newHandle    = entry.newHandle;
  if (entry.oldTwitterId) item.oldTwitterId = entry.oldTwitterId;
  if (entry.newTwitterId) item.newTwitterId = entry.newTwitterId;

  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { identityId },
    UpdateExpression: 'SET xHistory = list_append(if_not_exists(xHistory, :empty), :entry)',
    ExpressionAttributeValues: {
      ':entry': [item],
      ':empty': [],
    },
  }));
}
