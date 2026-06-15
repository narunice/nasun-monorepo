import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as path from 'path';
import { issuerVerifyEnv, issuerMintEnv, issuerSaltEnv } from './issuer-env';
import { identityWriteEnv, identityReadEnv } from './identity-env';
import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from './constants/cors';

export interface AuthStackProps extends cdk.StackProps {
  readonly userProfilesTable: dynamodb.ITable;
  /** Shared WAF WebACL ARN to attach each auth API stage to */
  readonly sharedWafArn: string;
}

export class AuthStack extends cdk.Stack {
  public readonly metamaskAuthApi: apigw.RestApi;
  public readonly suiAuthApi: apigw.RestApi;
  public readonly zkLoginAuthApi: apigw.RestApi;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Secret names for Secrets Manager runtime reads
    const walletProofSecretName = process.env.WALLET_PROOF_SECRET_NAME || 'nasun-wallet-proof';

    const twitterSessionsTable = dynamodb.Table.fromTableName(this, "TwitterOAuthSessionsTable", "TwitterOAuthSessions");

    // Import NFT event tasks table for secure X access token storage
    const nftEventTasksTableName = cdk.Fn.importValue('NftEventTasksTableName');
    const nftEventTasksTable = dynamodb.Table.fromTableName(this, 'NftEventTasksTable', nftEventTasksTableName);

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
        // AWS-exit C2 flip: route Twitter identity mint to the self-hosted issuer when configured
        // (else Cognito). Mirrors auth-metamask/auth-sui. The handler toggle (cognito.ts) is already
        // deployed-inert; wiring ISSUER_MINT_URL/SECRET here activates issuer mint.
        ...issuerMintEnv(),
        // AWS-exit DAL 3d step-2: mirror the Twitter-primary profile refresh to the box
        // nasun-identity service when wired. FAIL-SAFE: {} when IDENTITY_WRITE_URL/SECRET unset.
        ...identityWriteEnv(),
        SESSIONS_TABLE_NAME: twitterSessionsTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: 'nasun.io',
        TWITTER_TOKENS_SECRET_NAME: twitterTokensSecretName,
        // NFT event tasks table for secure X access token storage (backend proxy)
        NFT_EVENT_TASKS_TABLE_NAME: nftEventTasksTableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: '--enable-source-maps',
        // Onboarding bonus: referral-only x-link bonus on first X login
        REFERRALS_TABLE: 'nasun-referrals',
        EXPLORER_API_URL: process.env.EXPLORER_API_URL || '',
        ONBOARDING_BONUS_API_KEY: process.env.ONBOARDING_BONUS_API_KEY || '',
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
    // Read-only on nasun-referrals for onboarding bonus referral-status check
    const nasunReferralsForTwitter = dynamodb.Table.fromTableName(
      this, 'NasunReferralsForTwitter', 'nasun-referrals'
    );
    nasunReferralsForTwitter.grantReadData(twitterLoginFunction);

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
        throttlingBurstLimit: 500, // Max concurrent requests
        throttlingRateLimit: 200, // Requests per second
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
        // AWS-exit grace: route mint to the self-hosted issuer when configured (else Cognito).
        ...issuerMintEnv(),
        // AWS-exit DAL S1.2: also mirror the profile write to the box nasun-identity service when wired.
        ...identityWriteEnv(),
        NONCE_TABLE_NAME: nonceTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: process.env.COGNITO_DEVELOPER_PROVIDER_NAME || 'nasun.io',
        ETHEREUM_CHAIN_ID_MAINNET: process.env.ETHEREUM_CHAIN_ID_MAINNET || '1',
        ETHEREUM_CHAIN_ID_SEPOLIA: process.env.ETHEREUM_CHAIN_ID_SEPOLIA || '11155111',
        WALLET_PROOF_SECRET_NAME: walletProofSecretName,
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

    // Secrets Manager 권한 (wallet proof secret)
    metamaskAuthFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${walletProofSecretName}-*`,
        ],
      }),
    );

    // 5. API Gateway for MetaMask Auth with rate limiting
    this.metamaskAuthApi = new apigw.RestApi(this, 'MetaMaskAuthApi', {
      restApiName: 'MetaMask Auth Service',
      description: 'API for MetaMask Ethereum wallet authentication',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      // Rate limiting to prevent abuse
      deployOptions: {
        throttlingBurstLimit: 500, // Max concurrent requests
        throttlingRateLimit: 200, // Requests per second
      },
    });

    // AWS-exit #4 / de-Lambda C3a: the 1-trip login (prepare + connect-verify, for BOTH metamask and
    // sui below) is served by the box compute service (nasun-identity-compute) over an API Gateway
    // HTTP_PROXY, identical to the C1 get-user-count cutover. The box reproduces the lambda handlers
    // byte-for-byte (signature verify -> issuer-loopback mint -> identity-loopback /profile/upsert ->
    // HMAC; in-memory nonce). The RestApi + execute-api URL are preserved (same construct), so no
    // frontend rebuild. The auth lambdas (metamaskAuthFunction / suiAuthFunction) stay deployed as the
    // rollback lever -- revert these integrations to LambdaIntegration + redeploy to roll back. The
    // 2-trip /challenge + /verify stay on the lambda (not ported; the frontend uses the 1-trip flow).
    const c3aProxy = (p: string) =>
      new apigw.HttpIntegration(`https://issuer.nasun.io/compute/auth/${p}`, {
        httpMethod: 'POST',
        proxy: true,
      });

    // AWS-exit de-Lambda C4-1: additional-wallet integrations proxy to the box compute service. Unlike
    // c3aProxy (POST-only, /compute/auth/ prefix), these encode the chain + verb in the path -- the box
    // router matches `/<chain>-additional/<action>` and the backend httpMethod MUST equal the source
    // method (DELETE->DELETE, PATCH->PATCH) for HTTP_PROXY passthrough. `p` is the full compute path,
    // e.g. `sui-additional/challenge` (reused by solana/metamask in C4-1b/c). nginx strips `/compute/`.
    const additionalProxy = (method: string, p: string) =>
      new apigw.HttpIntegration(`https://issuer.nasun.io/compute/${p}`, {
        httpMethod: method,
        proxy: true,
      });

    const metamaskAuth = this.metamaskAuthApi.root.addResource('auth');
    const metamask = metamaskAuth.addResource('metamask');

    // POST /auth/metamask/challenge
    const challengeResource = metamask.addResource('challenge');
    challengeResource.addMethod('POST', new apigw.LambdaIntegration(metamaskAuthFunction));

    // POST /auth/metamask/verify
    const verifyResource = metamask.addResource('verify');
    verifyResource.addMethod('POST', new apigw.LambdaIntegration(metamaskAuthFunction));

    // POST /auth/metamask/prepare (1-trip connectAndSign flow — no address required). C3a: box compute.
    const prepareResource = metamask.addResource('prepare');
    prepareResource.addMethod('POST', c3aProxy('metamask/prepare'));

    // POST /auth/metamask/connect-verify (1-trip connectAndSign flow — recovers address). C3a: box compute.
    const connectVerifyResource = metamask.addResource('connect-verify');
    connectVerifyResource.addMethod('POST', c3aProxy('metamask/connect-verify'));

    // 6. CloudFormation Outputs
    new cdk.CfnOutput(this, 'MetaMaskAuthApiUrl', {
      value: this.metamaskAuthApi.url,
      description: 'The URL of the MetaMask Auth API Gateway',
      exportName: 'MetaMaskAuthApiUrl',
    });

    new cdk.CfnOutput(this, 'NonceTableName', {
      value: nonceTable.tableName,
      description: 'DynamoDB table for MetaMask auth nonces',
    });

    // ========================================
    // MetaMask Additional Address API (per-app verified EVM binding)
    // ========================================
    //
    // Separate Lambda from auth-metamask: this surface requires a Cognito
    // JWT (user must already be logged in) and only mutates the existing
    // profile's metamask map. The auth-metamask Lambda above is unauth and
    // mints new identities — different threat model, different IAM scope.
    // Nonce table is shared via key prefix `additional:{nonce}`.

    const metamaskAdditionalFunction = new NodejsFunction(this, 'MetaMaskAdditionalFunction', {
      functionName: 'nasun-auth-metamask-additional',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'auth-metamask-additional', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(15),
      environment: {
        // AWS-exit grace: accept issuer-signed JWTs via dual-JWKS when configured (else Cognito-only).
        ...issuerVerifyEnv(),
        // AWS-exit DAL 3d step-2: mirror linkedAccounts.metamask writes to the box (best-effort
        // until /profile/linked-account-merge is in IDENTITY_WRITE_FLIP_ROUTES, then authoritative).
        ...identityWriteEnv(),
        NONCE_TABLE_NAME: nonceTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: (() => {
          const poolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID;
          if (!poolId) throw new Error('VITE_COGNITO_IDENTITY_POOL_ID is required for additional-address JWT auth');
          return poolId;
        })(),
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'MetaMaskAdditionalLambdaLogGroup', {
        logGroupName: '/aws/lambda/nasun-auth-metamask-additional',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    nonceTable.grantReadWriteData(metamaskAdditionalFunction);
    props.userProfilesTable.grantReadWriteData(metamaskAdditionalFunction);

    const metamaskAdditionalApi = new apigw.RestApi(this, 'MetaMaskAdditionalApi', {
      restApiName: 'MetaMask Additional Address API',
      description: 'JWT-authed endpoints for verifying secondary EVM addresses and per-app bindings',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        // Challenge endpoint does a Scan for cross-account uniqueness; keep
        // gateway-wide rate low until the SolAddressOwnership lookup table
        // lands (see findOtherOwnerOfAddress comment). 10 RPS sustained is
        // plenty for the auth flow (challenge -> verify -> binding = ~3 reqs
        // per user attempt).
        throttlingBurstLimit: 20,
        throttlingRateLimit: 10,
      },
    });

    // Path layout mirrors the handoff spec (`/additional-address/challenge`
    // etc.). The Lambda's internal router matches on path suffix so the
    // same code works regardless of mount depth.
    // AWS-exit de-Lambda C4-1c: the 5 integrations proxy to the box compute service (metamask). Same as
    // the C4-1a/b repoints -- only the backend integration swaps Lambda -> HTTP_PROXY; the RestApi URL
    // (VITE_ADDITIONAL_API) is unchanged. metamaskAdditionalFunction stays deployed as a rollback lever.
    const additional = metamaskAdditionalApi.root.addResource('additional-address');
    additional.addMethod('DELETE', additionalProxy('DELETE', 'metamask-additional/remove'));
    const additionalChallenge = additional.addResource('challenge');
    additionalChallenge.addMethod('POST', additionalProxy('POST', 'metamask-additional/challenge'));
    const additionalVerify = additional.addResource('verify');
    additionalVerify.addMethod('POST', additionalProxy('POST', 'metamask-additional/verify'));
    const additionalLabel = additional.addResource('label');
    additionalLabel.addMethod('PATCH', additionalProxy('PATCH', 'metamask-additional/label'));

    const appBinding = metamaskAdditionalApi.root.addResource('app-binding');
    appBinding.addMethod('PATCH', additionalProxy('PATCH', 'metamask-additional/app-binding'));

    new cdk.CfnOutput(this, 'MetaMaskAdditionalApiUrl', {
      value: metamaskAdditionalApi.url,
      description: 'The URL of the MetaMask Additional Address API',
      exportName: 'MetaMaskAdditionalApiUrl',
    });

    // Solana additional-address binding (Ed25519). Mirrors MetaMask flow;
    // separate Lambda + bundled tweetnacl/bs58. Nonces share the EVM table
    // under a `solana_additional:` key prefix to avoid collision.
    const solanaAdditionalFunction = new NodejsFunction(this, 'SolanaAdditionalFunction', {
      functionName: 'nasun-auth-solana-additional',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'auth-solana-additional', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions, // tweetnacl + bs58 bundled (only @aws-sdk/* is external)
      timeout: cdk.Duration.seconds(15),
      environment: {
        // AWS-exit grace: accept issuer-signed JWTs via dual-JWKS when configured (else Cognito-only).
        ...issuerVerifyEnv(),
        // AWS-exit DAL 3d step-2: mirror linkedAccounts.solana writes to the box (best-effort
        // until /profile/linked-account-merge is in IDENTITY_WRITE_FLIP_ROUTES, then authoritative).
        ...identityWriteEnv(),
        // AWS-exit DAL read-flip: box-served address-collision check (/profile/address-owner) with
        // DynamoDB Scan fallback. FAIL-SAFE: {} when IDENTITY_READ_URL/SECRET unset; IDENTITY_READ_MODE
        // =flip activates it. Roll back by unsetting the vars (or IDENTITY_READ_MODE) and redeploying.
        ...identityReadEnv(),
        NONCE_TABLE_NAME: nonceTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: (() => {
          const poolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID;
          if (!poolId) throw new Error('VITE_COGNITO_IDENTITY_POOL_ID is required for solana additional-address JWT auth');
          return poolId;
        })(),
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'SolanaAdditionalLambdaLogGroup', {
        logGroupName: '/aws/lambda/nasun-auth-solana-additional',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    nonceTable.grantReadWriteData(solanaAdditionalFunction);
    props.userProfilesTable.grantReadWriteData(solanaAdditionalFunction);

    const solanaAdditionalApi = new apigw.RestApi(this, 'SolanaAdditionalApi', {
      restApiName: 'Solana Additional Address API',
      description: 'JWT-authed endpoints for verifying Solana addresses (Ed25519) and per-app bindings',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        // Challenge endpoint does a Scan for cross-account uniqueness; keep
        // gateway-wide rate low until the SolAddressOwnership lookup table
        // lands (see findOtherOwnerOfAddress comment). 10 RPS sustained is
        // plenty for the auth flow (challenge -> verify -> binding = ~3 reqs
        // per user attempt).
        throttlingBurstLimit: 20,
        throttlingRateLimit: 10,
      },
    });

    // AWS-exit de-Lambda C4-1b: the 5 integrations proxy to the box compute service (solana). Same as the
    // C4-1a sui repoint -- only the backend integration swaps Lambda -> HTTP_PROXY; the RestApi URL
    // (VITE_SOLANA_ADDITIONAL_API) is unchanged. solanaAdditionalFunction stays deployed as a rollback lever.
    const solAdditional = solanaAdditionalApi.root.addResource('additional-address');
    solAdditional.addMethod('DELETE', additionalProxy('DELETE', 'solana-additional/remove'));
    const solChallenge = solAdditional.addResource('challenge');
    solChallenge.addMethod('POST', additionalProxy('POST', 'solana-additional/challenge'));
    const solVerify = solAdditional.addResource('verify');
    solVerify.addMethod('POST', additionalProxy('POST', 'solana-additional/verify'));
    const solLabel = solAdditional.addResource('label');
    solLabel.addMethod('PATCH', additionalProxy('PATCH', 'solana-additional/label'));

    const solAppBinding = solanaAdditionalApi.root.addResource('app-binding');
    solAppBinding.addMethod('PATCH', additionalProxy('PATCH', 'solana-additional/app-binding'));

    new cdk.CfnOutput(this, 'SolanaAdditionalApiUrl', {
      value: solanaAdditionalApi.url,
      description: 'The URL of the Solana Additional Address API',
      exportName: 'SolanaAdditionalApiUrl',
    });

    // Sui additional-address binding. Mirrors the Solana flow but uses
    // `@mysten/sui/verify` (BCS personal-message intent + Ed25519). Nonces
    // share the EVM table under a `sui_additional:` key prefix.
    const suiAdditionalFunction = new NodejsFunction(this, 'SuiAdditionalFunction', {
      functionName: 'nasun-auth-sui-additional',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'auth-sui-additional', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions, // @mysten/sui bundled (only @aws-sdk/* is external)
      timeout: cdk.Duration.seconds(15),
      environment: {
        // AWS-exit grace: accept issuer-signed JWTs via dual-JWKS when configured (else Cognito-only).
        ...issuerVerifyEnv(),
        // AWS-exit DAL 3d step-2: mirror linkedAccounts.sui writes to the box (best-effort
        // until /profile/linked-account-merge is in IDENTITY_WRITE_FLIP_ROUTES, then authoritative).
        ...identityWriteEnv(),
        // AWS-exit DAL read-flip: box-served address-collision check (/profile/address-owner) with
        // DynamoDB Scan fallback. FAIL-SAFE: {} when IDENTITY_READ_URL/SECRET unset; IDENTITY_READ_MODE
        // =flip activates it. Roll back by unsetting the vars (or IDENTITY_READ_MODE) and redeploying.
        ...identityReadEnv(),
        NONCE_TABLE_NAME: nonceTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: (() => {
          const poolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID;
          if (!poolId) throw new Error('VITE_COGNITO_IDENTITY_POOL_ID is required for sui additional-address JWT auth');
          return poolId;
        })(),
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'SuiAdditionalLambdaLogGroup', {
        logGroupName: '/aws/lambda/nasun-auth-sui-additional',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    nonceTable.grantReadWriteData(suiAdditionalFunction);
    props.userProfilesTable.grantReadWriteData(suiAdditionalFunction);

    const suiAdditionalApi = new apigw.RestApi(this, 'SuiAdditionalApi', {
      restApiName: 'Sui Additional Address API',
      description: 'JWT-authed endpoints for verifying Sui addresses (personal-message signature) and per-app bindings',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        // Challenge endpoint does a Scan for cross-account uniqueness; same
        // throttling profile as the Solana sibling.
        throttlingBurstLimit: 20,
        throttlingRateLimit: 10,
      },
    });

    // AWS-exit de-Lambda C4-1a: the 5 integrations proxy to the box compute service. The SuiAdditionalApi
    // RestApi (and its URL, baked into the frontend VITE_SUI_ADDITIONAL_API) is UNCHANGED -- only the
    // backend integration swaps Lambda -> HTTP_PROXY, so no frontend rebuild. suiAdditionalFunction stays
    // deployed as a rollback lever (revert these 5 lines to LambdaIntegration + redeploy to roll back).
    const suiAdditional = suiAdditionalApi.root.addResource('additional-address');
    suiAdditional.addMethod('DELETE', additionalProxy('DELETE', 'sui-additional/remove'));
    const suiAddChallenge = suiAdditional.addResource('challenge');
    suiAddChallenge.addMethod('POST', additionalProxy('POST', 'sui-additional/challenge'));
    const suiAddVerify = suiAdditional.addResource('verify');
    suiAddVerify.addMethod('POST', additionalProxy('POST', 'sui-additional/verify'));
    const suiAddLabel = suiAdditional.addResource('label');
    suiAddLabel.addMethod('PATCH', additionalProxy('PATCH', 'sui-additional/label'));

    const suiAddAppBinding = suiAdditionalApi.root.addResource('app-binding');
    suiAddAppBinding.addMethod('PATCH', additionalProxy('PATCH', 'sui-additional/app-binding'));

    new cdk.CfnOutput(this, 'SuiAdditionalApiUrl', {
      value: suiAdditionalApi.url,
      description: 'The URL of the Sui Additional Address API',
      exportName: 'SuiAdditionalApiUrl',
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
      pointInTimeRecovery: true, // salt loss = permanent wallet loss, PITR enables 35-day recovery
      removalPolicy: cdk.RemovalPolicy.RETAIN, // RETAIN: cdk destroy 시 salt DB 삭제 방지 (사용자 Sui 주소 영구 소실 방어)
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
        // AWS-exit grace: persist salt to the self-hosted issuer when configured (else DynamoDB).
        ...issuerSaltEnv(),
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

    // Provisioned Concurrency for Genesis Pass drop (eliminates cold starts)
    const zkLoginSaltVersion = zkLoginSaltFunction.currentVersion;
    new lambda.Alias(this, "ZkLoginSaltLiveAlias", {
      aliasName: "live",
      version: zkLoginSaltVersion,
      provisionedConcurrentExecutions: 5,
    });

    // 3. DynamoDB 권한 부여
    zkLoginTable.grantReadWriteData(zkLoginSaltFunction);

    // 4. API Gateway for zkLogin Auth with rate limiting
    this.zkLoginAuthApi = new apigw.RestApi(this, 'ZkLoginAuthApi', {
      restApiName: 'zkLogin Auth Service',
      description: 'API for Sui zkLogin authentication with social providers',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      // Rate limiting -- raised for Genesis Pass drop traffic
      deployOptions: {
        throttlingBurstLimit: 1000,
        throttlingRateLimit: 500,
      },
    });

    const zkLoginAuth = this.zkLoginAuthApi.root.addResource('auth');
    const zkLogin = zkLoginAuth.addResource('zklogin');

    // POST /auth/zklogin/salt
    // AWS-exit #4 / de-Lambda C8: served by the box compute service (nasun-identity-compute) over the
    // same API Gateway HTTP_PROXY pattern as the C3a login cutover (reuses c3aProxy). The box reproduces
    // the zkLoginSaltFunction handler's ISSUER-SALT branch byte-for-byte (Google JWKS verify ->
    // jwtToAddress derivation -> box issuer salt store over loopback; @mysten/sui 1.45.2 on both sides,
    // so address derivation is identical, and the salt store is the SAME box issuer so existing users'
    // salt+address stay continuous). The RestApi + execute-api URL are preserved (no frontend rebuild).
    // zkLoginSaltFunction stays deployed as the rollback lever -- revert this integration to
    // LambdaIntegration + redeploy to roll back. (The lambda's DynamoDB branch is dead on the box:
    // ISSUER_SALT_URL is set in prod, so persistence already lives on the box issuer.)
    const saltResource = zkLogin.addResource('salt');
    saltResource.addMethod('POST', c3aProxy('zklogin/salt'));

    // 5. CloudFormation Outputs
    new cdk.CfnOutput(this, 'ZkLoginAuthApiUrl', {
      value: this.zkLoginAuthApi.url,
      description: 'The URL of the zkLogin Auth API Gateway',
      exportName: 'ZkLoginAuthApiUrl',
    });

    new cdk.CfnOutput(this, 'ZkLoginTableName', {
      value: zkLoginTable.tableName,
      description: 'DynamoDB table for zkLogin users',
    });

    // ========================================
    // Sui (Nasun Wallet) Authentication
    // ========================================

    // 1. Nonce 저장용 DynamoDB 테이블 (MetaMask 테이블과 완전 분리 — IAM 격리, CloudWatch 관측성)
    const suiNonceTable = new dynamodb.Table(this, 'SuiAuthNoncesTable', {
      tableName: 'SuiAuthNonces',
      partitionKey: { name: 'walletAddress', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // nonce는 TTL 임시 데이터이므로 삭제 허용
    });

    // 2. Sui Auth Lambda 함수
    const suiAuthFunction = new NodejsFunction(this, 'SuiAuthFunction', {
      functionName: 'nasun-auth-sui',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'auth-sui', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions, // @mysten/sui is bundled (only @aws-sdk/* is external)
      timeout: cdk.Duration.seconds(30),
      memorySize: 256, // extra memory for @mysten/sui bundle cold start (same as zkLogin Lambda)
      environment: {
        // AWS-exit grace: route mint to the self-hosted issuer when configured (else Cognito).
        ...issuerMintEnv(),
        // AWS-exit DAL S1.2: also mirror the profile write to the box nasun-identity service when wired.
        ...identityWriteEnv(),
        NONCE_TABLE_NAME: suiNonceTable.tableName,
        USER_PROFILES_TABLE: props.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || '',
        COGNITO_DEVELOPER_PROVIDER_NAME: process.env.COGNITO_DEVELOPER_PROVIDER_NAME || 'nasun.io',
        WALLET_PROOF_SECRET_NAME: walletProofSecretName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'SuiAuthLambdaLogGroup', {
        logGroupName: '/aws/lambda/nasun-auth-sui',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    // 3. DynamoDB 권한 부여
    suiNonceTable.grantReadWriteData(suiAuthFunction);
    props.userProfilesTable.grantReadWriteData(suiAuthFunction);

    // 4. Cognito 권한 부여
    suiAuthFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-identity:GetId',
          'cognito-identity:GetCredentialsForIdentity',
          'cognito-identity:GetOpenIdTokenForDeveloperIdentity',
        ],
        resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`],
      })
    );

    // 5. Secrets Manager 권한 (wallet proof secret)
    suiAuthFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${walletProofSecretName}-*`,
        ],
      }),
    );

    // 6. API Gateway for Sui Auth
    this.suiAuthApi = new apigw.RestApi(this, 'SuiAuthApi', {
      restApiName: 'Sui Auth Service',
      description: 'API for Nasun Wallet (Sui Ed25519) authentication',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        throttlingBurstLimit: 500,
        throttlingRateLimit: 200,
      },
    });

    const suiAuth = this.suiAuthApi.root.addResource('auth');
    const sui = suiAuth.addResource('sui');

    // POST /auth/sui/prepare. C3a: box compute (self-custody Ed25519 + zkLogin ephemeral, in-memory nonce).
    const suiPrepareResource = sui.addResource('prepare');
    suiPrepareResource.addMethod('POST', c3aProxy('sui/prepare'));

    // POST /auth/sui/connect-verify. C3a: box compute (handles both self-custody and zkLogin branches).
    const suiConnectVerifyResource = sui.addResource('connect-verify');
    suiConnectVerifyResource.addMethod('POST', c3aProxy('sui/connect-verify'));

    // 7. CloudFormation Outputs
    new cdk.CfnOutput(this, 'SuiAuthApiUrl', {
      value: this.suiAuthApi.url,
      description: 'The URL of the Sui Auth API Gateway',
      exportName: 'SuiAuthApiUrl',
    });

    new cdk.CfnOutput(this, 'SuiNonceTableName', {
      value: suiNonceTable.tableName,
      description: 'DynamoDB table for Sui wallet auth nonces',
    });

    // ========== WAF associations (shared WebACL) ==========

    const wafTargets: { id: string; api: apigw.RestApi }[] = [
      { id: 'TwitterAuthWafAssociation', api: twitterAuthApi },
      { id: 'MetaMaskAuthWafAssociation', api: this.metamaskAuthApi },
      { id: 'MetaMaskAdditionalWafAssociation', api: metamaskAdditionalApi },
      { id: 'SolanaAdditionalWafAssociation', api: solanaAdditionalApi },
      { id: 'SuiAdditionalWafAssociation', api: suiAdditionalApi },
      { id: 'ZkLoginAuthWafAssociation', api: this.zkLoginAuthApi },
      { id: 'SuiAuthWafAssociation', api: this.suiAuthApi },
    ];
    for (const { id, api } of wafTargets) {
      new wafv2.CfnWebACLAssociation(this, id, {
        resourceArn: api.deploymentStage.stageArn,
        webAclArn: props.sharedWafArn,
      });
    }
  }
}
