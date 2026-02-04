import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export class NewsStack extends cdk.Stack {
  public readonly newsFeedLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing secret (created manually via AWS CLI)
    const xApiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'XApiBearerTokenSecret',
      'pado/x-api-bearer-token'
    );

    // Lambda function for news feed aggregation
    this.newsFeedLambda = new lambda.Function(this, 'NewsFeedLambda', {
      functionName: 'pado-news-feed',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda-src/news-feed/dist')
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        X_API_SECRET_NAME: 'pado/x-api-bearer-token',
      },
      logGroup: new logs.LogGroup(this, 'NewsFeedLogGroup', {
        logGroupName: '/aws/lambda/pado-news-feed',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.TWO_WEEKS,
      }),
      description: 'Pado News Feed - Aggregates crypto news from RSS and X API',
    });

    // Grant Lambda access to X API secret
    xApiSecret.grantRead(this.newsFeedLambda);

    // EventBridge rule: every 30 minutes for cache warming
    const cacheWarmRule = new events.Rule(this, 'NewsFeedWarmRule', {
      ruleName: 'pado-news-feed-warm',
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
      description: 'Warm news feed cache every 30 minutes',
    });

    cacheWarmRule.addTarget(
      new targets.LambdaFunction(this.newsFeedLambda)
    );

    // API Gateway REST endpoint
    const api = new apigateway.RestApi(this, 'NewsFeedApi', {
      restApiName: 'pado-news-feed',
      description: 'Pado News Feed API',
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'https://pado.finance',
          'https://staging.pado.finance',
          'http://localhost:5176',
        ],
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      },
    });

    // GET /news-feed
    const newsFeedResource = api.root.addResource('news-feed');
    newsFeedResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.newsFeedLambda, {
        proxy: true,
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'NewsFeedApiUrl', {
      value: api.url + 'news-feed',
      description: 'News Feed API endpoint',
    });

    new cdk.CfnOutput(this, 'NewsFeedLambdaArn', {
      value: this.newsFeedLambda.functionArn,
      description: 'News Feed Lambda ARN',
    });
  }
}
