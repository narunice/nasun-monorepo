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
      suiRpcUrl = 'https://rpc.devnet.nasun.io',
      corsAllowedOrigins = ['https://baram.nasun.io', 'http://localhost:5177'],
    } = props;

    // Import existing secrets (must be created manually in AWS Secrets Manager)
    // Secret format: { "apiKey": "sk-..." } for OpenAI
    // Secret format: { "privateKey": "hex-encoded-32-bytes" } for Executor
    const openaiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'OpenAISecret',
      'baram/openai'
    );

    const executorSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'ExecutorSecret',
      'baram/executor'
    );

    // Groq secret (optional - for fallback models)
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
        OPENAI_SECRET_NAME: 'baram/openai',
        EXECUTOR_SECRET_NAME: 'baram/executor',
        GROQ_SECRET_NAME: 'baram/groq',
        CORS_ALLOWED_ORIGIN: corsAllowedOrigins[0] || '',
      },
      description: 'Baram AI Executor - Processes AI requests and submits proofs on-chain',
    });

    // Grant Lambda access to secrets
    openaiSecret.grantRead(this.executorLambda);
    executorSecret.grantRead(this.executorLambda);
    groqSecret.grantRead(this.executorLambda);

    // Create API Gateway
    this.apiGateway = new apigateway.RestApi(this, 'BaramApi', {
      restApiName: 'Baram Executor API',
      description: 'API for Baram AI computation execution',
      defaultCorsPreflightOptions: {
        allowOrigins: corsAllowedOrigins,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
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

    // API routes
    // GET /health
    const healthResource = this.apiGateway.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration);

    // GET /info
    const infoResource = this.apiGateway.root.addResource('info');
    infoResource.addMethod('GET', lambdaIntegration);

    // POST /execute
    const executeResource = this.apiGateway.root.addResource('execute');
    executeResource.addMethod('POST', lambdaIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiGateway.url,
      description: 'Baram Executor API endpoint',
    });

    new cdk.CfnOutput(this, 'ExecutorLambdaArn', {
      value: this.executorLambda.functionArn,
      description: 'Executor Lambda ARN',
    });
  }
}
