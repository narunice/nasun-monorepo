import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface OracleStackProps extends cdk.StackProps {
  oraclePackageId: string;
  oracleRegistryId: string;
  adminCapId: string;
  suiRpcUrl?: string;
}

export class OracleStack extends cdk.Stack {
  public readonly priceUpdaterLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: OracleStackProps) {
    super(scope, id, props);

    const {
      oraclePackageId,
      oracleRegistryId,
      adminCapId,
      suiRpcUrl = 'https://rpc.devnet.nasun.io',
    } = props;

    // Import existing secret (created manually via AWS CLI)
    const oracleAdminSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'OracleAdminSecret',
      'pado/oracle-admin-key'
    );

    // Lambda function for oracle price updates
    this.priceUpdaterLambda = new lambda.Function(this, 'PriceUpdaterLambda', {
      functionName: 'pado-oracle-price-updater',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda-src/oracle-price-updater/dist')
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ORACLE_PACKAGE_ID: oraclePackageId,
        ORACLE_REGISTRY_ID: oracleRegistryId,
        ADMIN_CAP_ID: adminCapId,
        SUI_RPC_URL: suiRpcUrl,
        ORACLE_SECRET_NAME: 'pado/oracle-admin-key',
      },
      logGroup: new logs.LogGroup(this, 'PriceUpdaterLogGroup', {
        logGroupName: '/aws/lambda/pado-oracle-price-updater',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.TWO_WEEKS,
      }),
      description: 'Pado Oracle Price Updater - Fetches BTC/ETH prices and pushes to DevOracle on-chain',
    });

    // Grant Lambda access to the secret
    oracleAdminSecret.grantRead(this.priceUpdaterLambda);

    // EventBridge rule: every 1 minute
    const priceUpdateRule = new events.Rule(this, 'PriceUpdateRule', {
      ruleName: 'pado-oracle-price-update',
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      description: 'Trigger oracle price updates every minute',
    });

    priceUpdateRule.addTarget(
      new targets.LambdaFunction(this.priceUpdaterLambda)
    );

    // Outputs
    new cdk.CfnOutput(this, 'PriceUpdaterLambdaArn', {
      value: this.priceUpdaterLambda.functionArn,
      description: 'Oracle Price Updater Lambda ARN',
    });
  }
}
