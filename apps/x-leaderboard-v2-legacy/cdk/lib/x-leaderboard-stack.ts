import * as dotenv from "dotenv";
dotenv.config();
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";
import * as stepfunctionsTasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";

export class XLeaderboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // DynamoDB Tables (reference existing)
    // ========================================
    const leaderboardTable = dynamodb.Table.fromTableName(
      this, "LeaderboardDataTable", "nasun-leaderboard-data"
    );
    const userIdentityMapTable = dynamodb.Table.fromTableName(
      this, "UserIdentityMapTable", "UserIdentityMap"
    );

    // ========================================
    // IAM Roles
    // ========================================
    const apiReadOnlyRole = new iam.Role(this, "ApiReadOnlyRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
      ],
    });

    // Grant read access on leaderboard table to the API role
    leaderboardTable.grantReadData(apiReadOnlyRole);

    const cloudWatchMetricsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    });

    const secretsReadPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
      resources: ['arn:aws:secretsmanager:*:*:secret:nasun-twitter-tokens-*']
    });

    // ========================================
    // Common environment variable helpers
    // ========================================
    const commonTwitterEnv = {
      TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
      TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
      TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
      TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
      TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
      OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
      OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
      OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
      TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
    };

    const commonTargetEnv = {
      TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
      TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
    };

    const commonEventDatesEnv = {
      EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
      EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
      EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
      EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
      EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
      EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
    };

    const commonTtlEnv = {
      LEADERBOARD_DATA_TTL_DAYS: process.env.LEADERBOARD_DATA_TTL_DAYS || "365",
      MENTION_TTL_DAYS: process.env.MENTION_TTL_DAYS || "365",
      REPLY_COUNTER_TTL_DAYS: process.env.REPLY_COUNTER_TTL_DAYS || "365",
      RECENT_ACTIVITY_TTL_DAYS: process.env.RECENT_ACTIVITY_TTL_DAYS || "365",
      DAILY_SNAPSHOT_TTL_DAYS: process.env.DAILY_SNAPSHOT_TTL_DAYS || "365",
      PROFILE_CACHE_TTL_DAYS: process.env.PROFILE_CACHE_TTL_DAYS || "7",
    };

    const commonScoreWeightsEnv = {
      SCORE_WEIGHT_LIKES: process.env.SCORE_WEIGHT_LIKES || "0.2",
      SCORE_WEIGHT_REPLIES: process.env.SCORE_WEIGHT_REPLIES || "0.4",
      SCORE_WEIGHT_REPOSTS: process.env.SCORE_WEIGHT_REPOSTS || "0.4",
      SCORE_WEIGHT_QUOTES: process.env.SCORE_WEIGHT_QUOTES || "0.6",
      SCORE_WEIGHT_MENTIONS: process.env.SCORE_WEIGHT_MENTIONS || "0.5",
    };

    const commonAdminEnv = {
      EXCLUDED_USERNAMES: process.env.EXCLUDED_USERNAMES || "",
      EXCLUDED_USER_IDS: process.env.EXCLUDED_USER_IDS || "",
      ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon",
    };

    const commonActivityBonusEnv = {
      ACTIVE_DAYS_PERIOD: process.env.ACTIVE_DAYS_PERIOD || "60",
      ACTIVE_DAYS_WEIGHT: process.env.ACTIVE_DAYS_WEIGHT || "0.1",
      ACTIVE_DAYS_MIN_ACTIVITIES: process.env.ACTIVE_DAYS_MIN_ACTIVITIES || "1",
      ENABLE_ACTIVE_DAYS_TIE_BREAKER: process.env.ENABLE_ACTIVE_DAYS_TIE_BREAKER || "true",
      ACTIVITY_BONUS_ENABLED: process.env.ACTIVITY_BONUS_ENABLED || "true",
      ACTIVITY_BONUS_WEIGHT_PER_DAY: process.env.ACTIVITY_BONUS_WEIGHT_PER_DAY || "0.28",
      ACTIVITY_BONUS_THRESHOLD_DAYS: process.env.ACTIVITY_BONUS_THRESHOLD_DAYS || "3",
      ACTIVITY_BONUS_PERIOD_DAYS: process.env.ACTIVITY_BONUS_PERIOD_DAYS || "7",
      INACTIVITY_PENALTY_ENABLED: process.env.INACTIVITY_PENALTY_ENABLED || "true",
      INACTIVITY_PENALTY_THRESHOLD: process.env.INACTIVITY_PENALTY_THRESHOLD || "3",
      INACTIVITY_PENALTY_PER_DAY: process.env.INACTIVITY_PENALTY_PER_DAY || "0.3",
      INACTIVITY_PENALTY_MAX: process.env.INACTIVITY_PENALTY_MAX || "5.0",
    };

    const commonOAuth2CollectorEnv = {
      ...commonTwitterEnv,
      ...commonTargetEnv,
      OAUTH2_USER_ACCESS_TOKEN: process.env.OAUTH2_USER_ACCESS_TOKEN || "",
      OAUTH2_REFRESH_TOKEN: process.env.OAUTH2_REFRESH_TOKEN || "",
      ENABLE_OAUTH_AUTHENTICATION: "true",
      FALLBACK_TO_BEARER_TOKEN: "true",
      ENABLE_OAUTH2_AUTHENTICATION: "true",
    };

    // ========================================
    // Batch Lambda Functions
    // ========================================

    // Score Calculator
    const cumulativeScoreCalculatorFunction = new lambda.Function(this, "CumulativeScoreCalculatorFunction", {
      functionName: "nasun-score-calculator",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/cumulative-score-calculator.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(10),
      memorySize: 256,
      description: `Forced update at ${new Date().toISOString()}`,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonAdminEnv,
        ...commonTwitterEnv,
        ENABLE_OAUTH_AUTHENTICATION: "true",
        ENABLE_OAUTH2_AUTHENTICATION: "true",
        FALLBACK_TO_BEARER_TOKEN: "true",
        COMMUNITY_WEIGHT_ENABLED: "true",
        KOREAN_LOG_BASE: process.env.KOREAN_LOG_BASE || "8",
        KOREAN_LANGUAGE_MULTIPLIER: process.env.KOREAN_LANGUAGE_MULTIPLIER || "1.02",
        KOREAN_MAX_CAP: process.env.KOREAN_MAX_CAP || "5.0",
        GLOBAL_LOG_BASE: process.env.GLOBAL_LOG_BASE || "30",
        GLOBAL_LANGUAGE_MULTIPLIER: process.env.GLOBAL_LANGUAGE_MULTIPLIER || "1.0",
        GLOBAL_MAX_CAP: process.env.GLOBAL_MAX_CAP || "4.0",
        SYSTEM_START_DATE: process.env.SYSTEM_START_DATE || "2025-09-02",
        ...commonEventDatesEnv,
        ...commonTtlEnv,
        ...commonScoreWeightsEnv,
      },
      logGroup: new logs.LogGroup(this, "ScoreCalculatorLogGroup", {
        logGroupName: "/aws/lambda/nasun-score-calculator",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    leaderboardTable.grantReadWriteData(cumulativeScoreCalculatorFunction);
    cumulativeScoreCalculatorFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    cumulativeScoreCalculatorFunction.addToRolePolicy(secretsReadPolicy);

    // Leaderboard Generator
    const cumulativeLeaderboardGeneratorFunction = new lambda.Function(this, "CumulativeLeaderboardGeneratorFunction", {
      functionName: "nasun-leaderboard-generator",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/cumulative-leaderboard-generator.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        USER_IDENTITY_MAP_TABLE: userIdentityMapTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonAdminEnv,
        ...commonEventDatesEnv,
        ...commonActivityBonusEnv,
        COMMUNITY_WEIGHT_ENABLED: process.env.COMMUNITY_WEIGHT_ENABLED || "true",
        ...commonScoreWeightsEnv,
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true",
        ...commonTtlEnv,
        API_GATEWAY_ID: process.env.API_GATEWAY_ID || "",
        API_GATEWAY_STAGE: process.env.API_GATEWAY_STAGE || "prod",
      },
      logGroup: new logs.LogGroup(this, "LeaderboardGeneratorLogGroup", {
        logGroupName: "/aws/lambda/nasun-leaderboard-generator",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    leaderboardTable.grantReadWriteData(cumulativeLeaderboardGeneratorFunction);
    userIdentityMapTable.grantReadData(cumulativeLeaderboardGeneratorFunction);
    cumulativeLeaderboardGeneratorFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    cumulativeLeaderboardGeneratorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Scan'],
      resources: ['arn:aws:dynamodb:ap-northeast-2:135808943968:table/UserProfiles']
    }));
    cumulativeLeaderboardGeneratorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['apigateway:FlushStageCache', 'apigateway:DELETE'],
      resources: ['*'],
    }));

    // Invoke permission: ScoreCalculator -> LeaderboardGenerator
    cumulativeScoreCalculatorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [cumulativeLeaderboardGeneratorFunction.functionArn]
    }));

    // ========================================
    // Step Functions Pipeline Lambda Functions
    // ========================================

    // SNS Topic for failure notifications
    const dataCollectionTopic = new sns.Topic(this, "DataCollectionTopic", {
      topicName: "nasun-data-collection-alerts",
      displayName: "NASUN Data Collection Alerts"
    });

    // Get Target Tweets
    const getTargetTweetsFunction = new lambda.Function(this, "GetTargetTweetsFunction", {
      functionName: "nasun-get-target-tweets",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/get-target-tweets.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        ...commonTargetEnv,
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        SYSTEM_START_DATE: process.env.SYSTEM_START_DATE || "2025-09-02",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true",
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
      },
      logGroup: new logs.LogGroup(this, "GetTargetTweetsLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-target-tweets",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    leaderboardTable.grantReadWriteData(getTargetTweetsFunction);
    getTargetTweetsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    getTargetTweetsFunction.addToRolePolicy(secretsReadPolicy);

    // Collect Mentions
    const collectMentionsFunction = new lambda.Function(this, "CollectMentionsFunction", {
      functionName: "nasun-collect-mentions",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-mentions.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        ...commonTargetEnv,
        SYSTEM_VERSION: "1.0",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true",
        MENTION_TTL_DAYS: process.env.MENTION_TTL_DAYS || "365",
        REPLY_COUNTER_TTL_DAYS: process.env.REPLY_COUNTER_TTL_DAYS || "365",
        EAGER_USER_VIEW_SAVE: "true",
      },
      logGroup: new logs.LogGroup(this, "CollectMentionsLogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-mentions",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    leaderboardTable.grantReadWriteData(collectMentionsFunction);
    collectMentionsFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // Aggregate Results
    const aggregateResultsFunction = new lambda.Function(this, "AggregateResultsFunction", {
      functionName: "nasun-aggregate-results",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/aggregate-results.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        SYSTEM_VERSION: "1.0",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true",
      },
      logGroup: new logs.LogGroup(this, "AggregateResultsLogGroup", {
        logGroupName: "/aws/lambda/nasun-aggregate-results",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    leaderboardTable.grantReadWriteData(aggregateResultsFunction);
    aggregateResultsFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // Handle Failure
    const handleFailureFunction = new lambda.Function(this, "HandleFailureFunction", {
      functionName: "nasun-handle-failure",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/handle-failure.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SNS_TOPIC_ARN: dataCollectionTopic.topicArn,
        SYSTEM_VERSION: "1.0",
      },
      logGroup: new logs.LogGroup(this, "HandleFailureLogGroup", {
        logGroupName: "/aws/lambda/nasun-handle-failure",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    leaderboardTable.grantReadWriteData(handleFailureFunction);
    handleFailureFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    dataCollectionTopic.grantPublish(handleFailureFunction);

    // ========================================
    // API Lambda Functions
    // ========================================

    const getCumulativeLeaderboardFunction = new lambda.Function(this, "GetCumulativeLeaderboardFunction", {
      functionName: "nasun-get-leaderboard",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-cumulative-leaderboard.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonAdminEnv,
        ...commonEventDatesEnv,
        ...commonTtlEnv,
      },
      logGroup: new logs.LogGroup(this, "GetLeaderboardLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-leaderboard",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getCumulativeLeaderboardFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const getBookmarkStatsFunction = new lambda.Function(this, "GetBookmarkStatsFunction", {
      functionName: "nasun-get-bookmark-stats",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-bookmark-stats.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonAdminEnv,
      },
      logGroup: new logs.LogGroup(this, "GetBookmarkStatsLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-bookmark-stats",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getBookmarkStatsFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const getExcludedAccountsStatusFunction = new lambda.Function(this, "GetExcludedAccountsStatusFunction", {
      functionName: "nasun-get-excluded-accounts-status",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/excluded-accounts-status.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonAdminEnv,
      },
      logGroup: new logs.LogGroup(this, "GetExcludedAccountsLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-excluded-accounts-status",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getExcludedAccountsStatusFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const getLeaderboardSnapshotFunction = new lambda.Function(this, "GetLeaderboardSnapshotFunction", {
      functionName: "nasun-get-leaderboard-snapshot",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-leaderboard-snapshot.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "GetSnapshotLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-leaderboard-snapshot",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getLeaderboardSnapshotFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // User Rank Search Functions
    const getUserRankFunction = new lambda.Function(this, "GetUserRankFunction", {
      functionName: "nasun-get-user-rank",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-user-rank.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "GetUserRankLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-user-rank",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getUserRankFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const searchUsersFunction = new lambda.Function(this, "SearchUsersFunction", {
      functionName: "nasun-search-users",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/search-users.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "SearchUsersLogGroup", {
        logGroupName: "/aws/lambda/nasun-search-users",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    searchUsersFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const autocompleteFunction = new lambda.Function(this, "AutocompleteFunction", {
      functionName: "nasun-autocomplete",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-autocomplete.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "AutocompleteLogGroup", {
        logGroupName: "/aws/lambda/nasun-autocomplete",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    autocompleteFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const rankChangesFunction = new lambda.Function(this, "RankChangesFunction", {
      functionName: "nasun-rank-changes",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-rank-changes.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "RankChangesLogGroup", {
        logGroupName: "/aws/lambda/nasun-rank-changes",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    rankChangesFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const getUserRankHistoryFunction = new lambda.Function(this, "GetUserRankHistoryFunction", {
      functionName: "nasun-get-user-rank-history",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-user-rank-history.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "GetUserRankHistoryLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-user-rank-history",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getUserRankHistoryFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const getTopClimbersFunction = new lambda.Function(this, "GetTopClimbersFunction", {
      functionName: "nasun-get-top-climbers",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-top-climbers.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "GetTopClimbersLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-top-climbers",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getTopClimbersFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    const getLeaderboardConfigFunction = new lambda.Function(this, "GetLeaderboardConfigFunction", {
      functionName: "nasun-get-leaderboard-config",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-leaderboard-config.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        VISIBLE_LEADERBOARDS: process.env.VISIBLE_LEADERBOARDS || "CUMULATIVE,EVENT1,EVENT2,EVENT3",
        ...commonEventDatesEnv,
      },
      logGroup: new logs.LogGroup(this, "GetLeaderboardConfigLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-leaderboard-config",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole,
    });
    getLeaderboardConfigFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // ========================================
    // API Gateway
    // ========================================
    const apiGatewayCacheEnabled = process.env.API_GATEWAY_CACHE_ENABLED === 'true';

    const nasunApi = new apigw.RestApi(this, "NasunApi", {
      restApiName: "NASUN X-Leaderboard API",
      description: "NASUN API Gateway for X Leaderboard V2 system",
      deployOptions: {
        stageName: 'prod',
        cachingEnabled: apiGatewayCacheEnabled,
        cacheClusterEnabled: apiGatewayCacheEnabled,
        cacheClusterSize: apiGatewayCacheEnabled ? '1.6' : undefined,
        cacheTtl: apiGatewayCacheEnabled ? cdk.Duration.minutes(30) : undefined,
        cacheDataEncrypted: apiGatewayCacheEnabled ? true : undefined,
        throttlingBurstLimit: 2000,
        throttlingRateLimit: 1000,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ["http://localhost:5177", "http://localhost:5174", "https://nasun.io", "https://staging.nasun.io"],
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "X-Amz-Security-Token"],
      },
    });

    const apiRoot = nasunApi.root.addResource("api");
    const apiKey = nasunApi.addApiKey("NasunApiKey", {
      apiKeyName: "nasun-x-leaderboard-api-key",
      description: "X Leaderboard API Key"
    });
    const usagePlan = nasunApi.addUsagePlan("NasunUsagePlan", {
      name: "X Leaderboard Usage Plan",
      throttle: { rateLimit: 1000, burstLimit: 2000 },
      quota: { limit: 10000, period: apigw.Period.DAY }
    });
    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: nasunApi.deploymentStage });

    // CORS method response helper
    const corsMethodResponses = (statusCodes: string[]) =>
      statusCodes.map(statusCode => ({
        statusCode,
        responseParameters: {
          "method.response.header.Access-Control-Allow-Origin": true,
          "method.response.header.Access-Control-Allow-Headers": true,
          "method.response.header.Access-Control-Allow-Methods": true
        }
      }));

    // /api/leaderboard
    const leaderboardResource = apiRoot.addResource("leaderboard");

    // GET /api/leaderboard/cumulative
    const cumulativeResource = leaderboardResource.addResource("cumulative");
    cumulativeResource.addMethod("GET", new apigw.LambdaIntegration(getCumulativeLeaderboardFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.querystring.period', 'method.request.querystring.page', 'method.request.querystring.limit', 'method.request.querystring.date']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.querystring.page': false, 'method.request.querystring.limit': false, 'method.request.querystring.period': false, 'method.request.querystring.date': false },
      methodResponses: corsMethodResponses(["200", "400", "500"]),
    });

    // GET /api/leaderboard/cumulative/bookmark-stats
    const bookmarkStatsResource = cumulativeResource.addResource("bookmark-stats");
    bookmarkStatsResource.addMethod("GET", new apigw.LambdaIntegration(getBookmarkStatsFunction), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.querystring.period': false, 'method.request.querystring.includeTopUsers': false, 'method.request.querystring.topUsersLimit': false },
      methodResponses: corsMethodResponses(["200", "400", "500"]),
    });

    // GET /api/leaderboard/cumulative/excluded-accounts-status
    const excludedAccountsStatusResource = cumulativeResource.addResource("excluded-accounts-status");
    excludedAccountsStatusResource.addMethod("GET", new apigw.LambdaIntegration(getExcludedAccountsStatusFunction), {
      apiKeyRequired: false,
      methodResponses: corsMethodResponses(["200", "500"]),
    });

    // GET /api/leaderboard/cumulative/snapshots/{date}
    const snapshotsResource = cumulativeResource.addResource("snapshots");
    const dateResource = snapshotsResource.addResource("{date}");
    dateResource.addMethod("GET", new apigw.LambdaIntegration(getLeaderboardSnapshotFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.path.date', 'method.request.querystring.page', 'method.request.querystring.limit']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.path.date': true, 'method.request.querystring.page': false, 'method.request.querystring.limit': false },
      methodResponses: corsMethodResponses(["200", "400", "404", "500"]),
    });

    // Event period snapshot endpoints
    const eventSnapshotEndpoint = (name: string) => {
      const eventResource = leaderboardResource.addResource(name);
      const eventSnapshots = eventResource.addResource("snapshots");
      const eventDate = eventSnapshots.addResource("{date}");
      eventDate.addMethod("GET", new apigw.LambdaIntegration(getLeaderboardSnapshotFunction, {
        proxy: true,
        cacheKeyParameters: ['method.request.path.date', 'method.request.querystring.page', 'method.request.querystring.limit']
      }), {
        apiKeyRequired: false,
        requestParameters: { 'method.request.path.date': true, 'method.request.querystring.page': false, 'method.request.querystring.limit': false },
        methodResponses: corsMethodResponses(["200", "400", "404", "500"]),
      });
    };
    eventSnapshotEndpoint("event1");
    eventSnapshotEndpoint("event2");

    // GET /api/leaderboard/{period}/user/{username}
    const periodResource = leaderboardResource.addResource("{period}");
    const userResource = periodResource.addResource("user");
    const usernameResource = userResource.addResource("{username}");
    usernameResource.addMethod("GET", new apigw.LambdaIntegration(getUserRankFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.path.period', 'method.request.path.username', 'method.request.querystring.date']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.path.period': true, 'method.request.path.username': true, 'method.request.querystring.date': false },
      methodResponses: corsMethodResponses(["200", "400", "404", "500"]),
    });

    // GET /api/leaderboard/{period}/user/{username}/history
    const historyResource = usernameResource.addResource("history");
    historyResource.addMethod("GET", new apigw.LambdaIntegration(getUserRankHistoryFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.path.period', 'method.request.path.username', 'method.request.querystring.days']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.path.period': true, 'method.request.path.username': true, 'method.request.querystring.days': false },
      methodResponses: corsMethodResponses(["200", "400", "404", "500"]),
    });

    // GET /api/leaderboard/{period}/search
    const searchResource = periodResource.addResource("search");
    searchResource.addMethod("GET", new apigw.LambdaIntegration(searchUsersFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.path.period', 'method.request.querystring.q', 'method.request.querystring.query', 'method.request.querystring.date', 'method.request.querystring.limit']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.path.period': true, 'method.request.querystring.q': false, 'method.request.querystring.query': false, 'method.request.querystring.date': false, 'method.request.querystring.limit': false },
      methodResponses: corsMethodResponses(["200", "400", "500"]),
    });

    // GET /api/leaderboard/{period}/autocomplete
    const autocompleteResource = periodResource.addResource("autocomplete");
    autocompleteResource.addMethod("GET", new apigw.LambdaIntegration(autocompleteFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.path.period', 'method.request.querystring.q', 'method.request.querystring.query', 'method.request.querystring.limit']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.path.period': true, 'method.request.querystring.q': false, 'method.request.querystring.query': false, 'method.request.querystring.limit': false },
      methodResponses: corsMethodResponses(["200", "400", "500"]),
    });

    // GET /api/leaderboard/{period}/top-climbers
    const topClimbersResource = periodResource.addResource("top-climbers");
    topClimbersResource.addMethod("GET", new apigw.LambdaIntegration(getTopClimbersFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.path.period', 'method.request.querystring.timeRange', 'method.request.querystring.limit']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.path.period': true, 'method.request.querystring.timeRange': false, 'method.request.querystring.limit': false },
      methodResponses: corsMethodResponses(["200", "400", "500"]),
    });

    // GET /api/leaderboard/{period}/changes
    const changesResource = periodResource.addResource("changes");
    changesResource.addMethod("GET", new apigw.LambdaIntegration(rankChangesFunction, {
      proxy: true,
      cacheKeyParameters: ['method.request.path.period']
    }), {
      apiKeyRequired: false,
      requestParameters: { 'method.request.path.period': true },
      methodResponses: corsMethodResponses(["200", "400", "500"]),
    });

    // GET /api/leaderboard/config
    const configResource = leaderboardResource.addResource("config");
    configResource.addMethod("GET", new apigw.LambdaIntegration(getLeaderboardConfigFunction), {
      apiKeyRequired: false,
      methodResponses: corsMethodResponses(["200", "500"]),
    });

    // ========================================
    // Community Classifier Batch (Weekly)
    // ========================================
    const communityClassifierBatchFunction = new lambda.Function(this, "CommunityClassifierBatchFunction", {
      functionName: "nasun-community-classifier-batch",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/community-classifier-batch.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        ...commonTwitterEnv,
        ENABLE_OAUTH_AUTHENTICATION: "true",
        ENABLE_OAUTH2_AUTHENTICATION: "true",
        FALLBACK_TO_BEARER_TOKEN: "true",
        COMMUNITY_WEIGHT_ENABLED: "true",
        KOREAN_LOG_BASE: "8",
        KOREAN_LANGUAGE_MULTIPLIER: "1.2",
        KOREAN_MAX_CAP: "5.0",
        GLOBAL_LOG_BASE: "30",
        GLOBAL_LANGUAGE_MULTIPLIER: "1.0",
        GLOBAL_MAX_CAP: "4.0",
        BATCH_SIZE: "5",
        MAX_USERS_PER_RUN: "100",
        DRY_RUN: "false",
        PROCESSING_TIMEOUT_MS: "840000",
      },
    });
    leaderboardTable.grantReadWriteData(communityClassifierBatchFunction);
    communityClassifierBatchFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*']
    }));
    communityClassifierBatchFunction.addToRolePolicy(secretsReadPolicy);

    new events.Rule(this, "CommunityClassificationSchedule", {
      ruleName: "nasun-community-classification-weekly",
      schedule: events.Schedule.cron({ minute: '0', hour: '3', weekDay: 'SUN' }),
      description: "Weekly community classification batch processing"
    }).addTarget(new targets.LambdaFunction(communityClassifierBatchFunction));

    // ========================================
    // OAuth 2.0 Token Refresh System
    // ========================================
    const refreshOAuth2TokenFunction = new lambda.Function(this, "RefreshOAuth2TokenFunction", {
      functionName: "nasun-refresh-oauth2-token",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "system/refresh-oauth2-token.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      environment: {
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:5174/callback",
      },
    });
    refreshOAuth2TokenFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret", "secretsmanager:DescribeSecret"],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-twitter-tokens-*`],
    }));
    refreshOAuth2TokenFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*']
    }));
    refreshOAuth2TokenFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // Token Refresh DLQ
    const tokenRefreshDLQ = new sqs.Queue(this, "TokenRefreshDLQ", {
      queueName: "nasun-oauth2-token-refresh-dlq",
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout: cdk.Duration.minutes(5)
    });

    // EventBridge: Token refresh every 70 minutes
    const tokenRefreshRule = new events.Rule(this, "TokenRefreshSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(70)),
      description: "OAuth 2.0 token refresh every 70 minutes",
      enabled: true
    });
    tokenRefreshRule.addTarget(new targets.LambdaFunction(refreshOAuth2TokenFunction, {
      event: events.RuleTargetInput.fromObject({
        source: "eventbridge.scheduled",
        scheduledExecution: true,
        forceRefresh: false
      }),
      deadLetterQueue: tokenRefreshDLQ,
      retryAttempts: 3,
      maxEventAge: cdk.Duration.minutes(10)
    }));

    // ========================================
    // OAuth Token Monitoring (CloudWatch Alarms)
    // ========================================
    const monitoringTopic = sns.Topic.fromTopicArn(
      this, "MonitoringTopic",
      "arn:aws:sns:ap-northeast-2:135808943968:nasun-monitoring-alerts"
    );

    const tokenRefreshFailureAlarm = new cloudwatch.Alarm(this, "TokenRefreshFailureAlarm", {
      alarmName: "nasun-oauth2-token-refresh-failure",
      metric: refreshOAuth2TokenFunction.metricErrors({ period: cdk.Duration.minutes(5), statistic: "Sum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "OAuth 2.0 token refresh failed"
    });
    tokenRefreshFailureAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    const tokenNotRefreshedAlarm = new cloudwatch.Alarm(this, "TokenNotRefreshedAlarm", {
      alarmName: "nasun-oauth2-token-not-refreshed-3h",
      metric: refreshOAuth2TokenFunction.metricInvocations({ period: cdk.Duration.hours(3), statistic: "Sum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: "OAuth token not refreshed for 3+ hours"
    });
    tokenNotRefreshedAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    const dlqAlarm = new cloudwatch.Alarm(this, "TokenRefreshDLQAlarm", {
      alarmName: "nasun-oauth2-dlq-not-empty",
      metric: tokenRefreshDLQ.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5), statistic: "Maximum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "EventBridge failed to invoke token refresh Lambda"
    });
    dlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    new cloudwatch.Alarm(this, "InvalidRefreshTokenAlarm", {
      alarmName: "nasun-oauth2-invalid-refresh-token",
      metric: new cloudwatch.Metric({ namespace: "NASUN/OAuth", metricName: "InvalidRefreshToken", statistic: "Sum", period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "CRITICAL: Refresh Token invalid - manual re-authentication required"
    }).addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    new cloudwatch.Alarm(this, "SecretUpdateFailureAlarm", {
      alarmName: "nasun-oauth2-secret-update-failure",
      metric: new cloudwatch.Metric({ namespace: "NASUN/OAuth", metricName: "SecretUpdateFailure", statistic: "Sum", period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "CRITICAL: Secrets Manager update failed"
    }).addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // ========================================
    // V3 Unified Pipeline Lambda Functions
    // ========================================

    // Tweet Batch Splitter
    const tweetBatchSplitterFunction = new lambda.Function(this, "TweetBatchSplitterFunction", {
      functionName: "nasun-tweet-batch-splitter",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/tweet-batch-splitter.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: { SYSTEM_VERSION: "v3", BATCH_SIZE: "5" },
      logGroup: new logs.LogGroup(this, "TweetBatchSplitterLogGroup", {
        logGroupName: "/aws/lambda/nasun-tweet-batch-splitter",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    leaderboardTable.grantReadWriteData(tweetBatchSplitterFunction);
    tweetBatchSplitterFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    tweetBatchSplitterFunction.addToRolePolicy(secretsReadPolicy);

    // Collect Likes
    const collectLikesFunction = new lambda.Function(this, "CollectLikesFunction", {
      functionName: "nasun-collect-likes",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-likes.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        RATE_LIMIT_WINDOW_MINUTES: "15",
        RATE_LIMIT_MAX_CALLS: "5",
        MAX_LIKES_PER_TWEET: process.env.MAX_LIKES_PER_TWEET || "500",
        ...commonOAuth2CollectorEnv,
      },
      logGroup: new logs.LogGroup(this, "CollectLikesLogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-likes",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    leaderboardTable.grantReadWriteData(collectLikesFunction);
    collectLikesFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    collectLikesFunction.addToRolePolicy(secretsReadPolicy);

    // Collect Retweets
    const collectRetweetsFunction = new lambda.Function(this, "CollectRetweetsFunction", {
      functionName: "nasun-collect-retweets",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-retweets.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        RATE_LIMIT_WINDOW_MINUTES: "15",
        RATE_LIMIT_MAX_CALLS: "5",
        MAX_REPOSTS_PER_TWEET: process.env.MAX_REPOSTS_PER_TWEET || "500",
        ...commonOAuth2CollectorEnv,
      },
      logGroup: new logs.LogGroup(this, "CollectRetweetsLogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-retweets",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    leaderboardTable.grantReadWriteData(collectRetweetsFunction);
    collectRetweetsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    collectRetweetsFunction.addToRolePolicy(secretsReadPolicy);

    // Collect Quotes
    const collectQuotesFunction = new lambda.Function(this, "CollectQuotesFunction", {
      functionName: "nasun-collect-quotes",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-quotes.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        RATE_LIMIT_WINDOW_MINUTES: "15",
        RATE_LIMIT_MAX_CALLS: "5",
        ...commonOAuth2CollectorEnv,
      },
      logGroup: new logs.LogGroup(this, "CollectQuotesLogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-quotes",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    leaderboardTable.grantReadWriteData(collectQuotesFunction);
    collectQuotesFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    collectQuotesFunction.addToRolePolicy(secretsReadPolicy);

    // Mention Collector (Search)
    const mentionCollectorFunction = new lambda.Function(this, "MentionCollectorFunction", {
      functionName: "nasun-collect-mentions-search",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-mentions-search.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        MAX_MENTIONS_PER_DAY: process.env.MAX_MENTIONS_PER_DAY || "1000",
        ...commonOAuth2CollectorEnv,
      },
      logGroup: new logs.LogGroup(this, "MentionCollectorLogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-mentions-search",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    leaderboardTable.grantReadWriteData(mentionCollectorFunction);
    mentionCollectorFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    mentionCollectorFunction.addToRolePolicy(secretsReadPolicy);

    // Mention Details Collector
    const mentionDetailsCollectorFunction = new lambda.Function(this, "MentionDetailsCollectorFunction", {
      functionName: "nasun-collect-mention-details",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-mention-details.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: leaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        ...commonOAuth2CollectorEnv,
      },
      logGroup: new logs.LogGroup(this, "MentionDetailsLogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-mention-details",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    leaderboardTable.grantReadWriteData(mentionDetailsCollectorFunction);
    mentionDetailsCollectorFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    mentionDetailsCollectorFunction.addToRolePolicy(secretsReadPolicy);

    // ========================================
    // V3 Step Functions Pipeline
    // ========================================

    // Phase 0: OAuth Token Refresh
    const refreshTokenTask = new stepfunctionsTasks.LambdaInvoke(this, "RefreshTokenIfNeeded", {
      lambdaFunction: refreshOAuth2TokenFunction,
      comment: "Phase 0: Refresh OAuth 2.0 token if expiring within 5 minutes",
      resultPath: "$.refreshTokenResult",
      retryOnServiceExceptions: false,
      payload: stepfunctions.TaskInput.fromObject({ source: "stepfunctions.pipeline", forceRefresh: false })
    });

    // Phase 1: Get Target Tweets
    const getTargetTweetsTask = new stepfunctionsTasks.LambdaInvoke(this, "GetTargetTweets", {
      lambdaFunction: getTargetTweetsFunction,
      comment: "Phase 1: Get target tweets for the specified date range",
      resultPath: "$.getTargetTweetsResult",
      retryOnServiceExceptions: false
    });

    // Phase 1.5: Tweet Batch Splitter
    const tweetBatchSplitterTask = new stepfunctionsTasks.LambdaInvoke(this, "TweetBatchSplitterTask", {
      lambdaFunction: tweetBatchSplitterFunction,
      comment: "Split tweets into batches of 5 for rate limit compliance",
      inputPath: "$.getTargetTweetsResult.Payload",
      resultPath: "$.batchSplitterResult",
      retryOnServiceExceptions: false
    });

    // Phase 2: Engagement Collection Tasks
    const collectLikesTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectLikesTask", {
      lambdaFunction: collectLikesFunction,
      comment: "Collect likes for tweet batch",
      retryOnServiceExceptions: false,
      resultPath: '$.likeResult',
      payload: stepfunctions.TaskInput.fromObject({
        'tweetBatch.$': '$.tweetBatch',
        'targetUser.$': '$.targetUser',
        'dateRange.$': '$.dateRange',
        'collectionDate.$': '$.collectionDate'
      })
    });

    const collectRetweetsTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectRetweetsTask", {
      lambdaFunction: collectRetweetsFunction,
      comment: "Collect retweets for tweet batch",
      retryOnServiceExceptions: false,
      resultPath: '$.retweetResult',
      payload: stepfunctions.TaskInput.fromObject({
        'tweetBatch.$': '$.tweetBatch',
        'targetUser.$': '$.targetUser',
        'dateRange.$': '$.dateRange',
        'collectionDate.$': '$.collectionDate'
      })
    });

    const collectQuotesTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectQuotesTask", {
      lambdaFunction: collectQuotesFunction,
      comment: "Collect quotes for tweet batch",
      retryOnServiceExceptions: false,
      resultPath: '$.quoteResult',
      payload: stepfunctions.TaskInput.fromObject({
        'tweetBatch.$': '$.tweetBatch',
        'targetUser.$': '$.targetUser',
        'dateRange.$': '$.dateRange',
        'collectionDate.$': '$.collectionDate'
      })
    });

    // Wait states for rate limit compliance
    const waitAfterLikes = new stepfunctions.Wait(this, "WaitAfterLikes", {
      time: stepfunctions.WaitTime.secondsPath('$.tweetBatch.waitAfterLikesSeconds'),
      comment: "Dynamic wait based on batch count - Rate Limit 5 calls/15min"
    });

    const waitAfterRetweets = new stepfunctions.Wait(this, "WaitAfterRetweets", {
      time: stepfunctions.WaitTime.secondsPath('$.tweetBatch.waitAfterRetweetsSeconds'),
      comment: "Dynamic wait based on batch count - Rate Limit 5 calls/15min"
    });

    // Branch A: High Rate Limit Group (Sequential)
    const highRateLimitChain = collectLikesTask
      .addRetry({ errors: ["NASUN.RateLimitError"], interval: cdk.Duration.minutes(15), maxAttempts: 2, backoffRate: 1.0 })
      .next(waitAfterLikes)
      .next(collectRetweetsTask.addRetry({ errors: ["NASUN.RateLimitError"], interval: cdk.Duration.minutes(15), maxAttempts: 2, backoffRate: 1.0 }))
      .next(waitAfterRetweets)
      .next(collectQuotesTask.addRetry({ errors: ["NASUN.RateLimitError"], interval: cdk.Duration.minutes(15), maxAttempts: 2, backoffRate: 1.0 }));

    // Map state for batch processing
    const batchProcessingMap = new stepfunctions.Map(this, "ProcessTweetBatches", {
      comment: "Process each tweet batch sequentially with rate limit compliance",
      maxConcurrency: 1,
      itemsPath: "$.batchSplitterResult.Payload.tweetBatches",
      itemSelector: {
        "tweetBatch.$": "$$.Map.Item.Value",
        "targetUser.$": "$.getTargetTweetsResult.Payload.targetUser",
        "dateRange.$": "$.getTargetTweetsResult.Payload.dateRange",
        "collectionDate.$": "$.getTargetTweetsResult.Payload.collectionDate"
      }
    });
    batchProcessingMap.itemProcessor(highRateLimitChain);

    // Branch B: Mention Collection
    const mentionCollectorTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectMentionsTask", {
      lambdaFunction: mentionCollectorFunction,
      comment: "Search mentions using 60 calls/15min API",
      resultPath: "$.mentionCollectorResult",
      retryOnServiceExceptions: false,
      payload: stepfunctions.TaskInput.fromObject({
        'targetUser.$': '$.getTargetTweetsResult.Payload.targetUser',
        'dateRange.$': '$.getTargetTweetsResult.Payload.snapshotStrategy.active',
        'collectionDate.$': '$.getTargetTweetsResult.Payload.collectionDate'
      })
    }).addRetry({ errors: ["NASUN.RateLimitError"], interval: cdk.Duration.minutes(15), maxAttempts: 3, backoffRate: 1.0 });

    // Mention Details Processing
    const mentionDetailsCollectorTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectMentionDetailsTask", {
      lambdaFunction: mentionDetailsCollectorFunction,
      comment: "Collect detailed information for each mention batch",
      retryOnServiceExceptions: false,
      payload: stepfunctions.TaskInput.fromObject({
        'mentionBatch.$': '$.mentionBatch',
        'targetUser.$': '$.targetUser'
      })
    }).addRetry({ errors: ["NASUN.RateLimitError"], interval: cdk.Duration.minutes(15), maxAttempts: 3, backoffRate: 1.0 });

    const mentionBatchesMap = new stepfunctions.Map(this, "MentionBatchesMap", {
      comment: "Process mention batches sequentially",
      itemsPath: "$.parallelResults[1].mentionCollectorResult.Payload.mentionBatches",
      itemSelector: {
        'mentionBatch.$': '$$.Map.Item.Value',
        'targetUser.$': '$.getTargetTweetsResult.Payload.targetUser',
        'targetTweetIds.$': '$.getTargetTweetsResult.Payload.targetTweetIds'
      },
      maxConcurrency: 1,
      resultPath: "$.mentionDetailsResults"
    });
    mentionBatchesMap.itemProcessor(mentionDetailsCollectorTask);

    // Phase 3-5: Post-collection processing
    const waitAfterMentionDetails1 = new stepfunctions.Wait(this, "WaitAfterMentionDetails1", {
      time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(5)),
      comment: "Wait before Phase 3 (mentions found)"
    });
    const waitAfterMentionDetails2 = new stepfunctions.Wait(this, "WaitAfterMentionDetails2", {
      time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(5)),
      comment: "Wait before Phase 3 (no mentions)"
    });

    const aggregateResultsTask1 = new stepfunctionsTasks.LambdaInvoke(this, "AggregateResults_WithMentions", {
      lambdaFunction: aggregateResultsFunction,
      comment: "Phase 3: Aggregate collection results",
      inputPath: "$",
      resultPath: "$.aggregationResult",
      retryOnServiceExceptions: false
    });
    const aggregateResultsTask2 = new stepfunctionsTasks.LambdaInvoke(this, "AggregateResults_NoMentions", {
      lambdaFunction: aggregateResultsFunction,
      comment: "Phase 3: Aggregate collection results",
      inputPath: "$",
      resultPath: "$.aggregationResult",
      retryOnServiceExceptions: false
    });

    const handleFailureTask = new stepfunctionsTasks.LambdaInvoke(this, "HandleFailure", {
      lambdaFunction: handleFailureFunction,
      comment: "Handle pipeline failures",
      retryOnServiceExceptions: false
    });

    const prepareScoreInput1 = new stepfunctions.Pass(this, "PrepareScoreCalculatorInput_WithMentions", {
      comment: "Extract collectionDate from AggregateResults",
      parameters: {
        "targetDate.$": "$.aggregationResult.Payload.collectionDate",
        "forceRecalculation.$": "$.forceRecalculation",
        "collectedEngagements.$": "$.aggregationResult.Payload.collectedEngagements"
      }
    });
    const prepareScoreInput2 = new stepfunctions.Pass(this, "PrepareScoreCalculatorInput_NoMentions", {
      comment: "Extract collectionDate from AggregateResults",
      parameters: {
        "targetDate.$": "$.aggregationResult.Payload.collectionDate",
        "forceRecalculation.$": "$.forceRecalculation",
        "collectedEngagements.$": "$.aggregationResult.Payload.collectedEngagements"
      }
    });

    const scoreCalculatorTask1 = new stepfunctionsTasks.LambdaInvoke(this, "ScoreCalculator_WithMentions", {
      lambdaFunction: cumulativeScoreCalculatorFunction,
      comment: "Phase 4: Calculate scores",
      retryOnServiceExceptions: false,
      resultPath: "$.scoreCalculatorResult"
    });
    const scoreCalculatorTask2 = new stepfunctionsTasks.LambdaInvoke(this, "ScoreCalculator_NoMentions", {
      lambdaFunction: cumulativeScoreCalculatorFunction,
      comment: "Phase 4: Calculate scores",
      retryOnServiceExceptions: false,
      resultPath: "$.scoreCalculatorResult"
    });

    const waitForGsi1 = new stepfunctions.Wait(this, 'WaitForGsiUpdate1', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.seconds(10)),
      comment: 'Wait for GSI consistency'
    });
    const waitForGsi2 = new stepfunctions.Wait(this, 'WaitForGsiUpdate2', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.seconds(10)),
      comment: 'Wait for GSI consistency'
    });

    const leaderboardGeneratorTask1 = new stepfunctionsTasks.LambdaInvoke(this, "LeaderboardGenerator_WithMentions", {
      lambdaFunction: cumulativeLeaderboardGeneratorFunction,
      comment: "Phase 5: Generate leaderboard",
      retryOnServiceExceptions: false,
      resultPath: "$.leaderboardGeneratorResult"
    });
    const leaderboardGeneratorTask2 = new stepfunctionsTasks.LambdaInvoke(this, "LeaderboardGenerator_NoMentions", {
      lambdaFunction: cumulativeLeaderboardGeneratorFunction,
      comment: "Phase 5: Generate leaderboard",
      retryOnServiceExceptions: false,
      resultPath: "$.leaderboardGeneratorResult"
    });

    // Pipeline chains
    const phase234Chain = mentionBatchesMap
      .next(waitAfterMentionDetails1)
      .next(aggregateResultsTask1)
      .next(prepareScoreInput1)
      .next(scoreCalculatorTask1)
      .next(waitForGsi1)
      .next(leaderboardGeneratorTask1);

    const noMentionsChain = new stepfunctions.Pass(this, "NoMentionsFound", {
      comment: "No mentions found, skip mention details",
      resultPath: "$.mentionDetailsResults"
    })
      .next(waitAfterMentionDetails2)
      .next(aggregateResultsTask2)
      .next(prepareScoreInput2)
      .next(scoreCalculatorTask2)
      .next(waitForGsi2)
      .next(leaderboardGeneratorTask2);

    const checkMentionsChoice = new stepfunctions.Choice(this, "CheckMentionsFound")
      .when(
        stepfunctions.Condition.isPresent("$.parallelResults[1].mentionCollectorResult.Payload.mentionBatches[0]"),
        phase234Chain
      )
      .otherwise(noMentionsChain);

    // Conditional Passive Batch Processing
    const passiveBatchProcessingChoice = new stepfunctions.Choice(this, "CheckTweetsFound")
      .when(
        stepfunctions.Condition.isPresent("$.getTargetTweetsResult.Payload.tweets[0]"),
        batchProcessingMap.addCatch(handleFailureTask, { errors: ["States.ALL"], resultPath: "$.error" })
      )
      .otherwise(
        new stepfunctions.Pass(this, "SkipPassiveCollection", {
          comment: "No Passive tweets found, skip batch processing",
          resultPath: "$.batchProcessingResult"
        })
      );

    // Parallel: Passive + Active data collection
    const independentDataCollection = new stepfunctions.Parallel(this, "IndependentDataCollection", {
      comment: "Execute Passive and Active data collection independently",
      resultPath: "$.parallelResults"
    });
    independentDataCollection.branch(passiveBatchProcessingChoice);
    independentDataCollection.branch(mentionCollectorTask);

    // Full pipeline chain
    const originalChain = refreshTokenTask
      .addRetry({ errors: ["States.ALL"], interval: cdk.Duration.seconds(10), maxAttempts: 2, backoffRate: 2.0 })
      .next(getTargetTweetsTask.addRetry({ errors: ["States.ALL"], interval: cdk.Duration.seconds(30), maxAttempts: 2, backoffRate: 2.0 }))
      .next(tweetBatchSplitterTask)
      .next(independentDataCollection)
      .next(checkMentionsChoice);

    // ForceRecalculation input handling
    const injectDefaultForceRecalculation = new stepfunctions.Pass(this, 'InjectDefaultForceRecalculation', {
      result: stepfunctions.Result.fromBoolean(false),
      resultPath: '$.forceRecalculation',
      comment: 'Inject default forceRecalculation=false'
    });

    const v3Definition = new stepfunctions.Choice(this, 'CheckForceRecalculationInput')
      .when(stepfunctions.Condition.isPresent('$.forceRecalculation'), originalChain)
      .otherwise(injectDefaultForceRecalculation.next(originalChain));

    // State Machine
    const leaderboardDataPipeline = new stepfunctions.StateMachine(this, "UnifiedPipelineWithScoring", {
      stateMachineName: "nasun-leaderboard-pipeline",
      definitionBody: stepfunctions.DefinitionBody.fromChainable(v3Definition),
      timeout: cdk.Duration.hours(6),
      comment: "NASUN Complete Pipeline: Data Collection -> Score Calculation -> Leaderboard Generation",
      logs: {
        destination: new logs.LogGroup(this, "PipelineLogGroup", {
          logGroupName: "/aws/stepfunctions/nasun-leaderboard-pipeline-v3",
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true
      }
    });

    // ========================================
    // EventBridge: Daily Pipeline Schedule
    // ========================================
    const dailyDataCollectionRule = new events.Rule(this, "DailyDataCollectionRule", {
      ruleName: "nasun-daily-data-collection",
      description: "Trigger daily data collection at 9:10 AM KST",
      schedule: events.Schedule.cron({
        minute: "10",
        hour: "0",
        day: "*",
        month: "*",
        year: "*"
      }),
      enabled: true
    });
    dailyDataCollectionRule.addTarget(new targets.SfnStateMachine(leaderboardDataPipeline, {
      input: events.RuleTargetInput.fromObject({
        targetDate: events.EventField.time,
        source: "eventbridge.scheduled",
        scheduledExecution: true,
        forceRecalculation: false
      })
    }));

    // ========================================
    // Stack Outputs
    // ========================================
    new cdk.CfnOutput(this, "ApiKeyId", { value: apiKey.keyId });
    new cdk.CfnOutput(this, "ApiEndpoint", { value: nasunApi.url });
    new cdk.CfnOutput(this, "CumulativeTableName", { value: leaderboardTable.tableName });
    new cdk.CfnOutput(this, "DataCollectionTopicArn", { value: dataCollectionTopic.topicArn });
    new cdk.CfnOutput(this, "PipelineArn", { value: leaderboardDataPipeline.stateMachineArn });
    new cdk.CfnOutput(this, "DailyScheduleRuleName", { value: dailyDataCollectionRule.ruleName });
  }
}
