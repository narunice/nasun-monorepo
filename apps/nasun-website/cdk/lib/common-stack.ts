import * as dotenv from "dotenv";
dotenv.config();
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from './constants/cors';
import { issuerVerifyEnv } from './issuer-env';
import { identityWriteEnv } from './identity-env';

export interface CommonStackProps extends cdk.StackProps {
  // 필요한 경우 다른 스택 참조 추가
}

export class CommonStack extends cdk.Stack {
  public readonly userProfilesTable: dynamodb.ITable;

  constructor(scope: Construct, id: string, props?: CommonStackProps) {
    super(scope, id, props);

    // ========================================
    // DynamoDB 테이블 참조 (기존 테이블 사용)
    // ========================================
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
    // UserWallets table — multi-wallet registration (PK: identityId, SK: walletAddress)
    const userWalletsTable = new dynamodb.Table(this, "UserWalletsTable", {
      tableName: "UserWallets",
      partitionKey: { name: "identityId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "walletAddress", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // AllianceMint DDB table removed (alliance NFT de-Lambda teardown, 2026-07-06). box PG
    // nasun_dal.alliance_mint (:3211 write / :3212 read) is SoT; the governance-api Lambda that used this
    // table is deleted. RemovalPolicy.RETAIN had orphaned the table, which was then manually deleted.

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


    // ========================================
    // 2. User Profile Lambda 함수들
    // ========================================

    // 2-0/2-1. Public avatars S3 bucket + get-user-profile Lambda + UserProfile API GW (aanboqet5i)
    // REMOVED (avatar box-direct upload de-Lambda, 2026-07-09) -- the last profile gateway.
    //   - Avatar upload: the presigned-S3 two-step is replaced by a box-direct POST /profile/avatar
    //     (nasun-identity-compute :3212: multipart -> sharp re-encode -> disk), with nginx serving the
    //     files back from /avatars/. The prod bucket nasun-public-avatars-<account> did not exist in v8
    //     (NoSuchBucket), so prod avatar uploads had been broken and there was nothing to migrate.
    //   - Root GET/POST/PATCH and GET /v3/user-profile already HTTP_PROXY'd to the box compute. Every
    //     consumer (nasun/pado/gostop VITE_*USER_PROFILE_API, chat-server) now uses
    //     https://api.nasun.io/profile via nginx.
    // Verified before teardown: 0 lambda invocations, ~2 gateway requests/day, and no live bundle or
    // server-side reference to the execute-api URL (chat-server's NASUN_PROFILE_API_URL was vestigial).
    // The bucket was RemovalPolicy.RETAIN (already absent); the lambda + RestApi are deleted manually
    // because CommonStack is never cdk-deployed (drift landmine) -- same pattern as governance/address-book.


    // 2-3. Wallet API — REMOVED (wallet/address-book de-Lambda Phase 5 teardown, 2026-06-23).
    // The address-book service is box nasun-address-book (:3215); register/remove/list are box
    // nasun-identity-compute (:3212). api.nasun.io/wallet/* is nginx-routed to box (GW 6pnnb6hcrd dead,
    // no traffic). This removes walletApiLambda (nasun-common-wallet-api) + WalletApi RestApi
    // (6pnnb6hcrd) + log group + DDB grants. userProfiles/userWallets tables are shared and kept.


    // Price subsystem removed (de-Lambda price teardown, 2026-07-07). price-api (the only reader,
    // api.nasun.io/price -> Genesis NFT mint price converter, dormant) was retired; CloudWatch then
    // showed CryptoPrices with 0 reads / writes-only and CryptoBackupPrices fully idle. So the writers
    // (nasun-common-price-updater @ EventBridge 1/min, nasun-common-update-backup-prices) plus the
    // CryptoPrices/CryptoBackupPrices DynamoDB tables + PriceUpdateRule are vestigial and removed here.
    // Tables were imported via fromTableName (not owned by this stack) and are manually deleted.
    // A future NFT mint that needs crypto->USD pricing rebuilds this subsystem from scratch.

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



    // UserProfileApiUrl SSM param + CfnOutput removed with the UserProfile API GW (2026-07-09).

    // ========================================
    // 6. Stack Outputs
    // ========================================



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
