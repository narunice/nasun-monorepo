import * as dotenv from "dotenv";
dotenv.config();
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from './constants/cors';
import { issuerVerifyEnv } from './issuer-env';
import { identityWriteEnv, identityReadEnv } from './identity-env';

export interface CommonStackProps extends cdk.StackProps {
  // 필요한 경우 다른 스택 참조 추가
}

export class CommonStack extends cdk.Stack {
  public readonly priceApiGateway: apigw.LambdaRestApi;
  public readonly priceUpdaterLambda: lambda.Function;
  public readonly userProfilesTable: dynamodb.ITable;
  public readonly governanceApi: apigw.LambdaRestApi;
  public readonly governanceApiLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: CommonStackProps) {
    super(scope, id, props);

    // ========================================
    // DynamoDB 테이블 참조 (기존 테이블 사용)
    // ========================================
    const cryptoBackupPricesTable = dynamodb.Table.fromTableName(
      this,
      "CryptoBackupPricesTable",
      "CryptoBackupPrices"
    );
    const nftImagesTable = dynamodb.Table.fromTableName(
      this,
      "SupplyCountTable",
      "NftImages"
    );
    this.userProfilesTable = dynamodb.Table.fromTableName(
      this,
      "UserProfilesTable",
      "UserProfiles"
    );
    const userIdentityMapTable = dynamodb.Table.fromTableName(
      this,
      "UserIdentityMapTable",
      "UserIdentityMap"
    );
    const cryptoPricesTable = dynamodb.Table.fromTableName(
      this,
      "CryptoPricesTable",
      "CryptoPrices"
    );

    // UserWallets table — multi-wallet registration (PK: identityId, SK: walletAddress)
    const userWalletsTable = new dynamodb.Table(this, "UserWalletsTable", {
      tableName: "UserWallets",
      partitionKey: { name: "identityId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "walletAddress", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Alliance Mint table — one NFT mint per account (PK: identityId)
    const allianceMintTable = new dynamodb.Table(this, "AllianceMintTable", {
      tableName: "nasun-alliance-mint",
      partitionKey: { name: "identityId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // AddressBooks DDB table removed (wallet/address-book de-Lambda Phase 5 teardown, 2026-06-23).
    // box nasun-address-book (:3215) is SoT. RemovalPolicy.RETAIN orphans the table on this removal;
    // it is manually deleted after the box >= DDB reconcile (verified 0 missing / 0 stale).

    // ========================================
    // Common NodejsFunction options
    // ========================================
    const lambdaSrcPath = path.join(__dirname, '..', 'lambda-src');
    const depsLockFilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');
    const bundlingOptions = {
      minify: true,
      sourceMap: true,
      externalModules: [
        '@aws-sdk/client-dynamodb',
        '@aws-sdk/lib-dynamodb',
        '@aws-sdk/util-dynamodb',
        '@aws-sdk/client-s3',
        '@aws-sdk/s3-request-presigner',
        '@aws-sdk/client-cognito-identity',
        '@aws-sdk/client-secrets-manager',
      ],
    };

    // ========================================
    // 1. NFT/Supply Lambda 함수들
    // ========================================

    // 1-1. Get Backup Prices
    const getBackupPricesLambda = new NodejsFunction(this, "GetBackupPricesLambda", {
      functionName: "nasun-common-get-backup-prices",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'get-backup-prices', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        TABLE_NAME: cryptoBackupPricesTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      logGroup: new logs.LogGroup(this, "GetBackupPricesLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-backup-prices",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoBackupPricesTable.grantReadData(getBackupPricesLambda);

    const getBackupPricesApi = new apigw.LambdaRestApi(this, "GetBackupPricesApi", {
      handler: getBackupPricesLambda,
      restApiName: "NASUN Get Backup Prices API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // 1-2. Random Image Handler
    const randomImageHandlerLambda = new NodejsFunction(this, "RandomImageHandlerLambda", {
      functionName: "nasun-common-random-image-handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'randomImageHandler', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        TABLE_NAME: nftImagesTable.tableName,
        MAX_MINT_COUNTS: '{"TIER1":1,"TIER2":2,"TIER3":3,"TIER4":4,"TIER5":100}',
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, "RandomImageHandlerLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-random-image-handler",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    nftImagesTable.grantReadWriteData(randomImageHandlerLambda);

    const randomImageApi = new apigw.LambdaRestApi(this, "RandomImageApi", {
      handler: randomImageHandlerLambda,
      restApiName: "NASUN Random Image API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // ========================================
    // 2. User Profile Lambda 함수들
    // ========================================

    // 2-0. Public avatar S3 bucket (ecosystem-wide profile image storage).
    // Stores customAvatarKey objects under prefix `profile-images/{identityId}/`.
    // Public-readable so all Nasun apps (nasun-website, pado, gostop, explorer)
    // can display avatars without auth. CORS allows the entire ecosystem.
    const publicAvatarsBucket = new s3.Bucket(this, "PublicAvatarsBucket", {
      bucketName: `nasun-public-avatars-${this.account}`,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: false,
        ignorePublicAcls: true,
        restrictPublicBuckets: false,
      }),
      publicReadAccess: false,
      cors: [
        {
          allowedOrigins: [
            'https://nasun.io',
            'https://staging.nasun.io',
            'https://pado.finance',
            'https://gostop.app',
            'https://explorer.nasun.io',
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:5176',
          ],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.POST, s3.HttpMethods.PUT],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    // Allow public GET on profile-images/* only (not the entire bucket).
    publicAvatarsBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'PublicReadProfileImages',
      effect: iam.Effect.ALLOW,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:GetObject'],
      resources: [`${publicAvatarsBucket.bucketArn}/profile-images/*`],
    }));
    const publicAvatarsBaseUrl = `https://${publicAvatarsBucket.bucketName}.s3.${this.region}.amazonaws.com`;

    // 2-1. Get User Profile
    const getUserProfileLambda = new NodejsFunction(this, "GetUserProfileLambda", {
      functionName: "nasun-common-get-user-profile",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'get-user-profile', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(15),
      environment: {
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        USER_IDENTITY_MAP_TABLE: userIdentityMapTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        COGNITO_IDENTITY_POOL_ID: (() => {
          const poolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID;
          if (!poolId) throw new Error('VITE_COGNITO_IDENTITY_POOL_ID is required for user-profile JWT auth');
          return poolId;
        })(),
        USER_WALLETS_TABLE: userWalletsTable.tableName,
        // Avatar uploads
        PUBLIC_AVATARS_BUCKET: publicAvatarsBucket.bucketName,
        PUBLIC_AVATARS_BASE_URL: publicAvatarsBaseUrl,
        MAX_AVATAR_SIZE_BYTES: '2097152',
        // Display-name rate limit
        RATE_LIMIT_WINDOW_DAYS: '30',
        RATE_LIMIT_MAX: '15',
        // Webhook fan-out targets (optional; empty disables).
        CHAT_SERVER_INVALIDATE_URL: process.env.CHAT_SERVER_INVALIDATE_URL || '',
        CHAT_SERVER_INVALIDATE_TOKEN: process.env.CHAT_SERVER_INVALIDATE_TOKEN || '',
        EXPLORER_API_INVALIDATE_URL: process.env.EXPLORER_API_INVALIDATE_URL || '',
        EXPLORER_API_INVALIDATE_TOKEN: process.env.EXPLORER_API_INVALIDATE_TOKEN || '',
        LEADERBOARD_SYNC_URL: process.env.LEADERBOARD_SYNC_URL || '',
        LEADERBOARD_SYNC_TOKEN: process.env.LEADERBOARD_SYNC_TOKEN || '',
        // AWS-exit DAL S2.C: box mirror reader (shadow/flip) + PATCH/POST self-write dual-write.
        // identityReadEnv() drives the read cutover; identityWriteEnv() activates the dual-write so
        // a profile edit (display name / avatar / linked Sui|Solana) and a profile create also land
        // on the box, eliminating the post-edit <=10min /by-wallet staleness (dal-reload was the
        // interim backstop). Both fragments return {} when their cdk .env vars are unset. The box
        // write routes (/profile/attributes-sync, /profile/create-mirror) are additive + never-throws
        // (DynamoDB stays SoT). Roll back by unsetting the vars and redeploying.
        ...identityReadEnv(),
        ...identityWriteEnv(),
      },
      logGroup: new logs.LogGroup(this, "GetUserProfileLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-user-profile",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(getUserProfileLambda);
    userIdentityMapTable.grantReadData(getUserProfileLambda);
    userWalletsTable.grantReadData(getUserProfileLambda);
    // Avatar upload (presigned POST) requires PutObject; delete-on-replace
    // requires DeleteObject. Limit to the avatar prefix.
    publicAvatarsBucket.grantPut(getUserProfileLambda, 'profile-images/*');
    publicAvatarsBucket.grantDelete(getUserProfileLambda, 'profile-images/*');

    // AWS-exit de-Lambda (get-user-profile ROOT GET READS): serve ONLY the PUBLIC root GET reads
    // (?walletAddress / ?identityId) directly from the box compute service
    // (https://issuer.nasun.io/compute/profile) via HTTP_PROXY, removing the Lambda hop for the frontend's
    // primary profile lookup. The reads are box-owned -- the lambda already flip-served them from the box
    // (IDENTITY_READ_MODE=flip), and an E2E proved the box response is byte-identical (by-wallet + by-identity
    // + 404 + 400 + CORS). The RestApi construct id is unchanged ("UserProfileApi") so the execute-api URL is
    // preserved (baked into the frontend + cross-app builds).
    // The lambda RETAINS only the {proxy+} greedy for SUB-PATHS. The lambda dispatches on httpMethod +
    // event.path, so it serves real sub-paths: POST /upload-avatar-url (avatar S3 presign, index.ts:703) and
    // GET /v3/user-profile?walletAddress= (chat-server display-name/avatar + zkLogin verifyAddressExists).
    // Keeping {proxy+} ANY -> lambda preserves those exactly (proxy:true behavior). Routing changes vs the
    // old LambdaRestApi: root GET -> box (C7), root POST create -> box (#2a), root PATCH update -> box (#2b),
    // GET /v3/user-profile -> box (C7 follow-up). After #2b the lambda serves ONLY the avatar sub-path +
    // /v3 read. OPTIONS preflight stays an
    // API-GW MOCK (defaultCorsPreflightOptions). ROLLBACK: revert this block to
    // `new apigw.LambdaRestApi(this, "UserProfileApi", { handler: getUserProfileLambda, proxy: true, ... })`.
    const userProfileApi = new apigw.RestApi(this, "UserProfileApi", {
      restApiName: "NASUN User Profile API (Common)",
      deployOptions: {
        throttlingBurstLimit: 50,
        throttlingRateLimit: 20,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });
    const userProfileLambdaIntegration = new apigw.LambdaIntegration(getUserProfileLambda);
    // Root GET reads -> box compute (HTTP_PROXY; the incoming query string is forwarded). Byte-identical to
    // the lambda flip-path; box is SoT (no DynamoDB fallback -> a box-absent profile is 404, reconcile keeps
    // missing_in_box=0).
    userProfileApi.root.addMethod("GET", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/profile",
      { httpMethod: "GET", proxy: true }
    ));
    // Root POST create -> box compute (HTTP_PROXY, #2a). The box compute POST /compute/profile ports the
    // lambda create path byte-for-byte (verifyJwt -> identityId == authenticated -> provider/username
    // required -> social-provider block -> create-only 409 -> box :3211 /profile/create-mirror, box-only,
    // no DynamoDB). The avatar POST /upload-avatar-url sub-path stays on the lambda via {proxy+}. ROLLBACK:
    // revert this POST method to `userProfileLambdaIntegration` + redeploy (the lambda stays live for PATCH
    // + {proxy+}). Same construct id preserves the execute-api id (no frontend rebuild).
    userProfileApi.root.addMethod("POST", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/profile",
      { httpMethod: "POST", proxy: true }
    ));
    // Root PATCH update -> box compute (HTTP_PROXY, #2b). The box compute PATCH /compute/profile ports the
    // lambda update path byte-for-byte (validate -> displayName rate-limit [atomic CAS] -> avatar ban ->
    // paste-linked sui/solana cross-account collision [anti-Sybil fail-closed] -> box :3211
    // /profile/attributes-sync, box-only, no DynamoDB). The avatar POST /upload-avatar-url + the S3
    // delete-on-replace stay on the lambda ({proxy+}; box has no S3 egress). ROLLBACK: revert this PATCH
    // method to `userProfileLambdaIntegration` + redeploy (the lambda stays live for {proxy+}).
    userProfileApi.root.addMethod("PATCH", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/profile",
      { httpMethod: "PATCH", proxy: true }
    ));
    // {proxy+} greedy -> lambda: the remaining sub-paths stay on the lambda exactly as proxy:true routed
    // them (POST /upload-avatar-url avatar S3 presign). Added as an explicit {proxy+} resource (NOT
    // root.addProxy(), which also synthesizes a spurious root ANY->MOCK method) so the root keeps exactly
    // GET/POST/PATCH(->box)/OPTIONS(MOCK) and the greedy child carries ANY->lambda.
    const userProfileProxy = userProfileApi.root.addResource("{proxy+}");
    userProfileProxy.addMethod("ANY", userProfileLambdaIntegration);

    // AWS-exit de-Lambda (C7 follow-up): the LAST get-user-profile READ caller on the lambda is the
    // chat-server (server-side) GET /v3/user-profile?walletAddress= (display-name/avatar cache + zkLogin
    // ephemeral-key auth gate, auth.ts/store.ts/server.ts). The frontends (nasun/pado/gostop) already read
    // the box via the ROOT GET -- their VITE_*USER_PROFILE_API is the root URL with ?walletAddress= /
    // ?identityId= appended. Lift the chat-server path to the box too by routing the SPECIFIC
    // /v3/user-profile resource's GET to the box compute (the SAME /compute/profile endpoint the root GET
    // already serves; byte-identical by-wallet body, proven by the C7 root cutover). A specific resource is
    // matched ahead of {proxy+}, so ONLY GET /v3/user-profile is lifted; every other method/path still
    // falls to {proxy+} ANY -> lambda (avatar presign, root POST/PATCH writes). After this the
    // get-user-profile lambda is write-only. ROLLBACK: delete this resource block -> GET /v3/user-profile
    // falls back to {proxy+} -> lambda (which still flip-serves the box). reconcile-neutral (read repoint).
    const userProfileV3 = userProfileApi.root.addResource("v3");
    const userProfileV3Read = userProfileV3.addResource("user-profile");
    userProfileV3Read.addMethod("GET", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/profile",
      { httpMethod: "GET", proxy: true }
    ));

    // 2-2. Link Account
    const linkAccountLambda = new NodejsFunction(this, "LinkAccountLambda", {
      functionName: "nasun-common-link-account",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'link-account', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        // AWS-exit grace: accept issuer-signed JWTs via dual-JWKS when configured (else Cognito-only).
        ...issuerVerifyEnv(),
        // AWS-exit DAL S2.A: mirror account-linking writes to the box nasun-identity service when wired.
        ...identityWriteEnv(),
        // AWS-exit DAL read-flip (S2): box-served twitterId uniqueness dedup (/profile/by-twitter-id)
        // with DynamoDB fallback. FAIL-SAFE: {} when IDENTITY_READ_URL/SECRET unset; IDENTITY_READ_MODE
        // =flip activates it. Roll back by unsetting the vars (or IDENTITY_READ_MODE) and redeploying.
        ...identityReadEnv(),
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || "",
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        GENESIS_PASS_ALLOWLIST_TABLE: "nasun-genesis-pass-allowlist",
        // Onboarding bonus: referral-only social-link bonuses
        REFERRALS_TABLE: "nasun-referrals",
        EXPLORER_API_URL: process.env.EXPLORER_API_URL || "",
        ONBOARDING_BONUS_API_KEY: process.env.ONBOARDING_BONUS_API_KEY || "",
      },
      timeout: cdk.Duration.seconds(10),
      logGroup: new logs.LogGroup(this, "LinkAccountLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-link-account",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(linkAccountLambda);
    const genesisPassAllowlistForLink = dynamodb.Table.fromTableName(
      this, "GenesisPassAllowlistForLink", "nasun-genesis-pass-allowlist"
    );
    genesisPassAllowlistForLink.grantReadWriteData(linkAccountLambda);
    // Read-only on nasun-referrals for onboarding bonus referral-status check
    const nasunReferralsForLink = dynamodb.Table.fromTableName(
      this, "NasunReferralsForLink", "nasun-referrals"
    );
    nasunReferralsForLink.grantReadData(linkAccountLambda);

    // #3b de-Lambda link-account: link / unlink / admin-link -> box compute (HTTP_PROXY). The box compute
    // POST /compute/link{,/unlink,/admin-link} ports the lambda byte-for-byte (verifyJwt dual-jwks ->
    // ownership/admin -> box reads (by-identity/by-twitter-id) -> box link-sync/attributes-sync, box-only PG,
    // NO DynamoDB; onboarding-bonus delegated to explorer-api). Converted from LambdaRestApi(proxy:true) to a
    // plain RestApi with the SAME construct id so the execute-api id is preserved (no frontend rebuild;
    // VITE_LINK_ACCOUNT_API unchanged). The frontend hits root POST (useWalletAuth/EvmWalletLink/
    // useWhitelistRegistration) + /link (authApi) for the link flow, /unlink (useAccountLinking/uju), and
    // /admin-link (admin tool). register-evm (410) + EVERY other path STAY on the lambda via the explicit
    // {proxy+} ANY mount (NOT root.addProxy(), which would synthesize a spurious root ANY->MOCK), so the box
    // serves ONLY the three lifted routes. root ANY -> lambda gives exact proxy:true parity for non-POST root
    // (the lambda 405s them). OPTIONS preflight stays an API-GW MOCK (defaultCorsPreflightOptions). ROLLBACK:
    // revert this block to LambdaRestApi(proxy:true) + redeploy (the lambda stays defined + granted as the
    // rollback target).
    const linkAccountApi = new apigw.RestApi(this, "LinkAccountApi", {
      restApiName: "NASUN Link Account API (Common)",
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });
    const linkLambdaIntegration = new apigw.LambdaIntegration(linkAccountLambda);
    // root POST (link) + /link POST (link) -> box /compute/link (HTTP_PROXY; Authorization + body forwarded).
    linkAccountApi.root.addMethod("POST", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/link", { httpMethod: "POST", proxy: true }
    ));
    linkAccountApi.root.addResource("link").addMethod("POST", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/link", { httpMethod: "POST", proxy: true }
    ));
    linkAccountApi.root.addResource("unlink").addMethod("POST", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/link/unlink", { httpMethod: "POST", proxy: true }
    ));
    linkAccountApi.root.addResource("admin-link").addMethod("POST", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/link/admin-link", { httpMethod: "POST", proxy: true }
    ));
    // {proxy+} ANY -> lambda (register-evm 410 + any other path) + root ANY -> lambda (non-POST root parity).
    // A specific resource (link/unlink/admin-link) is matched ahead of {proxy+}.
    linkAccountApi.root.addResource("{proxy+}").addMethod("ANY", linkLambdaIntegration);
    linkAccountApi.root.addMethod("ANY", linkLambdaIntegration);

    // 2-3. Wallet API — REMOVED (wallet/address-book de-Lambda Phase 5 teardown, 2026-06-23).
    // The address-book service is box nasun-address-book (:3215); register/remove/list are box
    // nasun-identity-compute (:3212). api.nasun.io/wallet/* is nginx-routed to box (GW 6pnnb6hcrd dead,
    // no traffic). This removes walletApiLambda (nasun-common-wallet-api) + WalletApi RestApi
    // (6pnnb6hcrd) + log group + DDB grants. userProfiles/userWallets tables are shared and kept.

    // 2-4. Governance API (with VotingPowerCertificate + Sponsored Transaction)
    this.governanceApiLambda = new NodejsFunction(this, "GovernanceApiLambda", {
      functionName: "nasun-common-governance-api",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'governance-api', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      environment: {
        // AWS-exit grace: accept issuer-signed JWTs via dual-JWKS when configured (else Cognito-only).
        ...issuerVerifyEnv(),
        // AWS-exit DAL read-flip (S5): box-served voting-identity resolution (/profile/voting-identity)
        // with DynamoDB fallback. FAIL-SAFE: {} when IDENTITY_READ_URL/SECRET unset; IDENTITY_READ_MODE
        // =flip activates it. Roll back by unsetting the vars (or IDENTITY_READ_MODE) and redeploying.
        ...identityReadEnv(),
        // AWS-exit DAL governanceVotes migration: authoritative box duplicate-vote guard
        // (/governance/vote-claim + vote-release). Needs IDENTITY_WRITE_URL/SECRET; the lambda calls
        // authoritativeIdentityWriteJson which THROWS if unset, so this must be wired before deploy.
        ...identityWriteEnv(),
        // Leaderboard V3 tables (accounts + seasons for rank lookup)
        LEADERBOARD_V3_ACCOUNTS_TABLE: "leaderboard-v3-accounts",
        LEADERBOARD_V3_SEASONS_TABLE: "leaderboard-v3-seasons",
        LEADERBOARD_V3_SNAPSHOTS_TABLE: "leaderboard-v3-snapshots",
        // User resolution tables (2-hop: UserWallets -> UserProfiles)
        USER_WALLETS_TABLE: "UserWallets",
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        // VotingPowerCertificate + Sponsored Transaction
        SUI_RPC_URL: process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io",
        GOVERNANCE_PACKAGE_ID: process.env.GOVERNANCE_PACKAGE_ID || "0x17df8431dd61bcdfc0dae120c915150634edecb911bf7368d0af43e2bbd69c5a",
        GOVERNANCE_ORIGINAL_PACKAGE_ID: process.env.GOVERNANCE_ORIGINAL_PACKAGE_ID || "0x3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3",
        GOVERNANCE_MULTI_CHOICE_PACKAGE_ID: process.env.GOVERNANCE_MULTI_CHOICE_PACKAGE_ID || "0xa1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a",
        PROPOSAL_TYPE_REGISTRY_ID: process.env.PROPOSAL_TYPE_REGISTRY_ID || "0xf69db2507deac2437e93e2ab4f895a856f672d1c3dca1de19b6d90f5f5dceb0b",
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        // Alliance NFT minting
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || "",
        ALLIANCE_MINT_TABLE: "nasun-alliance-mint",
        ALLIANCE_PACKAGE_ID: "0xef29f3b4eaaefd35a1c7b2684122b1538f1a996da55657d0867b96019988df0b",
        ALLIANCE_REGISTRY_ID: "0xed64e2d9661dde6f6f6fb303680c4ab7c95f9070c41e967b746299610ca7b00f",
        ALLIANCE_ADMIN_ID: "0x6d95e0abd50784e01b106f86bfe5474a3a895059fb67d4c4a5147f03e694791c",
      },
      logGroup: new logs.LogGroup(this, "GovernanceApiLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-governance-api",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    // Grant V3 leaderboard table read access (accounts + seasons for rank lookup)
    const v3AccountsTable = dynamodb.Table.fromTableName(this, "V3AccountsTableRef", "leaderboard-v3-accounts");
    const v3SeasonsTable = dynamodb.Table.fromTableName(this, "V3SeasonsTableRef", "leaderboard-v3-seasons");
    const v3SnapshotsTable = dynamodb.Table.fromTableName(this, "V3SnapshotsTableRef", "leaderboard-v3-snapshots");
    v3AccountsTable.grantReadData(this.governanceApiLambda);
    v3SeasonsTable.grantReadData(this.governanceApiLambda);
    v3SnapshotsTable.grantReadData(this.governanceApiLambda);

    // Grant GSI query access (grantReadData only covers base table, not indexes)
    this.governanceApiLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:Query"],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/leaderboard-v3-accounts/index/*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/leaderboard-v3-snapshots/index/*`,
      ],
    }));

    // Grant user resolution table access (UserWallets read + UserProfiles read/write for vote dedup)
    const userWalletsTableRef = dynamodb.Table.fromTableName(this, "UserWalletsTableRef", "UserWallets");
    userWalletsTableRef.grantReadData(this.governanceApiLambda);
    this.userProfilesTable.grantReadWriteData(this.governanceApiLambda);

    // Grant Alliance mint table access
    allianceMintTable.grantReadWriteData(this.governanceApiLambda);

    // Grant Secrets Manager access for Oracle/Sponsor keypairs
    this.governanceApiLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun/governance/*`,
      ],
    }));

    // C6a AWS-exit de-Lambda: converted from LambdaRestApi(proxy:true) to a plain RestApi so a single
    // route (/sponsor) can be repointed to the box compute while the rest still hit the Lambda. The
    // greedy {proxy+}->Lambda is re-created below via addProxy (reproduces the LambdaRestApi behavior),
    // plus an explicit /sponsor->box. cdk diff MUST show replace:0 on the existing proxy resource/methods
    // (the restApiId 4xf3e5t8zc is baked into the frontend build and must NOT change); abort if not.
    this.governanceApi = new apigw.RestApi(this, "GovernanceApi", {
      restApiName: "NASUN Governance API (Common)",
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
      deployOptions: {
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      },
    });

    // Gateway Responses: ensure CORS headers on throttled / 4xx / 5xx responses.
    // Without these, browsers surface the real 429 as a generic "no CORS header" error.
    const governanceGatewayCorsHeaders = {
      'Access-Control-Allow-Origin': "'https://nasun.io'",
      'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
    };
    this.governanceApi.addGatewayResponse("GovernanceApiThrottled", {
      type: apigw.ResponseType.THROTTLED,
      responseHeaders: governanceGatewayCorsHeaders,
    });
    this.governanceApi.addGatewayResponse("GovernanceApiDefault4xx", {
      type: apigw.ResponseType.DEFAULT_4XX,
      responseHeaders: governanceGatewayCorsHeaders,
    });
    this.governanceApi.addGatewayResponse("GovernanceApiDefault5xx", {
      type: apigw.ResponseType.DEFAULT_5XX,
      responseHeaders: governanceGatewayCorsHeaders,
    });

    // C6a AWS-exit de-Lambda: repoint POST /sponsor to the box identity-compute (Sui sponsor signing)
    // via HTTP_PROXY (https://issuer.nasun.io/compute/governance/sponsor -> nginx strips /compute/ ->
    // :3212 /governance/sponsor), shadowing the greedy {proxy+} for this ONE path. The other governance
    // routes (/voting-power, /certificate, /config, /alliance/*) still hit governanceApiLambda. The box
    // validates + Ed25519-signs identically (shadow-parity verified 2026-06-14: missing-fields /
    // unauthorized-target / NOT_SPONSORED responses byte-match the Lambda). OPTIONS preflight stays a MOCK
    // (this resource's own defaultCorsPreflightOptions), parity with the API-level preflight on the other
    // routes. REVERSIBLE: delete this block to roll /sponsor back to the Lambda (kept deployed-but-bypassed).
    this.governanceApi.root.addResource("sponsor", {
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    }).addMethod("POST", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/governance/sponsor",
      { httpMethod: "POST", proxy: true },
    ));

    // C6b AWS-exit de-Lambda: repoint /config (GET), /voting-power (GET), /certificate (POST) to the box
    // identity-compute. /config is static; /voting-power resolves the box voting-identity + a residual rank
    // lambda; /certificate Oracle-signs the same byte-exact message (RFC-8032 Ed25519 parity verified) +
    // runs the box governance_votes dup-guard. Each explicit resource shadows the greedy {proxy+}; the
    // remaining routes (/alliance/*) stay on the Lambda. REVERSIBLE per route (delete the block).
    this.governanceApi.root.addResource("config", {
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    }).addMethod("GET", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/governance/config",
      { httpMethod: "GET", proxy: true },
    ));
    this.governanceApi.root.addResource("voting-power", {
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    }).addMethod("GET", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/governance/voting-power",
      { httpMethod: "GET", proxy: true },
    ));
    this.governanceApi.root.addResource("certificate", {
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    }).addMethod("POST", new apigw.HttpIntegration(
      "https://issuer.nasun.io/compute/governance/certificate",
      { httpMethod: "POST", proxy: true },
    ));

    // The remaining governance routes (/alliance/status, /alliance/mint, and any future path) keep hitting
    // the Lambda via the greedy {proxy+} + root ANY -- reproduces what LambdaRestApi(proxy:true) created, so
    // the proxy resource/method logical ids stay stable (verify replace:0 in cdk diff).
    this.governanceApi.root.addMethod("ANY", new apigw.LambdaIntegration(this.governanceApiLambda));
    this.governanceApi.root.addProxy({
      anyMethod: true,
      defaultIntegration: new apigw.LambdaIntegration(this.governanceApiLambda),
    });

    // ========================================
    // 3. Price API Lambda 함수들
    // ========================================

    // 3-1. Update Backup Prices
    const updateBackupPricesLambda = new NodejsFunction(this, "UpdateBackupPricesLambda", {
      functionName: "nasun-common-update-backup-prices",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'update-backup-prices', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        CMC_API_KEY: process.env.CMC_API_KEY || "",
        TABLE_NAME: cryptoBackupPricesTable.tableName
      },
      logGroup: new logs.LogGroup(this, "UpdateBackupPricesLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-update-backup-prices",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoBackupPricesTable.grantWriteData(updateBackupPricesLambda);

    // 3-2. Price API
    const priceApiLambda = new NodejsFunction(this, "PriceApiLambda", {
      functionName: "nasun-common-price-api",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'PriceAPI', 'src', 'lambda-handler.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {},
      logGroup: new logs.LogGroup(this, "PriceApiLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-price-api",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoPricesTable.grantReadData(priceApiLambda);
    cryptoBackupPricesTable.grantReadData(priceApiLambda);

    // 3-3. Price Updater
    this.priceUpdaterLambda = new NodejsFunction(this, "PriceUpdaterLambda", {
      functionName: "nasun-common-price-updater",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'PriceAPI', 'src', 'price-updater-handler.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.minutes(5),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, "PriceUpdaterLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-price-updater",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoBackupPricesTable.grantReadWriteData(this.priceUpdaterLambda);
    cryptoPricesTable.grantReadWriteData(this.priceUpdaterLambda);

    this.priceApiGateway = new apigw.LambdaRestApi(this, "PriceApiGateway", {
      handler: priceApiLambda,
      restApiName: "NASUN Price API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // 3-4. Price Update Rule (EventBridge)
    const priceUpdateRule = new events.Rule(this, "PriceUpdateRule", {
      ruleName: "nasun-common-price-update",
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      description: "Trigger price updates every minute (Common Stack)",
    });
    priceUpdateRule.addTarget(new targets.LambdaFunction(this.priceUpdaterLambda));

    // ========================================
    // 5. User Account Management (Deactivation & Purge)
    // ========================================

    // ✅ Lambda Authorizer 제거: identityId 기반 인증으로 변경
    // 로그인 시스템을 건드리지 않기 위해 Custom Token Authorizer를 사용하지 않음

    // 5-2. Deactivate Account API: DECOMMISSIONED (AWS-exit P2, 2026-06-17). The deactivate flow is served
    // by the box compute via api.nasun.io; the standalone execute-api + nasun-common-deactivate-user-account
    // lambda were removed after stale-client traffic drained to ~0. The purge cron (5-3) is independent.

    // 5-3. Purge Deactivated Accounts Lambda (Scheduled)
    const purgeDeactivatedAccountsLambda = new NodejsFunction(this, "PurgeDeactivatedAccountsLambda", {
      functionName: "nasun-common-purge-deactivated-accounts",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'purge-deactivated-accounts', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        // AWS-exit DAL 3d step-2: mirror the row deletion to the box nasun-identity service when wired.
        // FAIL-SAFE: {} when IDENTITY_WRITE_URL/SECRET unset. (No timeout raise needed: this is a 5-min
        // batch job, so the authoritative box-write budget already fits.)
        ...identityWriteEnv(),
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || "",
        // #3a-1 purge scan-source toggle: "box" enumerates the box /profile/deactivated-due route (the box-only
        // deactivate queue once #3a-2 flips) via IDENTITY_WRITE_URL/SECRET; unset/"ddb" keeps the DynamoDB Scan.
        // Only emitted when set, so the pre-flip deploy leaves it absent -> the lambda defaults to "ddb"
        // (byte-identical behavior). Flip by setting PURGE_SCAN_SOURCE=box in the CDK .env + redeploy; rollback
        // by unsetting + redeploy.
        ...(process.env.PURGE_SCAN_SOURCE ? { PURGE_SCAN_SOURCE: process.env.PURGE_SCAN_SOURCE } : {}),
      },
      timeout: cdk.Duration.minutes(5),
      logGroup: new logs.LogGroup(this, "PurgeDeactivatedAccountsLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-purge-deactivated-accounts",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(purgeDeactivatedAccountsLambda);

    const purgeAccountsRule = new events.Rule(this, "PurgeAccountsRule", {
      ruleName: "nasun-common-purge-deactivated-accounts-daily",
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      description: "Trigger to purge deactivated accounts daily (Common Stack)",
    });
    purgeAccountsRule.addTarget(new targets.LambdaFunction(purgeDeactivatedAccountsLambda));

    // 6. Get User Count API: DECOMMISSIONED (AWS-exit P2, 2026-06-17). The count is served by the box
    // compute via api.nasun.io; the standalone execute-api + nasun-common-get-user-count lambda were
    // removed after stale-client traffic drained to ~0.

    // ========================================
    // 7. SSM Parameters
    // ========================================

    new ssm.StringParameter(this, 'PriceApiUrlParam', {
      parameterName: '/nasun/common/price-api-url',
      stringValue: this.priceApiGateway.url,
      description: 'CommonStack Price API URL',
    });

    new ssm.StringParameter(this, 'GetBackupPricesApiUrlParam', {
      parameterName: '/nasun/common/get-backup-prices-api-url',
      stringValue: getBackupPricesApi.url,
      description: 'CommonStack Get Backup Prices API URL',
    });

    new ssm.StringParameter(this, 'UserProfileApiUrlParam', {
      parameterName: '/nasun/common/user-profile-api-url',
      stringValue: userProfileApi.url,
      description: 'CommonStack User Profile API URL',
    });

    // ========================================
    // 6. Stack Outputs
    // ========================================

    new cdk.CfnOutput(this, "PriceApiUrl", {
      value: this.priceApiGateway.url,
      description: "Price API Gateway URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetBackupPricesApiUrl", {
      value: getBackupPricesApi.url,
      description: "Get Backup Prices API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "RandomImageApiUrl", {
      value: randomImageApi.url,
      description: "Random Image API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "UserProfileApiUrl", {
      value: userProfileApi.url,
      description: "User Profile API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "LinkAccountApiUrl", {
      value: linkAccountApi.url,
      description: "Link Account API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GovernanceApiUrl", {
      value: this.governanceApi.url,
      description: "Governance API URL (CommonStack)",
    });

    // ========================================
    // 10. NFT Whitelist 시스템
    // ========================================
    // NOTE: Renamed from "FoundersNftWhitelist" to "GenesisNftWhitelist"
    // MIGRATION REQUIRED: Before CDK deploy, run data migration script.

    // 10-1. DynamoDB 테이블 생성
    const whitelistTable = new dynamodb.Table(this, "GenesisNftWhitelistTable", {
      tableName: "GenesisNftWhitelist",
      partitionKey: {
        name: "walletAddress",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // 프로덕션 데이터 보호
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true, // 백업 활성화
      },
    });

    // GSI: 날짜별 조회용
    whitelistTable.addGlobalSecondaryIndex({
      indexName: "joinedAt-index",
      partitionKey: {
        name: "status",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "joinedAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 10-2 ~ 10-7. Genesis whitelist Lambdas + APIs RETIRED (AWS-exit #5 Tier-1, 2026-06-15).
    // Genesis raffle is over; all 5 functions had 0 invocations/14d and the frontend chain
    // (useWhitelistRegistration -> JoinWhitelistButton -> KeyBenefitsSection -> GenesisNftPage)
    // is mounted only behind a disabled route. Removed: join/withdraw/check/admin-list/export
    // Lambdas + their LambdaRestApi + grants + whitelistEnv. The GenesisNftWhitelist table is
    // RETAINED (admin-stack export-whitelist reads it by name via fromTableName('GenesisNftWhitelist')).

    // 10-8. CloudFormation Outputs
    new cdk.CfnOutput(this, "WhitelistTableName", {
      value: whitelistTable.tableName,
      description: "Genesis NFT Whitelist DynamoDB Table Name",
    });
    // JoinWhitelistApiUrl/WithdrawWhitelistApiUrl/CheckWhitelistApiUrl/AdminListWhitelistApiUrl/
    // AdminExportWhitelistApiUrl outputs RETIRED with their APIs (AWS-exit #5, 2026-06-15).
  }
}
