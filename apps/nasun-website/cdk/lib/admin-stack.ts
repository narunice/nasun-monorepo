import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";

interface AdminStackProps extends cdk.StackProps {
  userProfilesTableName?: string;
  genesisTableName?: string;
  battalionTableName?: string;
  hiddenProposalsTableName?: string;
}

export class AdminStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly exportFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: AdminStackProps) {
    super(scope, id, props);

    const userProfilesTableName = props?.userProfilesTableName || "UserProfiles";
    const genesisTableName = props?.genesisTableName || "GenesisNftWhitelist";
    const battalionTableName = props?.battalionTableName || "nasun-nft-whitelist";
    const hiddenProposalsTableName = props?.hiddenProposalsTableName || "HiddenProposals";

    // Create HiddenProposals DynamoDB table
    const hiddenProposalsTable = new dynamodb.Table(this, "HiddenProposalsTable", {
      tableName: hiddenProposalsTableName,
      partitionKey: { name: "proposalId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

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

    // Allowed origins for CORS
    const allowedOrigins = [
      "https://nasun.io",
      "https://www.nasun.io",
      "https://staging.nasun.io",
      "http://localhost:5174",
    ].join(",");

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

    // API Gateway
    this.api = new apigateway.RestApi(this, "AdminApi", {
      restApiName: "Nasun Admin API",
      description: "Admin API for whitelist management",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization", "X-Identity-Id"],
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

    // GET /export/genesis
    const genesisResource = exportResource.addResource("genesis");
    genesisResource.addMethod("GET", exportIntegration);

    // GET /export/battalion
    const battalionResource = exportResource.addResource("battalion");
    battalionResource.addMethod("GET", exportIntegration);

    // GET /export/stats
    const statsResource = exportResource.addResource("stats");
    statsResource.addMethod("GET", exportIntegration);

    // Hidden Proposals API Routes
    const hiddenProposalsResource = this.api.root.addResource("hidden-proposals");
    // GET /hidden-proposals - List all hidden proposal IDs
    hiddenProposalsResource.addMethod("GET", exportIntegration);
    // POST /hidden-proposals - Hide a proposal
    hiddenProposalsResource.addMethod("POST", exportIntegration);

    // DELETE /hidden-proposals/{proposalId} - Unhide a proposal
    const hiddenProposalIdResource = hiddenProposalsResource.addResource("{proposalId}");
    hiddenProposalIdResource.addMethod("DELETE", exportIntegration);

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
