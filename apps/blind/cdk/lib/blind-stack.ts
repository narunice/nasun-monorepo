import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export interface BlindStackProps extends cdk.StackProps {
  // Contract addresses
  blindPackageId: string;
  blindRegistryId: string;

  // Sui RPC URL
  suiRpcUrl?: string;
}

export class BlindStack extends cdk.Stack {
  public readonly apiGateway: apigateway.RestApi;
  public readonly executorLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: BlindStackProps) {
    super(scope, id, props);

    const {
      blindPackageId,
      blindRegistryId,
      suiRpcUrl = 'https://rpc.devnet.nasun.io',
    } = props;

    // Import existing secrets (must be created manually in AWS Secrets Manager)
    // Secret format: { "apiKey": "sk-..." } for OpenAI
    // Secret format: { "privateKey": "hex-encoded-32-bytes" } for Executor
    const openaiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'OpenAISecret',
      'blind/openai'
    );

    const executorSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'ExecutorSecret',
      'blind/executor'
    );

    // Create Lambda function for executor
    this.executorLambda = new lambda.Function(this, 'ExecutorLambda', {
      functionName: 'blind-executor',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda-src/executor/dist')
      ),
      timeout: cdk.Duration.seconds(60), // AI calls can take time
      memorySize: 512,
      environment: {
        SUI_RPC_URL: suiRpcUrl,
        BLIND_PACKAGE_ID: blindPackageId,
        BLIND_REGISTRY_ID: blindRegistryId,
        OPENAI_SECRET_NAME: 'blind/openai',
        EXECUTOR_SECRET_NAME: 'blind/executor',
      },
      description: 'Blind AI Executor - Processes AI requests and submits proofs on-chain',
    });

    // Grant Lambda access to secrets
    openaiSecret.grantRead(this.executorLambda);
    executorSecret.grantRead(this.executorLambda);

    // Create API Gateway
    this.apiGateway = new apigateway.RestApi(this, 'BlindApi', {
      restApiName: 'Blind Executor API',
      description: 'API for Blind AI computation execution',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
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
      description: 'Blind Executor API endpoint',
    });

    new cdk.CfnOutput(this, 'ExecutorLambdaArn', {
      value: this.executorLambda.functionArn,
      description: 'Executor Lambda ARN',
    });
  }
}
