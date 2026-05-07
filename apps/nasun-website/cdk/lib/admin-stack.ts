import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from './constants/cors';

interface AdminStackProps extends cdk.StackProps {
  userProfilesTableName?: string;
  genesisTableName?: string;
  battalionTableName?: string;
  hiddenProposalsTableName?: string;
  nftCollectionsTableName?: string;
  devnetMetricsTableName?: string;
  genesisPassTableName?: string;
  referralCodesTableName?: string;
  referralsTableName?: string;
  activationsTableName?: string;
}

export class AdminStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly exportFunction: lambda.Function;
  public readonly nftCollectionsFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: AdminStackProps) {
    super(scope, id, props);

    const userProfilesTableName = props?.userProfilesTableName || "UserProfiles";
    const genesisTableName = props?.genesisTableName || "GenesisNftWhitelist";
    const battalionTableName = props?.battalionTableName || "nasun-nft-whitelist";
    const hiddenProposalsTableName = props?.hiddenProposalsTableName || "HiddenProposals";
    const nftCollectionsTableName = props?.nftCollectionsTableName || "nasun-nft-collections";
    const devnetMetricsTableName = props?.devnetMetricsTableName || "devnet-metrics";
    const genesisPassTableName = props?.genesisPassTableName || "nasun-genesis-pass-allowlist";
    const referralCodesTableName = props?.referralCodesTableName || "nasun-referral-codes";
    const referralsTableName = props?.referralsTableName || "nasun-referrals";
    const activationsTableName = props?.activationsTableName || "nasun-ecosystem-activations";

    // Create NFT Collections DynamoDB table
    const nftCollectionsTable = new dynamodb.Table(this, "NftCollectionsTable", {
      tableName: nftCollectionsTableName,
      partitionKey: { name: "collectionId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // Reference existing HiddenProposals DynamoDB table
    const hiddenProposalsTable = dynamodb.Table.fromTableName(
      this,
      "HiddenProposalsTable",
      hiddenProposalsTableName
    );

    // Reference existing DynamoDB tables
    const userProfilesTable = dynamodb.Table.fromTableName(
      this,
      "UserProfilesTable",
      userProfilesTableName
    );
    const genesisTable = dynamodb.Table.fromTableName(
      this,
      "GenesisTable",
      genesisTableName
    );
    const battalionTable = dynamodb.Table.fromTableName(
      this,
      "BattalionTable",
      battalionTableName
    );

    // Reference devnet-metrics table (from DevnetMetricsStack)
    const devnetMetricsTable = dynamodb.Table.fromTableName(
      this,
      "DevnetMetricsTable",
      devnetMetricsTableName
    );
    const genesisPassTable = dynamodb.Table.fromTableName(
      this,
      "GenesisPassTable",
      genesisPassTableName
    );

    // Reference UserWallets table (from CommonStack)
    const userWalletsTable = dynamodb.Table.fromTableName(
      this,
      "UserWalletsTableRef",
      "UserWallets"
    );

    // Reference Referral tables (from ReferralStack)
    const referralCodesTable = dynamodb.Table.fromTableName(
      this,
      "ReferralCodesTableRef",
      referralCodesTableName
    );
    const referralsTable = dynamodb.Table.fromTableName(
      this,
      "ReferralsTableRef",
      referralsTableName
    );

    // Reference Ecosystem Activations table (from EcosystemStack)
    const activationsTable = dynamodb.Table.fromTableName(
      this,
      "ActivationsTableRef",
      activationsTableName
    );

    const allowedOrigins = ALLOWED_ORIGINS_ENV;
    const cognitoIdentityPoolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID;
    if (!cognitoIdentityPoolId) {
      throw new Error('VITE_COGNITO_IDENTITY_POOL_ID environment variable is required for AdminStack');
    }

    // S3 bucket for internal API payload offload (wallet-mappings, referral-mappings, etc.)
    // Avoids Lambda 6MB response size limit by uploading data to S3 and returning presigned URLs.
    const internalCacheBucket = new s3.Bucket(this, "InternalCacheBucket", {
      bucketName: `nasun-internal-cache-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Auto-expire cached files after 1 day (presigned URLs expire in 10 min,
          // but keep the data briefly for debugging)
          expiration: cdk.Duration.days(1),
          prefix: "internal/",
        },
        {
          // Bug report screenshots: keep 90 days
          expiration: cdk.Duration.days(90),
          prefix: "bug-screenshots/",
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedOrigins: ALLOWED_ORIGINS,
          allowedMethods: [s3.HttpMethods.POST],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
    });

    // Admin Export Lambda
    this.exportFunction = new NodejsFunction(this, "AdminExportFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda-src/admin-api/src/handlers/export-whitelist.ts"),
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      depsLockFilePath: path.join(__dirname, "../pnpm-lock.yaml"),
      environment: {
        USER_PROFILES_TABLE: userProfilesTableName,
        GENESIS_TABLE: genesisTableName,
        BATTALION_TABLE: battalionTableName,
        HIDDEN_PROPOSALS_TABLE: hiddenProposalsTableName,
        DEVNET_METRICS_TABLE: devnetMetricsTableName,
        GENESIS_PASS_TABLE: genesisPassTableName,
        USER_WALLETS_TABLE: "UserWallets",
        INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || "",
        REFERRAL_CODES_TABLE: referralCodesTableName,
        REFERRALS_TABLE: referralsTableName,
        ACTIVATIONS_TABLE: activationsTableName,
        INTERNAL_CACHE_BUCKET: internalCacheBucket.bucketName,
        ALLOWED_ORIGINS: allowedOrigins,
        COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
        externalModules: [
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/lib-dynamodb",
          "@aws-sdk/client-s3",
          "@aws-sdk/s3-request-presigner",
        ],
      },
    });

    // Grant read permissions to DynamoDB tables
    userProfilesTable.grantReadData(this.exportFunction);
    genesisTable.grantReadData(this.exportFunction);
    battalionTable.grantReadData(this.exportFunction);
    hiddenProposalsTable.grantReadWriteData(this.exportFunction);
    devnetMetricsTable.grantReadData(this.exportFunction);
    genesisPassTable.grantReadWriteData(this.exportFunction);
    userWalletsTable.grantReadData(this.exportFunction);
    referralCodesTable.grantReadData(this.exportFunction);
    referralsTable.grantReadData(this.exportFunction);
    activationsTable.grantReadData(this.exportFunction);
    internalCacheBucket.grantReadWrite(this.exportFunction);

    // Grant permission to query GSI (batch-index + referrerIdentityId-index)
    this.exportFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${battalionTableName}/index/*`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${referralsTableName}/index/*`,
        ],
      })
    );

    // NFT Collections Lambda
    this.nftCollectionsFunction = new NodejsFunction(this, "NftCollectionsFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda-src/admin-api/src/handlers/nft-collections.ts"),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      depsLockFilePath: path.join(__dirname, "../pnpm-lock.yaml"),
      environment: {
        NFT_COLLECTIONS_TABLE: nftCollectionsTableName,
        USER_PROFILES_TABLE: userProfilesTableName,
        ALLOWED_ORIGINS: allowedOrigins,
        COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
      },
    });

    // Grant NFT Collections Lambda permissions
    nftCollectionsTable.grantReadWriteData(this.nftCollectionsFunction);
    userProfilesTable.grantReadData(this.nftCollectionsFunction);

    // Lambda Token Authorizer for Cognito OIDC token verification
    const authorizerFunction = new NodejsFunction(this, "AdminApiAuthorizer", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda-src/admin-api/src/authorizer/tokenAuthorizer.ts"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      depsLockFilePath: path.join(__dirname, "../pnpm-lock.yaml"),
      environment: {
        COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
      },
    });

    const tokenAuthorizer = new apigateway.TokenAuthorizer(this, "AdminTokenAuthorizer", {
      handler: authorizerFunction,
      resultsCacheTtl: cdk.Duration.seconds(60), // Short TTL: revoked admin access expires quickly
      identitySource: "method.request.header.Authorization",
    });

    const authorizedMethodOptions: apigateway.MethodOptions = {
      authorizer: tokenAuthorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // API Gateway
    this.api = new apigateway.RestApi(this, "AdminApi", {
      restApiName: "Nasun Admin API",
      description: "Admin API for whitelist management",
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
        allowCredentials: true,
      },
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      },
    });

    // Gateway Responses: ensure CORS headers on API Gateway-level errors (4xx/5xx)
    // Without these, preflight failures or gateway errors won't include CORS headers,
    // causing browsers to report opaque "CORS error" instead of the actual status code.
    // Use primary production origin (not wildcard) to avoid CWE-942 and
    // incompatibility with allowCredentials: true on preflight responses.
    this.api.addGatewayResponse("Default4xx", {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'https://nasun.io'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    this.api.addGatewayResponse("Default5xx", {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'https://nasun.io'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    // Lambda integration
    const exportIntegration = new apigateway.LambdaIntegration(this.exportFunction, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    // API Routes
    const exportResource = this.api.root.addResource("export");

    // GET /export/genesis (admin only)
    const genesisResource = exportResource.addResource("genesis");
    genesisResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // GET /export/genesis-pass (admin only)
    const genesisPassResource = exportResource.addResource("genesis-pass");
    genesisPassResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // GET /export/battalion (admin only)
    const battalionResource = exportResource.addResource("battalion");
    battalionResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // GET /export/stats (admin only)
    const statsResource = exportResource.addResource("stats");
    statsResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // Hidden Proposals API Routes
    const hiddenProposalsResource = this.api.root.addResource("hidden-proposals");
    // GET /hidden-proposals - Public: list hidden proposal IDs
    hiddenProposalsResource.addMethod("GET", exportIntegration);
    // POST /hidden-proposals - Admin: hide a proposal
    hiddenProposalsResource.addMethod("POST", exportIntegration, authorizedMethodOptions);

    // DELETE /hidden-proposals/{proposalId} - Admin: unhide a proposal
    const hiddenProposalIdResource = hiddenProposalsResource.addResource("{proposalId}");
    hiddenProposalIdResource.addMethod("DELETE", exportIntegration, authorizedMethodOptions);

    // User Management API Routes (reuses exportFunction which already has UserProfiles read access)
    const usersResource = this.api.root.addResource("users");
    // GET /users - Admin: list users (paginated) or search users (?q=... param)
    usersResource.addMethod("GET", exportIntegration, authorizedMethodOptions);
    const userIdResource = usersResource.addResource("{identityId}");
    // GET /users/{identityId} - Admin: get user detail
    userIdResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // (legacy account-flag Lambda + /users/{id}/flag routes removed 2026-05-07.
    // Bot mitigation now lives in banned_users + activity_points.flagged on
    // the points DB; admin UI calls explorer-api /api/v1/internal/ecosystem-ban
    // directly.)

    // Devnet Metrics API Route (admin only)
    const devnetMetricsResource = this.api.root.addResource("devnet-metrics");
    devnetMetricsResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // User Analytics API Route (admin only)
    const userAnalyticsResource = this.api.root.addResource("user-analytics");
    userAnalyticsResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // Nasun Stats snapshot route (admin only)
    // Single endpoint, single Lambda permission pair (API Gateway resource policy
    // is close to the 20KB limit — keep new resources minimal).
    // GET /nasun-stats/download?format=csv|txt|meta
    //   csv  → text/csv blob
    //   txt  → text/plain blob
    //   meta → JSON { ready, generatedAt, reportBaseDate, rowCount }
    const nasunStatsResource = this.api.root.addResource("nasun-stats");
    const nasunStatsDownloadResource = nasunStatsResource.addResource("download");
    nasunStatsDownloadResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

    // Genesis Pass Allowlist CRUD API Routes (admin only)
    const genesisPassCrudResource = this.api.root.addResource("genesis-pass");
    const genesisPassEntriesResource = genesisPassCrudResource.addResource("entries");
    // GET /genesis-pass/entries - Admin: list all entries
    genesisPassEntriesResource.addMethod("GET", exportIntegration, authorizedMethodOptions);
    // POST /genesis-pass/entries - Admin: add entry
    genesisPassEntriesResource.addMethod("POST", exportIntegration, authorizedMethodOptions);
    const genesisPassEntryIdResource = genesisPassEntriesResource.addResource("{walletAddress}");
    // PUT /genesis-pass/entries/{walletAddress} - Admin: update entry
    genesisPassEntryIdResource.addMethod("PUT", exportIntegration, authorizedMethodOptions);
    // DELETE /genesis-pass/entries/{walletAddress} - Admin: delete entry
    genesisPassEntryIdResource.addMethod("DELETE", exportIntegration, authorizedMethodOptions);

    // Internal API Routes (API key auth in Lambda, no Cognito authorizer)
    const internalResource = this.api.root.addResource("internal");
    const walletMappingsResource = internalResource.addResource("wallet-mappings");
    // GET /internal/wallet-mappings - Points scanner wallet cache refresh
    walletMappingsResource.addMethod("GET", exportIntegration);
    // GET /internal/referral-mappings - Points scanner referral relationship cache (ACTIVATED only)
    const referralMappingsResource = internalResource.addResource("referral-mappings");
    referralMappingsResource.addMethod("GET", exportIntegration);
    // POST /internal/referral-activate - Batch-activate PENDING referrals
    const referralActivateResource = internalResource.addResource("referral-activate");
    referralActivateResource.addMethod("POST", exportIntegration);
    // GET /internal/ecosystem-activations - NFT activation data for ecosystem multiplier
    const ecosystemActivationsResource = internalResource.addResource("ecosystem-activations");
    ecosystemActivationsResource.addMethod("GET", exportIntegration);
    // GET /internal/ecosystem-activations/{identityId} - Single user activation lookup (per-user sync)
    const ecosystemActivationUserResource = ecosystemActivationsResource.addResource("{identityId}");
    ecosystemActivationUserResource.addMethod("GET", exportIntegration);

    // NFT Collections API Routes
    const nftCollectionsIntegration = new apigateway.LambdaIntegration(this.nftCollectionsFunction);
    const nftCollectionsResource = this.api.root.addResource("nft-collections");
    // GET /nft-collections - Public (enabled only) + admin (?admin=true, manual token check in Lambda)
    nftCollectionsResource.addMethod("GET", nftCollectionsIntegration);
    // POST /nft-collections - Admin: create collection
    nftCollectionsResource.addMethod("POST", nftCollectionsIntegration, authorizedMethodOptions);

    const nftCollectionIdResource = nftCollectionsResource.addResource("{id}");
    // PUT /nft-collections/{id} - Admin: update collection
    nftCollectionIdResource.addMethod("PUT", nftCollectionsIntegration, authorizedMethodOptions);
    // DELETE /nft-collections/{id} - Admin: delete collection
    nftCollectionIdResource.addMethod("DELETE", nftCollectionsIntegration, authorizedMethodOptions);

    // Outputs
    new cdk.CfnOutput(this, "AdminApiUrl", {
      value: this.api.url,
      description: "Admin API URL",
    });

    new cdk.CfnOutput(this, "AdminExportFunctionArn", {
      value: this.exportFunction.functionArn,
      description: "Admin Export Lambda ARN",
    });
  }
}
