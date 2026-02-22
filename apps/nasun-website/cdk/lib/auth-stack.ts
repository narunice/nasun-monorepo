import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from './constants/cors';

export interface AuthStackProps extends cdk.StackProps {
  readonly userProfilesTable: dynamodb.ITable;
}

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Validate required secrets at synth time
    const walletProofSecret = process.env.WALLET_PROOF_SECRET;
    if (!walletProofSecret) {
      throw new Error('WALLET_PROOF_SECRET is required. Set it in cdk/.env before deploying.');
    }

    const twitterSessionsTable = dynamodb.Table.fromTableName(this, "TwitterOAuthSessionsTable", "TwitterOAuthSessions");

    // Import NFT event tasks table for secure X access token storage
    const nftEventTasksTableName = cdk.Fn.importValue('NftEventTasksTableName');
    const nftEventTasksTable = dynamodb.Table.fromTableName(this, 'NftEventTasksTable', nftEventTasksTableName);

    // Leaderboard V3 accounts table name (for profile sync)
    // Import from LeaderboardV3Stack CloudFormation export
    const leaderboardV3AccountsTableName = cdk.Fn.importValue('LeaderboardV3AccountsTableName');

    const twitterTokensSecretName = process.env.TWITTER_TOKENS_SECRET_NAME || 'nasun-twitter-tokens';

    // Common NodejsFunction options
    const lambdaSrcPath = path.join(__dirname, '..', 'lambda-src');
    const depsLockFilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');
    const bundlingOptions = {
      minify: true,
      sourceMap: true,
      externalModules: [
        '@aws-sdk/client-dynamodb',
        '@aws-sdk/lib-dynamodb',
        '@aws-sdk/client-secrets-manager',
      ],
    };

    // Twitter OAuth Authentication Lambda
    const twitterLoginFunction = new NodejsFunction(this, 'TwitterLoginFunction', {
      functionName: 'nasun-auth-twitter-login',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'auth-twitter', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(30),
      environment: {
        SESSIONS_TABLE_NAME: twitterSessionsTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: 'nasun.io',
        TWITTER_TOKENS_SECRET_NAME: twitterTokensSecretName,
        // Leaderboard V3 profile sync (optional - fails gracefully if table doesn't exist)
        LEADERBOARD_V3_ACCOUNTS_TABLE: leaderboardV3AccountsTableName,
        // NFT event tasks table for secure X access token storage (backend proxy)
        NFT_EVENT_TASKS_TABLE_NAME: nftEventTasksTableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, "TwitterAuthLambdaLogGroup", {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    // Grant DynamoDB permissions
    twitterSessionsTable.grantReadWriteData(twitterLoginFunction);
    props.userProfilesTable.grantReadWriteData(twitterLoginFunction);
    // Grant write access to NFT event tasks table for X access token storage
    nftEventTasksTable.grantWriteData(twitterLoginFunction);

    // Grant Secrets Manager read access for OAuth2 client credentials
    twitterLoginFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${twitterTokensSecretName}-*`,
        ],
      }),
    );

    // Grant permissions to leaderboard-v3-accounts table (for profile sync)
    twitterLoginFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:UpdateItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${leaderboardV3AccountsTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${leaderboardV3AccountsTableName}/index/*`,
      ],
    }));

    // Grant Cognito permissions
    twitterLoginFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-identity:GetId',
        'cognito-identity:GetCredentialsForIdentity',
        'cognito-identity:GetOpenIdTokenForDeveloperIdentity',
      ],
      resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`],
    }));

    // Create API Gateway for Twitter Auth with rate limiting
    const twitterAuthApi = new apigw.RestApi(this, "TwitterAuthApi", {
      restApiName: "Twitter Auth Service",
      description: "API for Twitter OAuth 2.0 authentication",
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      // Rate limiting to prevent abuse
      deployOptions: {
        throttlingBurstLimit: 50, // Max concurrent requests
        throttlingRateLimit: 20, // Requests per second
      },
    });

    const auth = twitterAuthApi.root.addResource('auth');
    const twitter = auth.addResource('twitter');

    // POST /auth/twitter/login
    const loginResource = twitter.addResource('login');
    loginResource.addMethod('GET', new apigw.LambdaIntegration(twitterLoginFunction));

    // POST /auth/twitter/callback
    const callbackResource = twitter.addResource('callback');
    callbackResource.addMethod('POST', new apigw.LambdaIntegration(twitterLoginFunction));

    new cdk.CfnOutput(this, "TwitterAuthApiUrl", {
      value: twitterAuthApi.url,
      description: "The URL of the Twitter Auth API Gateway",
      exportName: "TwitterAuthApiUrl"
    });

    // ========================================
    // MetaMask Authentication (2025-01-22 추가)
    // ========================================

    // 1. Nonce 저장용 DynamoDB 테이블
    const nonceTable = new dynamodb.Table(this, 'MetaMaskAuthNoncesTable', {
      tableName: 'MetaMaskAuthNonces',
      partitionKey: { name: 'walletAddress', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 개발 환경용
    });

    // 2. MetaMask Auth Lambda 함수
    const metamaskAuthFunction = new NodejsFunction(this, 'MetaMaskAuthFunction', {
      functionName: 'nasun-auth-metamask',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'auth-metamask', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NONCE_TABLE_NAME: nonceTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: process.env.COGNITO_DEVELOPER_PROVIDER_NAME || 'nasun.io',
        ETHEREUM_CHAIN_ID_MAINNET: process.env.ETHEREUM_CHAIN_ID_MAINNET || '1',
        ETHEREUM_CHAIN_ID_SEPOLIA: process.env.ETHEREUM_CHAIN_ID_SEPOLIA || '11155111',
        WALLET_PROOF_SECRET: walletProofSecret,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'MetaMaskAuthLambdaLogGroup', {
        logGroupName: '/aws/lambda/nasun-auth-metamask',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    // 3. DynamoDB 권한 부여
    nonceTable.grantReadWriteData(metamaskAuthFunction);
    props.userProfilesTable.grantReadWriteData(metamaskAuthFunction);

    // 4. Cognito 권한 부여
    metamaskAuthFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-identity:GetId',
          'cognito-identity:GetCredentialsForIdentity',
          'cognito-identity:GetOpenIdTokenForDeveloperIdentity',
        ],
        resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`],
      })
    );

    // 5. API Gateway for MetaMask Auth with rate limiting
    const metamaskAuthApi = new apigw.RestApi(this, 'MetaMaskAuthApi', {
      restApiName: 'MetaMask Auth Service',
      description: 'API for MetaMask Ethereum wallet authentication',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      // Rate limiting to prevent abuse
      deployOptions: {
        throttlingBurstLimit: 50, // Max concurrent requests
        throttlingRateLimit: 20, // Requests per second
      },
    });

    const metamaskAuth = metamaskAuthApi.root.addResource('auth');
    const metamask = metamaskAuth.addResource('metamask');

    // POST /auth/metamask/challenge
    const challengeResource = metamask.addResource('challenge');
    challengeResource.addMethod('POST', new apigw.LambdaIntegration(metamaskAuthFunction));

    // POST /auth/metamask/verify
    const verifyResource = metamask.addResource('verify');
    verifyResource.addMethod('POST', new apigw.LambdaIntegration(metamaskAuthFunction));

    // 6. CloudFormation Outputs
    new cdk.CfnOutput(this, 'MetaMaskAuthApiUrl', {
      value: metamaskAuthApi.url,
      description: 'The URL of the MetaMask Auth API Gateway',
      exportName: 'MetaMaskAuthApiUrl',
    });

    new cdk.CfnOutput(this, 'NonceTableName', {
      value: nonceTable.tableName,
      description: 'DynamoDB table for MetaMask auth nonces',
    });

    // ========================================
    // zkLogin Authentication (2026-01-01 추가)
    // ========================================

    // 1. Salt 저장용 DynamoDB 테이블
    const zkLoginTable = new dynamodb.Table(this, 'ZkLoginUsersTable', {
      tableName: 'ZkLoginUsers',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 개발 환경용
    });

    // 2. zkLogin Salt Lambda 함수
    const zkLoginSaltFunction = new NodejsFunction(this, 'ZkLoginSaltFunction', {
      functionName: 'nasun-auth-zklogin-salt',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'zklogin-salt', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ZKLOGIN_TABLE_NAME: zkLoginTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        ALLOWED_AUD: process.env.GOOGLE_CLIENT_ID || '',
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'ZkLoginSaltLambdaLogGroup', {
        logGroupName: '/aws/lambda/nasun-auth-zklogin-salt',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    // 3. DynamoDB 권한 부여
    zkLoginTable.grantReadWriteData(zkLoginSaltFunction);

    // 4. API Gateway for zkLogin Auth with rate limiting
    const zkLoginAuthApi = new apigw.RestApi(this, 'ZkLoginAuthApi', {
      restApiName: 'zkLogin Auth Service',
      description: 'API for Sui zkLogin authentication with social providers',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      // Rate limiting to prevent abuse
      deployOptions: {
        throttlingBurstLimit: 50, // Max concurrent requests
        throttlingRateLimit: 20, // Requests per second
      },
    });

    const zkLoginAuth = zkLoginAuthApi.root.addResource('auth');
    const zkLogin = zkLoginAuth.addResource('zklogin');

    // POST /auth/zklogin/salt
    const saltResource = zkLogin.addResource('salt');
    saltResource.addMethod('POST', new apigw.LambdaIntegration(zkLoginSaltFunction));

    // 5. CloudFormation Outputs
    new cdk.CfnOutput(this, 'ZkLoginAuthApiUrl', {
      value: zkLoginAuthApi.url,
      description: 'The URL of the zkLogin Auth API Gateway',
      exportName: 'ZkLoginAuthApiUrl',
    });

    new cdk.CfnOutput(this, 'ZkLoginTableName', {
      value: zkLoginTable.tableName,
      description: 'DynamoDB table for zkLogin users',
    });

  }
}
