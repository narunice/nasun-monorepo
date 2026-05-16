import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import * as path from 'path';

export interface BaramStackProps extends cdk.StackProps {
  // Production vs development. Drives removal policies, log retention, and any
  // future env-specific divergence. Resource *names* stay identical across
  // accounts (function/secret/apiKey); different AWS accounts isolate them.
  isProduction: boolean;

  // Contract addresses
  baramPackageId: string;
  baramRegistryId: string;

  // AER (AI Execution Report) contract addresses
  aerPackageId?: string;
  aerRegistryId?: string;

  // Executor registry address
  executorRegistryId?: string;

  // Sui RPC URL
  suiRpcUrl?: string;

  // CORS allowed origins (defaults to Baram frontend URLs)
  corsAllowedOrigins?: string[];

  // PR1.5 swap path gates (spec §1.3 / §4). Safe defaults: swap disabled,
  // empty allow-lists, DEEP type unset, slippage cap 500 bps. dev/prod must
  // populate via .env to enable the swap path; flipping LAMBDA_SWAP_DISABLED
  // to "false" is the cutover switch.
  lambdaSwapDisabled?: string;
  deepbookPackageAllowlist?: string;
  deepbookPoolAllowlist?: string;
  deepType?: string;
  maxSlippageBpsCap?: string;
}

export class BaramStack extends cdk.Stack {
  public readonly apiGateway: apigateway.RestApi;
  public readonly executorLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: BaramStackProps) {
    super(scope, id, props);

    const {
      isProduction,
      baramPackageId,
      baramRegistryId,
      aerPackageId = '',
      aerRegistryId = '',
      executorRegistryId = '',
      suiRpcUrl = 'https://rpc.devnet.nasun.io',
      // Default allowlist includes both the legacy baram subdomain and the
      // nasun-website root (S5+ where Baram surfaces moved into uju/ai). Both
      // staging and prod nasun-website call this Lambda's /execute endpoint.
      corsAllowedOrigins = [
        'https://baram.nasun.io',
        'https://nasun.io',
        'https://www.nasun.io',
        'https://staging.nasun.io',
        'http://localhost:5174',
        'http://localhost:5177',
      ],
      lambdaSwapDisabled = 'true',
      deepbookPackageAllowlist = '',
      deepbookPoolAllowlist = '',
      deepType = '',
      maxSlippageBpsCap = '500',
    } = props;

    // DynamoDB table for AI execution results (TTL: 7 days). Prod retains the
    // table on stack delete so accidental teardown can't wipe live result rows;
    // dev keeps DESTROY for fast iteration.
    const resultTable = new dynamodb.Table(this, 'ResultTable', {
      tableName: 'baram-execution-results',
      partitionKey: { name: 'requestId', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: isProduction
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Executor private key stays in Secrets Manager (asset-bearing, audit/rotation).
    // Format: { "privateKey": "hex-encoded-32-bytes" }
    // Groq API key is provisioned as an SSM SecureString at the path below.
    // Standard tier is free, which avoids the per-secret monthly fee for an
    // outbound API key whose only risk is third-party billing/rate-limit.
    const executorSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'ExecutorSecret',
      'baram/executor'
    );

    // AI provider SSM parameter paths. Groq retains its historical path
    // for backward-compat; new providers follow `/baram/<provider>-api-key`.
    // Operators populate values manually (SecureString) — CDK does not
    // create the parameters themselves to avoid putting plaintext keys
    // into CloudFormation templates.
    const aiProviderParameters: Record<string, string> = {
      GROQ_PARAMETER_NAME:       '/baram/groq-api-key',
      CEREBRAS_PARAMETER_NAME:   '/baram/cerebras-api-key',
      OPENROUTER_PARAMETER_NAME: '/baram/openrouter-api-key',
      TOGETHER_PARAMETER_NAME:   '/baram/together-api-key',
      DEEPSEEK_PARAMETER_NAME:   '/baram/deepseek-api-key',
      MISTRAL_PARAMETER_NAME:    '/baram/mistral-api-key',
      SAMBANOVA_PARAMETER_NAME:  '/baram/sambanova-api-key',
      GEMINI_PARAMETER_NAME:     '/baram/gemini-api-key',
    };
    const groqParameterName = aiProviderParameters.GROQ_PARAMETER_NAME;

    // Create Lambda function for executor
    this.executorLambda = new lambda.Function(this, 'ExecutorLambda', {
      functionName: 'baram-executor',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda-src/executor/dist')
      ),
      // 90s gives PR1.A /execute-capability room for cold-start + cap fetch +
      // verifyRequest + PTB submission. /infer is internally budgeted to 20s
      // for Groq, so it never approaches this ceiling. Chat /execute is
      // unaffected (Groq abort budget unchanged at 60s).
      timeout: cdk.Duration.seconds(90),
      memorySize: 512,
      environment: {
        SUI_RPC_URL: suiRpcUrl,
        BARAM_PACKAGE_ID: baramPackageId,
        BARAM_REGISTRY_ID: baramRegistryId,
        AER_PACKAGE_ID: aerPackageId,
        AER_REGISTRY_ID: aerRegistryId,
        EXECUTOR_REGISTRY_ID: executorRegistryId,
        EXECUTOR_SECRET_NAME: 'baram/executor',
        // AI provider SSM paths — Lambda's loadSecrets() fetches each in
        // parallel. Missing values silently degrade the fallback chain
        // (see services/ai.ts). Operators add API keys to SSM after the
        // first deploy; no rebuild needed when a new key gets added.
        ...aiProviderParameters,
        CORS_ALLOWED_ORIGINS: corsAllowedOrigins.join(','),
        RESULT_TABLE_NAME: resultTable.tableName,
        // PR1.5 swap path gates. handleExecuteCapability reads these on every
        // request (no cold-start cache) so env flips take effect immediately
        // without redeploy. LAMBDA_SWAP_DISABLED=true short-circuits at the
        // boundary with reason="swap_disabled".
        LAMBDA_SWAP_DISABLED: lambdaSwapDisabled,
        DEEPBOOK_PACKAGE_ALLOWLIST: deepbookPackageAllowlist,
        DEEPBOOK_POOL_ALLOWLIST: deepbookPoolAllowlist,
        DEEP_TYPE: deepType,
        MAX_SLIPPAGE_BPS_CAP: maxSlippageBpsCap,
      },
      logRetention: isProduction
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
      description: `Baram AI Executor (${isProduction ? 'prod' : 'dev'}) - Processes AI requests and submits proofs on-chain`,
    });

    // Grant Lambda access to secrets, SSM parameter, and DynamoDB
    executorSecret.grantRead(this.executorLambda);
    this.executorLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: Object.values(aiProviderParameters).map(
        (paramPath) =>
          `arn:aws:ssm:${this.region}:${this.account}:parameter${paramPath}`,
      ),
    }));
    resultTable.grantReadWriteData(this.executorLambda);

    // Create API Gateway
    this.apiGateway = new apigateway.RestApi(this, 'BaramApi', {
      restApiName: 'Baram Executor API',
      description: 'API for Baram AI computation execution',
      defaultCorsPreflightOptions: {
        allowOrigins: corsAllowedOrigins,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'x-api-key'],
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
    });

    // Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(
      this.executorLambda,
      {
        proxy: true,
      }
    );

    // API Key + Usage Plan — protects /execute from unauthorized usage
    const apiKey = this.apiGateway.addApiKey('BaramApiKey', {
      apiKeyName: 'baram-executor-key',
      description: 'API key for Baram executor /execute endpoint',
    });

    const usagePlan = this.apiGateway.addUsagePlan('BaramUsagePlan', {
      name: 'baram-executor-plan',
      throttle: { rateLimit: 10, burstLimit: 20 },
      quota: { limit: 5000, period: apigateway.Period.DAY },
    });
    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: this.apiGateway.deploymentStage });

    // API routes
    // GET /health — public
    const healthResource = this.apiGateway.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration);

    // GET /info — public
    const infoResource = this.apiGateway.root.addResource('info');
    infoResource.addMethod('GET', lambdaIntegration);

    // POST /execute — requires API key
    const executeResource = this.apiGateway.root.addResource('execute');
    executeResource.addMethod('POST', lambdaIntegration, {
      apiKeyRequired: true,
    });

    // POST /record — requires API key (Model B: self-reported settlement)
    const recordResource = this.apiGateway.root.addResource('record');
    recordResource.addMethod('POST', lambdaIntegration, {
      apiKeyRequired: true,
    });

    // POST /infer — PR1.A split-inference for the trader heartbeat
    const inferResource = this.apiGateway.root.addResource('infer');
    inferResource.addMethod('POST', lambdaIntegration, {
      apiKeyRequired: true,
    });

    // POST /execute-capability — PR1.A agent-signed settlement (HOLD-only)
    const execCapResource = this.apiGateway.root.addResource('execute-capability');
    execCapResource.addMethod('POST', lambdaIntegration, {
      apiKeyRequired: true,
    });

    // /result — requires API key (fetch stored AI result text)
    const resultResource = this.apiGateway.root.addResource('result');
    resultResource.addMethod('GET', lambdaIntegration, {
      apiKeyRequired: true,
    });
    resultResource.addMethod('POST', lambdaIntegration, {
      apiKeyRequired: true,
    });

    // CloudWatch alarm — fires when daily API key usage crosses 50% of quota
    // (2500 of 5000). PR1.A motivation: if chat traffic saturates the usage
    // plan, the trader's /infer + /execute-capability calls silently 429 and
    // the cycle goes dark again. The alarm exposes that case before anyone
    // reads the runtime logs. Free tier; no SNS target wired yet (log-watcher
    // on prod EC2 carries the page-out duty for now).
    //
    // Period is 1 day so a single bucket reflects the quota window. A shorter
    // period with the same threshold would fire on innocuous hourly bursts.
    new cloudwatch.Alarm(this, 'ApiKeyDailyQuotaHalfAlarm', {
      alarmName: `baram-executor-${isProduction ? 'prod' : 'dev'}-api-quota-50pct`,
      alarmDescription: 'Daily API key usage crossed 50% of quota (5000/day).',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Count',
        dimensionsMap: {
          ApiName: 'Baram Executor API',
          Stage: this.apiGateway.deploymentStage.stageName,
        },
        statistic: 'Sum',
        period: cdk.Duration.days(1),
      }),
      threshold: 2500,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiGateway.url,
      description: 'Baram Executor API endpoint',
    });

    new cdk.CfnOutput(this, 'ExecutorLambdaArn', {
      value: this.executorLambda.functionArn,
      description: 'Executor Lambda ARN',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID (retrieve value via AWS Console or CLI)',
    });
  }
}
