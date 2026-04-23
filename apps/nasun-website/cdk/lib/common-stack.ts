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
import * as path from 'path';

import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from './constants/cors';

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

    // AddressBooks table — wallet-signature-based address book sync (PK: walletAddress, SK: recordType)
    const addressBooksTable = new dynamodb.Table(this, "AddressBooksTable", {
      tableName: "AddressBooks",
      partitionKey: { name: "walletAddress", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "recordType", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: "expiresAt",
    });

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

    // 2-1. Get User Profile
    const getUserProfileLambda = new NodejsFunction(this, "GetUserProfileLambda", {
      functionName: "nasun-common-get-user-profile",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'get-user-profile', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
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
      },
      logGroup: new logs.LogGroup(this, "GetUserProfileLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-user-profile",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(getUserProfileLambda);
    userIdentityMapTable.grantReadData(getUserProfileLambda);
    userWalletsTable.grantReadData(getUserProfileLambda);

    const userProfileApi = new apigw.LambdaRestApi(this, "UserProfileApi", {
      handler: getUserProfileLambda,
      restApiName: "NASUN User Profile API (Common)",
      proxy: true,
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

    // 2-2. Link Account
    const linkAccountLambda = new NodejsFunction(this, "LinkAccountLambda", {
      functionName: "nasun-common-link-account",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'link-account', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || "",
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        GENESIS_PASS_ALLOWLIST_TABLE: "nasun-genesis-pass-allowlist",
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

    const linkAccountApi = new apigw.LambdaRestApi(this, "LinkAccountApi", {
      handler: linkAccountLambda,
      restApiName: "NASUN Link Account API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

    // 2-3. Wallet API
    const walletProofSecretName = process.env.WALLET_PROOF_SECRET_NAME || 'nasun-wallet-proof';
    const walletApiLambda = new NodejsFunction(this, "WalletApiLambda", {
      functionName: "nasun-common-wallet-api",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'wallet-api', 'src', 'index.ts'),
      handler: 'handler',
      memorySize: 256,
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        USER_WALLETS_TABLE: userWalletsTable.tableName,
        ADDRESS_BOOKS_TABLE: addressBooksTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || "",
        WALLET_PROOF_SECRET_NAME: walletProofSecretName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      logGroup: new logs.LogGroup(this, "WalletApiLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-wallet-api",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(walletApiLambda);
    userWalletsTable.grantReadWriteData(walletApiLambda);
    addressBooksTable.grantReadWriteData(walletApiLambda);
    walletApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:PutSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${walletProofSecretName}-*`,
        ],
      }),
    );

    const walletApi = new apigw.LambdaRestApi(this, "WalletApi", {
      handler: walletApiLambda,
      restApiName: "NASUN Wallet API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

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

    this.governanceApi = new apigw.LambdaRestApi(this, "GovernanceApi", {
      handler: this.governanceApiLambda,
      restApiName: "NASUN Governance API (Common)",
      proxy: true,
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
    // 4. AWS Credentials Lambda
    // ========================================

    const getAwsCredentialsLambda = new NodejsFunction(this, "GetAwsCredentialsLambda", {
      functionName: "nasun-common-get-aws-credentials",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'get-aws-credentials', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      logGroup: new logs.LogGroup(this, "GetAwsCredentialsLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-aws-credentials",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    getAwsCredentialsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-identity:GetCredentialsForIdentity"],
        resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`]
      })
    );

    const getAwsCredentialsApi = new apigw.LambdaRestApi(this, "GetAwsCredentialsApi", {
      handler: getAwsCredentialsLambda,
      restApiName: "NASUN Get AWS Credentials API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

    // ========================================
    // 5. User Account Management (Deactivation & Purge)
    // ========================================

    // ✅ Lambda Authorizer 제거: identityId 기반 인증으로 변경
    // 로그인 시스템을 건드리지 않기 위해 Custom Token Authorizer를 사용하지 않음

    // 5-2. Deactivate User Account Lambda
    const deactivateUserAccountLambda = new NodejsFunction(this, "DeactivateUserAccountLambda", {
        functionName: "nasun-common-deactivate-user-account",
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(lambdaSrcPath, 'deactivate-user-account', 'src', 'index.ts'),
        handler: 'handler',
        depsLockFilePath,
        bundling: bundlingOptions,
        environment: {
            USER_PROFILES_TABLE: this.userProfilesTable.tableName,
            ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        },
        logGroup: new logs.LogGroup(this, "DeactivateUserAccountLogGroup", {
            logGroupName: "/aws/lambda/nasun-common-deactivate-user-account",
            removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
    });
    this.userProfilesTable.grantWriteData(deactivateUserAccountLambda);

    // ✅ identityId 기반 인증: 인증 없이 쿼리 파라미터로 identityId 전달
    // Lambda 함수 내부에서 DynamoDB 프로필 존재 여부로 검증
    const deactivateAccountApi = new apigw.LambdaRestApi(this, "DeactivateAccountApi", {
        handler: deactivateUserAccountLambda,
        restApiName: "NASUN Deactivate Account API (Common)",
        proxy: false,
        defaultCorsPreflightOptions: {
            allowOrigins: ALLOWED_ORIGINS,
            allowMethods: ["DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization"],
        },
    });
    deactivateAccountApi.root.addMethod('DELETE', new apigw.LambdaIntegration(deactivateUserAccountLambda));

    // 5-3. Purge Deactivated Accounts Lambda (Scheduled)
    const purgeDeactivatedAccountsLambda = new NodejsFunction(this, "PurgeDeactivatedAccountsLambda", {
      functionName: "nasun-common-purge-deactivated-accounts",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'purge-deactivated-accounts', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || "",
      },
      timeout: cdk.Duration.minutes(5),
      logGroup: new logs.LogGroup(this, "PurgeDeactivatedAccountsLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-purge-deactivated-accounts",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(purgeDeactivatedAccountsLambda);
    purgeDeactivatedAccountsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-identity:UnlinkIdentity", "cognito-identity:DescribeIdentity"],
        resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`]
      })
    );

    const purgeAccountsRule = new events.Rule(this, "PurgeAccountsRule", {
      ruleName: "nasun-common-purge-deactivated-accounts-daily",
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      description: "Trigger to purge deactivated accounts daily (Common Stack)",
    });
    purgeAccountsRule.addTarget(new targets.LambdaFunction(purgeDeactivatedAccountsLambda));

    // ========================================
    // 6. Get User Count Lambda (Roadmap 메트릭용)
    // ========================================

    const getUserCountLambda = new NodejsFunction(this, "GetUserCountLambda", {
      functionName: "nasun-common-get-user-count",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'get-user-count', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      environment: {
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      logGroup: new logs.LogGroup(this, "GetUserCountLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-user-count",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    // DescribeTable 권한 추가
    getUserCountLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:DescribeTable"],
        resources: [this.userProfilesTable.tableArn]
      })
    );

    const getUserCountApi = new apigw.LambdaRestApi(this, "GetUserCountApi", {
      handler: getUserCountLambda,
      restApiName: "NASUN Get User Count API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "OPTIONS"]
      },
    });

    // ========================================
    // 6-2. Get Follower Count Lambda (Twitter API)
    // ========================================

    const getFollowerCountLambda = new NodejsFunction(this, "GetFollowerCountLambda", {
      functionName: "nasun-common-get-follower-count",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'get-follower-count', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TARGET_USER_ID: "1725466995565752320",
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io", // For logging only
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      logGroup: new logs.LogGroup(this, "GetFollowerCountLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-follower-count",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });

    // Secrets Manager read-only permission (token refresh is handled by dedicated Lambda)
    getFollowerCountLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-twitter-tokens*`,
        ]
      })
    );

    const getFollowerCountApi = new apigw.LambdaRestApi(this, "GetFollowerCountApi", {
      handler: getFollowerCountLambda,
      restApiName: "NASUN Get Follower Count API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "OPTIONS"]
      },
    });

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

    new cdk.CfnOutput(this, "DeactivateAccountApiUrl", {
      value: deactivateAccountApi.url,
      description: "Deactivate Account API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "WalletApiUrl", {
      value: walletApi.url,
      description: "Wallet API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GovernanceApiUrl", {
      value: this.governanceApi.url,
      description: "Governance API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetAwsCredentialsApiUrl", {
      value: getAwsCredentialsApi.url,
      description: "Get AWS Credentials API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetUserCountApiUrl", {
      value: getUserCountApi.url,
      description: "Get User Count API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetFollowerCountApiUrl", {
      value: getFollowerCountApi.url,
      description: "Get Follower Count API URL (CommonStack)",
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

    // 10-2. Lambda 공통 환경변수
    const whitelistEnv = {
      WHITELIST_TABLE_NAME: whitelistTable.tableName,
      ADMIN_API_KEY: process.env.ADMIN_API_KEY || (() => { throw new Error("ADMIN_API_KEY environment variable is required"); })(),
      ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
    };

    // 10-3. Join Whitelist Lambda
    const joinWhitelistLambda = new NodejsFunction(this, "JoinWhitelistLambda", {
      functionName: "nasun-common-whitelist-join",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'whitelist', 'src', 'handlers', 'join.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "JoinWhitelistLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-join",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadWriteData(joinWhitelistLambda);

    const joinWhitelistApi = new apigw.LambdaRestApi(this, "JoinWhitelistApi", {
      handler: joinWhitelistLambda,
      restApiName: "NASUN Join Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingBurstLimit: 500,
        throttlingRateLimit: 200, // 200 requests per second
      },
    });

    // 10-4. Withdraw Whitelist Lambda
    const withdrawWhitelistLambda = new NodejsFunction(this, "WithdrawWhitelistLambda", {
      functionName: "nasun-common-whitelist-withdraw",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'whitelist', 'src', 'handlers', 'withdraw.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "WithdrawWhitelistLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-withdraw",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadWriteData(withdrawWhitelistLambda);

    const withdrawWhitelistApi = new apigw.LambdaRestApi(this, "WithdrawWhitelistApi", {
      handler: withdrawWhitelistLambda,
      restApiName: "NASUN Withdraw Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingBurstLimit: 500,
        throttlingRateLimit: 200, // 200 requests per second
      },
    });

    // 10-5. Check Whitelist Lambda
    const checkWhitelistLambda = new NodejsFunction(this, "CheckWhitelistLambda", {
      functionName: "nasun-common-whitelist-check",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'whitelist', 'src', 'handlers', 'check.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "CheckWhitelistLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-check",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadData(checkWhitelistLambda);

    const checkWhitelistApi = new apigw.LambdaRestApi(this, "CheckWhitelistApi", {
      handler: checkWhitelistLambda,
      restApiName: "NASUN Check Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingBurstLimit: 500,
        throttlingRateLimit: 200, // 200 requests per second (read-only)
      },
    });

    // 10-6. Admin List Lambda
    const adminListLambda = new NodejsFunction(this, "AdminListLambda", {
      functionName: "nasun-common-whitelist-admin-list",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'whitelist', 'src', 'handlers', 'admin-list.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "AdminListLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-admin-list",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadData(adminListLambda);

    const adminListApi = new apigw.LambdaRestApi(this, "AdminListApi", {
      handler: adminListLambda,
      restApiName: "NASUN Admin List Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingBurstLimit: 5,
        throttlingRateLimit: 2, // 2 requests per second (admin only)
      },
    });

    // 10-7. Admin Export Lambda
    const adminExportLambda = new NodejsFunction(this, "AdminExportLambda", {
      functionName: "nasun-common-whitelist-export",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'whitelist', 'src', 'handlers', 'admin-export.ts'),
      handler: 'handler',
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "AdminExportLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-export",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadData(adminExportLambda);

    const adminExportApi = new apigw.LambdaRestApi(this, "AdminExportApi", {
      handler: adminExportLambda,
      restApiName: "NASUN Admin Export Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingBurstLimit: 2,
        throttlingRateLimit: 1, // 1 request per second (admin export, expensive operation)
      },
    });

    // 10-8. CloudFormation Outputs
    new cdk.CfnOutput(this, "WhitelistTableName", {
      value: whitelistTable.tableName,
      description: "Genesis NFT Whitelist DynamoDB Table Name",
    });

    new cdk.CfnOutput(this, "JoinWhitelistApiUrl", {
      value: joinWhitelistApi.url,
      description: "Join Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "WithdrawWhitelistApiUrl", {
      value: withdrawWhitelistApi.url,
      description: "Withdraw Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "CheckWhitelistApiUrl", {
      value: checkWhitelistApi.url,
      description: "Check Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "AdminListWhitelistApiUrl", {
      value: adminListApi.url,
      description: "Admin List Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "AdminExportWhitelistApiUrl", {
      value: adminExportApi.url,
      description: "Admin Export Whitelist API URL (CommonStack)",
    });
  }
}
