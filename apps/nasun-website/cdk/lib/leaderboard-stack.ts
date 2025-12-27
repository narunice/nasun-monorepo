import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface LeaderboardStackProps extends cdk.StackProps {
  readonly userProfilesTable: dynamodb.ITable;
  readonly userIdentityMapTable: dynamodb.ITable;
}

export class LeaderboardStack extends cdk.Stack {
  public readonly cumulativeLeaderboardTable: dynamodb.ITable;
  public readonly cumulativeScoreCalculatorFunction: lambda.Function;
  public readonly cumulativeLeaderboardGeneratorFunction: lambda.Function;
  public readonly getCumulativeLeaderboardFunction: lambda.Function;
  public readonly getBookmarkStatsFunction: lambda.Function;
  public readonly nasunApi: apigw.RestApi;

  constructor(scope: Construct, id: string, props: LeaderboardStackProps) {
    super(scope, id, props);

    // All leaderboard-related resources will be moved here.
  }
}
