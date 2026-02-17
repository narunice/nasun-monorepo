import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

export interface TwitterOAuthSession {
  sessionId: string;
  codeVerifier: string;
  state: string;
  redirectUri?: string;
  createdAt: number;
  expiresAt: number;
}

export class SessionManager {
  private dynamoClient: DynamoDBClient;
  private tableName: string;
  private ttlMinutes: number;

  constructor(tableName: string, region: string = 'ap-northeast-2', ttlMinutes: number = 15) {
    this.dynamoClient = new DynamoDBClient({ region });
    this.tableName = tableName;
    this.ttlMinutes = ttlMinutes;
  }

  /**
   * Create a new OAuth session
   */
  async createSession(session: Omit<TwitterOAuthSession, 'createdAt' | 'expiresAt'>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (this.ttlMinutes * 60);

    const item: any = {
      sessionId: { S: session.sessionId },
      codeVerifier: { S: session.codeVerifier },
      state: { S: session.state },
      createdAt: { N: now.toString() },
      expiresAt: { N: expiresAt.toString() },
    };

    if (session.redirectUri) {
      item.redirectUri = { S: session.redirectUri };
    }

    const putCommand = new PutItemCommand({
      TableName: this.tableName,
      Item: item,
    });

    await this.dynamoClient.send(putCommand);
  }

  /**
   * Retrieve and validate an OAuth session
   */
  async getSession(sessionId: string): Promise<TwitterOAuthSession | null> {
    const getCommand = new GetItemCommand({
      TableName: this.tableName,
      Key: {
        sessionId: { S: sessionId },
      },
    });

    const result = await this.dynamoClient.send(getCommand);
    
    if (!result.Item) {
      return null;
    }

    // Check if session has expired
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = parseInt(result.Item.expiresAt.N!);
    
    if (now > expiresAt) {
      // Session expired, clean it up
      await this.deleteSession(sessionId);
      return null;
    }

    return {
      sessionId: result.Item.sessionId.S!,
      codeVerifier: result.Item.codeVerifier.S!,
      state: result.Item.state.S!,
      redirectUri: result.Item.redirectUri?.S,
      createdAt: parseInt(result.Item.createdAt.N!),
      expiresAt: expiresAt,
    };
  }

  /**
   * Atomically get and delete an OAuth session (prevents replay attacks)
   * Uses ReturnValues: 'ALL_OLD' to retrieve the item before deletion
   */
  async getAndDeleteSession(sessionId: string): Promise<TwitterOAuthSession | null> {
    const deleteCommand = new DeleteItemCommand({
      TableName: this.tableName,
      Key: {
        sessionId: { S: sessionId },
      },
      ReturnValues: 'ALL_OLD',
    });

    const result = await this.dynamoClient.send(deleteCommand);

    if (!result.Attributes) {
      return null;
    }

    // Check if session has expired
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = parseInt(result.Attributes.expiresAt.N!);

    if (now > expiresAt) {
      return null;
    }

    return {
      sessionId: result.Attributes.sessionId.S!,
      codeVerifier: result.Attributes.codeVerifier.S!,
      state: result.Attributes.state.S!,
      redirectUri: result.Attributes.redirectUri?.S,
      createdAt: parseInt(result.Attributes.createdAt.N!),
      expiresAt: expiresAt,
    };
  }

  /**
   * Delete an OAuth session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const deleteCommand = new DeleteItemCommand({
      TableName: this.tableName,
      Key: {
        sessionId: { S: sessionId },
      },
    });

    await this.dynamoClient.send(deleteCommand);
  }

  /**
   * Validate state parameter
   */
  async validateState(sessionId: string, providedState: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return false;
    }

    return session.state === providedState;
  }
}