import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface AuthStackProps extends cdk.StackProps {
  readonly userProfilesTable: dynamodb.ITable;
}

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const twitterSessionsTable = dynamodb.Table.fromTableName(this, "TwitterOAuthSessionsTable", "TwitterOAuthSessions");

    const twitterTokensSecret = secretsmanager.Secret.fromSecretNameV2(this, "TwitterTokensSecret", "nasun-twitter-tokens");

    // Twitter OAuth Authentication Lambda
    const twitterLoginFunction = new lambda.Function(this, 'TwitterLoginFunction', {
      functionName: 'nasun-auth-twitter-login',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/auth-twitter"),
      timeout: cdk.Duration.seconds(30),
      environment: {
        SECRET_NAME: 'nasun-twitter-tokens',
        SESSIONS_TABLE_NAME: twitterSessionsTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: 'nasun.io',
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
      },
      logGroup: new logs.LogGroup(this, "TwitterAuthLambdaLogGroup", {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    // Grant Secrets Manager read permission
    twitterTokensSecret.grantRead(twitterLoginFunction);
    twitterTokensSecret.grantWrite(twitterLoginFunction);

    // Grant DynamoDB permissions
    twitterSessionsTable.grantReadWriteData(twitterLoginFunction);
    props.userProfilesTable.grantReadWriteData(twitterLoginFunction);

    // Grant Cognito permissions
    twitterLoginFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-identity:GetId',
        'cognito-identity:GetCredentialsForIdentity',
        'cognito-identity:GetOpenIdTokenForDeveloperIdentity',
      ],
      resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`],
    }));

    // Create API Gateway for Twitter Auth
    const twitterAuthApi = new apigw.RestApi(this, "TwitterAuthApi", {
      restApiName: "Twitter Auth Service",
      description: "API for Twitter OAuth 2.0 authentication",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
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

    // 5. API Gateway for MetaMask Auth
    const metamaskAuthApi = new apigw.RestApi(this, 'MetaMaskAuthApi', {
      restApiName: 'MetaMask Auth Service',
      description: 'API for MetaMask Ethereum wallet authentication',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
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

  }
}
