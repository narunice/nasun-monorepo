import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';

// Security: CORS 허용 도메인 목록
// Note: Devnet 환경이므로 localhost 개발 서버도 허용
const ALLOWED_ORIGINS = [
  'https://nasun.io',
  'https://www.nasun.io',
  'https://staging.nasun.io',
  'https://gensol.nasun.io',
  'https://staging.gensol.io',
  'https://pado.finance',
  'https://staging.pado.finance',
  // Localhost development servers (devnet only)
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177', // baram
];

export interface AuthStackProps extends cdk.StackProps {
  readonly userProfilesTable: dynamodb.ITable;
}

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const twitterSessionsTable = dynamodb.Table.fromTableName(this, "TwitterOAuthSessionsTable", "TwitterOAuthSessions");

    // Determine secret name based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const secretName = isProduction ? 'nasun-twitter-tokens-prod' : 'nasun-twitter-tokens';

    const twitterTokensSecret = secretsmanager.Secret.fromSecretNameV2(this, "TwitterTokensSecret", secretName);

    // Leaderboard V3 accounts table name (for profile sync)
    // Note: Using hardcoded name as LeaderboardV3Stack is deployed separately
    const leaderboardV3AccountsTableName = 'leaderboard-v3-accounts';

    // Twitter OAuth Authentication Lambda
    const twitterLoginFunction = new lambda.Function(this, 'TwitterLoginFunction', {
      functionName: 'nasun-auth-twitter-login',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/auth-twitter"),
      timeout: cdk.Duration.seconds(30),
      environment: {
        // Note: SECRET_NAME removed - user auth uses env vars only (separated from operator path)
        SESSIONS_TABLE_NAME: twitterSessionsTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: 'nasun.io',
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        // Leaderboard V3 profile sync (optional - fails gracefully if table doesn't exist)
        LEADERBOARD_V3_ACCOUNTS_TABLE: leaderboardV3AccountsTableName,
      },
      logGroup: new logs.LogGroup(this, "TwitterAuthLambdaLogGroup", {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    // Note: Secrets Manager permissions removed for auth-twitter Lambda
    // User auth path now uses environment variables only (separated from operator/leaderboard path)
    // x-leaderboard Lambdas retain Secrets Manager access for operator tokens

    // Grant DynamoDB permissions
    twitterSessionsTable.grantReadWriteData(twitterLoginFunction);
    props.userProfilesTable.grantReadWriteData(twitterLoginFunction);

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
    const metamaskAuthFunction = new lambda.Function(this, 'MetaMaskAuthFunction', {
      functionName: 'nasun-auth-metamask',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda-src/auth-metamask'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        NONCE_TABLE_NAME: nonceTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: process.env.COGNITO_DEVELOPER_PROVIDER_NAME || 'nasun.io',
        ETHEREUM_CHAIN_ID_MAINNET: process.env.ETHEREUM_CHAIN_ID_MAINNET || '1',
        ETHEREUM_CHAIN_ID_SEPOLIA: process.env.ETHEREUM_CHAIN_ID_SEPOLIA || '11155111',
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
    const zkLoginSaltFunction = new lambda.Function(this, 'ZkLoginSaltFunction', {
      functionName: 'nasun-auth-zklogin-salt',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda-src/zklogin-salt'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ZKLOGIN_TABLE_NAME: zkLoginTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS.join(','),
        ALLOWED_AUD: process.env.GOOGLE_CLIENT_ID || '',
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
