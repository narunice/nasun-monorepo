import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

export type XChangeType = 'initial_link' | 'handle_rename' | 'account_switch' | 'unlink';

export interface XHistoryEntry {
  changedAt: string;
  changeType: XChangeType;
  oldHandle?: string;
  newHandle?: string;
  oldTwitterId?: string;
  newTwitterId?: string;
}

// Appends one entry to the DynamoDB xHistory list and RETURNS the entry it built (with the
// changedAt stamp). The caller mirrors this exact returned object to the box nasun-identity service
// so the box's attributes.xHistory list element is byte-identical to the DynamoDB one (shared
// changedAt). Only the present optional keys are written, matching the box route's str()-coerce.
export async function appendXHistory(
  client: DynamoDBClient,
  tableName: string,
  identityId: string,
  entry: Omit<XHistoryEntry, 'changedAt'>
): Promise<XHistoryEntry> {
  const full: XHistoryEntry = { changedAt: new Date().toISOString(), ...entry };
  const entryMap: Record<string, { S: string }> = {
    changedAt:  { S: full.changedAt },
    changeType: { S: full.changeType },
  };
  if (full.oldHandle)    entryMap.oldHandle    = { S: full.oldHandle };
  if (full.newHandle)    entryMap.newHandle    = { S: full.newHandle };
  if (full.oldTwitterId) entryMap.oldTwitterId = { S: full.oldTwitterId };
  if (full.newTwitterId) entryMap.newTwitterId = { S: full.newTwitterId };

  await client.send(new UpdateItemCommand({
    TableName: tableName,
    Key: { identityId: { S: identityId } },
    UpdateExpression: 'SET xHistory = list_append(if_not_exists(xHistory, :empty), :entry)',
    ExpressionAttributeValues: {
      ':entry': { L: [{ M: entryMap }] },
      ':empty': { L: [] },
    },
  }));
  return full;
}
