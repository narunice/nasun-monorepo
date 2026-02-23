import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

export interface BaramStackProps extends cdk.StackProps {
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
}

export class BaramStack extends cdk.Stack {
  public readonly apiGateway: apigateway.RestApi;
  public readonly executorLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: BaramStackProps) {
    super(scope, id, props);

    const {
      baramPackageId,
      baramRegistryId,
      aerPackageId = '',
      aerRegistryId = '',
      executorRegistryId = '',
      suiRpcUrl = 'https://rpc.devnet.nasun.io',
      corsAllowedOrigins = ['https://baram.nasun.io', 'http://localhost:5177'],
    } = props;

    // Import existing secrets (must be created manually in AWS Secrets Manager)
    // Secret format: { "apiKey": "gsk_..." } for Groq
    // Secret format: { "privateKey": "hex-encoded-32-bytes" } for Executor
    const executorSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'ExecutorSecret',
      'baram/executor'
    );

    const groqSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GroqSecret',
      'baram/groq'
    );

    // Create Lambda function for executor
    this.executorLambda = new lambda.Function(this, 'ExecutorLambda', {
      functionName: 'baram-executor',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda-src/executor/dist')
      ),
      timeout: cdk.Duration.seconds(60), // AI calls can take time
      memorySize: 512,
      environment: {
        SUI_RPC_URL: suiRpcUrl,
        BARAM_PACKAGE_ID: baramPackageId,
        BARAM_REGISTRY_ID: baramRegistryId,
        AER_PACKAGE_ID: aerPackageId,
        AER_REGISTRY_ID: aerRegistryId,
        EXECUTOR_REGISTRY_ID: executorRegistryId,
        EXECUTOR_SECRET_NAME: 'baram/executor',
        GROQ_SECRET_NAME: 'baram/groq',
        CORS_ALLOWED_ORIGINS: corsAllowedOrigins.join(','),
      },
      description: 'Baram AI Executor - Processes AI requests and submits proofs on-chain',
    });

    // Grant Lambda access to secrets
    executorSecret.grantRead(this.executorLambda);
    groqSecret.grantRead(this.executorLambda);

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
