import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
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

    const allowedOrigins = ALLOWED_ORIGINS_ENV;

    // Admin Export Lambda
    this.exportFunction = new NodejsFunction(this, "AdminExportFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda-src/admin-api/src/handlers/export-whitelist.ts"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      depsLockFilePath: path.join(__dirname, "../pnpm-lock.yaml"),
      environment: {
        USER_PROFILES_TABLE: userProfilesTableName,
        GENESIS_TABLE: genesisTableName,
        BATTALION_TABLE: battalionTableName,
        HIDDEN_PROPOSALS_TABLE: hiddenProposalsTableName,
        ALLOWED_ORIGINS: allowedOrigins,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
      },
    });

    // Grant read permissions to DynamoDB tables
    userProfilesTable.grantReadData(this.exportFunction);
    genesisTable.grantReadData(this.exportFunction);
    battalionTable.grantReadData(this.exportFunction);
    hiddenProposalsTable.grantReadWriteData(this.exportFunction);

    // Grant permission to query GSI (batch-index)
    this.exportFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${battalionTableName}/index/*`,
        ],
      })
    );

    const cognitoIdentityPoolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID || '';

    // NFT Collections Lambda
    this.nftCollectionsFunction = new NodejsFunction(this, "NftCollectionsFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
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
        target: "node20",
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
      },
    });

    // Grant NFT Collections Lambda permissions
    nftCollectionsTable.grantReadWriteData(this.nftCollectionsFunction);
    userProfilesTable.grantReadData(this.nftCollectionsFunction);

    // Lambda Token Authorizer for Cognito OIDC token verification
    const authorizerFunction = new NodejsFunction(this, "AdminApiAuthorizer", {
      runtime: lambda.Runtime.NODEJS_20_X,
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
        target: "node20",
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
      },
    });

    const tokenAuthorizer = new apigateway.TokenAuthorizer(this, "AdminTokenAuthorizer", {
      handler: authorizerFunction,
      resultsCacheTtl: cdk.Duration.seconds(300),
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

    // Lambda integration
    const exportIntegration = new apigateway.LambdaIntegration(this.exportFunction, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    // API Routes
    const exportResource = this.api.root.addResource("export");

    // GET /export/genesis (admin only)
    const genesisResource = exportResource.addResource("genesis");
    genesisResource.addMethod("GET", exportIntegration, authorizedMethodOptions);

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
