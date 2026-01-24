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
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";
import * as stepfunctionsTasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";

export class CdkStack extends cdk.Stack {
  // Phase 3: priceApiGateway와 priceUpdaterLambda는 CommonStack으로 이동됨
  public readonly nasunApi: apigw.RestApi;
  public readonly cumulativeScoreCalculatorFunction: lambda.Function;
  public readonly cumulativeLeaderboardGeneratorFunction: lambda.Function;
  public readonly getCumulativeLeaderboardFunction: lambda.Function;
  public readonly getBookmarkStatsFunction: lambda.Function;
  public readonly getExcludedAccountsStatusFunction: lambda.Function;
  public readonly getLeaderboardSnapshotFunction: lambda.Function;

  // 🆕 Phase 1: User Rank Search Lambda Functions
  public readonly getUserRankFunction: lambda.Function;
  public readonly searchUsersFunction: lambda.Function;

  // 🆕 Phase 3: Autocomplete Lambda Function
  public readonly autocompleteFunction: lambda.Function;

  // 🆕 Phase 3: Rank Changes Lambda Function
  public readonly rankChangesFunction: lambda.Function;

  // 🆕 My Account Rank History Lambda Function
  public readonly getUserRankHistoryFunction: lambda.Function;

  // 🆕 Top Climbers Spotlight Lambda Function
  public readonly getTopClimbersFunction: lambda.Function;

  public readonly userProfilesTable: dynamodb.ITable;
  public readonly cumulativeLeaderboardTable: dynamodb.ITable;

  // Step Functions Pipeline Resources
  public readonly getTargetTweetsFunction: lambda.Function;
  public readonly collectMentionsFunction: lambda.Function;
  public readonly aggregateResultsFunction: lambda.Function;
  public readonly handleFailureFunction: lambda.Function;
  public readonly dataCollectionTopic: sns.Topic;

  // Unified Data Collection Pipeline
  public readonly leaderboardDataPipeline: stepfunctions.StateMachine;
  public readonly tweetBatchSplitterFunction: lambda.Function;
  public readonly collectLikesFunction: lambda.Function;
  public readonly collectRetweetsFunction: lambda.Function;
  public readonly collectQuotesFunction: lambda.Function;
  public readonly mentionCollectorFunction: lambda.Function;
  public readonly mentionDetailsCollectorFunction: lambda.Function;

  // OAuth 2.0 Token Refresh Lambda Function
  public readonly refreshOAuth2TokenFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // Phase 3 - Step 1: NFT 관련 리소스 제거 완료 (2025-10-21)
    // CommonStack으로 이동됨:
    // - GetBackupPricesLambda + API
    // - GetSupplyCountLambda + API
    // - GetAllSupplyCountsLambda + API
    // - RandomImageHandlerLambda + API
    // ========================================

    // ========================================
    // Phase 3 - Step 2: User/Credentials 관련 리소스 제거 완료 (2025-10-21)
    // CommonStack으로 이동됨:
    // - GetUserProfileLambda + API
    // - LinkAccountLambda + API
    // - WalletApiLambda + API
    // - GetAwsCredentialsLambda + API
    // ========================================

    // UserProfiles 테이블은 Leaderboard에서도 사용하므로 유지
    this.userProfilesTable = dynamodb.Table.fromTableName(this, "UserProfilesTable", "UserProfiles");
    const userIdentityMapTable = dynamodb.Table.fromTableName(this, "UserIdentityMapTable", "UserIdentityMap");

    // ========================================
    // Phase 3 - Step 3: Price API 관련 리소스 제거 완료 (2025-10-21)
    // CommonStack으로 이동됨:
    // - UpdateBackupPricesLambda
    // - PriceApiLambda + PriceApiGateway
    // - PriceUpdaterLambda
    // - PriceUpdateRule (EventBridge)
    //
    // ⚠️ 중요: MonitoringStack이 CommonStack의 priceApiGateway와 priceUpdaterLambda를 참조하도록 변경됨
    // ========================================

    // Create leaderboard data table with proper schema
    const leaderboardTable = new dynamodb.Table(this, "LeaderboardDataTable", {
      tableName: "nasun-leaderboard-data",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // 🆕 GSI for querying bookmark/retweet bonuses by date
    leaderboardTable.addGlobalSecondaryIndex({
      indexName: "gsi1pk-gsi1sk-index",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying top users by score
    leaderboardTable.addGlobalSecondaryIndex({
      indexName: "total-score-index",
      partitionKey: { name: "leaderboardIdentifier", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "totalScore", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 🆕 GSI for username search (Phase 1: User Rank Search)
    leaderboardTable.addGlobalSecondaryIndex({
      indexName: "username-period-index",
      partitionKey: { name: "username", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "period", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.cumulativeLeaderboardTable = leaderboardTable;

    const engagementTable = dynamodb.Table.fromTableName(this, "EngagementTable", "nasun-leaderboard-engagement");

    const apiReadOnlyRole = new iam.Role(this, "ApiReadOnlyRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
    });
    engagementTable.grantReadData(apiReadOnlyRole);

    const dataProcessorRole = new iam.Role(this, "DataProcessorRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
    });



    this.cumulativeScoreCalculatorFunction = new lambda.Function(this, "CumulativeScoreCalculatorFunction", {
      functionName: "nasun-score-calculator",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/cumulative-score-calculator.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(10),
      memorySize: 256,
      description: `Forced update at ${new Date().toISOString()}`,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        EXCLUDED_USERNAMES: process.env.EXCLUDED_USERNAMES || "",
        EXCLUDED_USER_IDS: process.env.EXCLUDED_USER_IDS || "",
        ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon",
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
        TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
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
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "2025-10-19",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "2025-11-18",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "2025-11-19",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "2025-12-10",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "2025-12-11",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "2025-12-30",
        LEADERBOARD_DATA_TTL_DAYS: process.env.LEADERBOARD_DATA_TTL_DAYS || "365",
        MENTION_TTL_DAYS: process.env.MENTION_TTL_DAYS || "365",
        REPLY_COUNTER_TTL_DAYS: process.env.REPLY_COUNTER_TTL_DAYS || "365",
        RECENT_ACTIVITY_TTL_DAYS: process.env.RECENT_ACTIVITY_TTL_DAYS || "365",
        DAILY_SNAPSHOT_TTL_DAYS: process.env.DAILY_SNAPSHOT_TTL_DAYS || "365",
        PROFILE_CACHE_TTL_DAYS: process.env.PROFILE_CACHE_TTL_DAYS || "7",

        // 📊 인게이지먼트 점수 가중치 (명시적 설정)
        SCORE_WEIGHT_LIKES: process.env.SCORE_WEIGHT_LIKES || "0.2",
        SCORE_WEIGHT_REPLIES: process.env.SCORE_WEIGHT_REPLIES || "0.4",
        SCORE_WEIGHT_REPOSTS: process.env.SCORE_WEIGHT_REPOSTS || "0.4",
        SCORE_WEIGHT_QUOTES: process.env.SCORE_WEIGHT_QUOTES || "0.6",
        SCORE_WEIGHT_MENTIONS: process.env.SCORE_WEIGHT_MENTIONS || "0.5"
      },
      logGroup: new logs.LogGroup(this, "CumulativeScoreCalculatorFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-score-calculator", removalPolicy: cdk.RemovalPolicy.DESTROY }),
    });

    // Grant Secrets Manager access
    this.cumulativeScoreCalculatorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: ['arn:aws:secretsmanager:ap-northeast-2:*:secret:nasun-twitter-tokens-*']
    }));

    this.cumulativeLeaderboardGeneratorFunction = new lambda.Function(this, "CumulativeLeaderboardGeneratorFunction", {
      functionName: "nasun-leaderboard-generator",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/cumulative-leaderboard-generator.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        USER_IDENTITY_MAP_TABLE: userIdentityMapTable.tableName,
        SYSTEM_VERSION: "1.0",
        EXCLUDED_USERNAMES: process.env.EXCLUDED_USERNAMES || "",
        EXCLUDED_USER_IDS: process.env.EXCLUDED_USER_IDS || "",
        ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "2025-10-19",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "2025-11-18",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "2025-11-19",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "2025-12-10",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "2025-12-11",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "2025-12-30",
        ACTIVE_DAYS_PERIOD: process.env.ACTIVE_DAYS_PERIOD || "60",
        ACTIVE_DAYS_WEIGHT: process.env.ACTIVE_DAYS_WEIGHT || "0.1",
        ACTIVE_DAYS_MIN_ACTIVITIES: process.env.ACTIVE_DAYS_MIN_ACTIVITIES || "1",
        ENABLE_ACTIVE_DAYS_TIE_BREAKER: process.env.ENABLE_ACTIVE_DAYS_TIE_BREAKER || "true",
        // 🆕 Activity Bonus (Threshold=3)
        ACTIVITY_BONUS_ENABLED: process.env.ACTIVITY_BONUS_ENABLED || "true",
        ACTIVITY_BONUS_WEIGHT_PER_DAY: process.env.ACTIVITY_BONUS_WEIGHT_PER_DAY || "0.28",
        ACTIVITY_BONUS_THRESHOLD_DAYS: process.env.ACTIVITY_BONUS_THRESHOLD_DAYS || "3",
        ACTIVITY_BONUS_PERIOD_DAYS: process.env.ACTIVITY_BONUS_PERIOD_DAYS || "7",
        // 🆕 Inactivity Penalty
        INACTIVITY_PENALTY_ENABLED: process.env.INACTIVITY_PENALTY_ENABLED || "true",
        INACTIVITY_PENALTY_THRESHOLD: process.env.INACTIVITY_PENALTY_THRESHOLD || "3",
        INACTIVITY_PENALTY_PER_DAY: process.env.INACTIVITY_PENALTY_PER_DAY || "0.3",
        INACTIVITY_PENALTY_MAX: process.env.INACTIVITY_PENALTY_MAX || "5.0",
        COMMUNITY_WEIGHT_ENABLED: process.env.COMMUNITY_WEIGHT_ENABLED || "true",
        SCORE_WEIGHT_LIKES: process.env.SCORE_WEIGHT_LIKES || "0.2",
        SCORE_WEIGHT_REPLIES: process.env.SCORE_WEIGHT_REPLIES || "0.4",
        SCORE_WEIGHT_REPOSTS: process.env.SCORE_WEIGHT_REPOSTS || "0.4",
        SCORE_WEIGHT_QUOTES: process.env.SCORE_WEIGHT_QUOTES || "0.6",
        SCORE_WEIGHT_MENTIONS: process.env.SCORE_WEIGHT_MENTIONS || "0.5",
        // 🔥 CRITICAL FIX: Twitter API 인증 환경 변수 추가 (프로필 복구용)
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true",
        // TTL 설정
        LEADERBOARD_DATA_TTL_DAYS: process.env.LEADERBOARD_DATA_TTL_DAYS || "365",
        MENTION_TTL_DAYS: process.env.MENTION_TTL_DAYS || "365",
        REPLY_COUNTER_TTL_DAYS: process.env.REPLY_COUNTER_TTL_DAYS || "365",
        RECENT_ACTIVITY_TTL_DAYS: process.env.RECENT_ACTIVITY_TTL_DAYS || "7",
        DAILY_SNAPSHOT_TTL_DAYS: process.env.DAILY_SNAPSHOT_TTL_DAYS || "365",
        PROFILE_CACHE_TTL_DAYS: process.env.PROFILE_CACHE_TTL_DAYS || "7",
        // 🚀 API Gateway 캐시 무효화 설정
        API_GATEWAY_ID: process.env.API_GATEWAY_ID || "",
        API_GATEWAY_STAGE: process.env.API_GATEWAY_STAGE || "prod"
      },
      logGroup: new logs.LogGroup(this, "CumulativeLeaderboardGeneratorFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-leaderboard-generator", removalPolicy: cdk.RemovalPolicy.DESTROY }),
    });


    // ===========================================
    // Step Functions Pipeline Lambda Functions 
    // ===========================================

    // SNS Topic for failure notifications
    this.dataCollectionTopic = new sns.Topic(this, "DataCollectionTopic", {
      topicName: "nasun-data-collection-alerts",
      displayName: "NASUN Data Collection Alerts"
    });

    // Phase 1: Get Target Tweets Lambda Function
    this.getTargetTweetsFunction = new lambda.Function(this, "GetTargetTweetsFunction", {
      functionName: "nasun-get-target-tweets",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/get-target-tweets.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        SYSTEM_START_DATE: process.env.SYSTEM_START_DATE || "2025-09-02",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true",
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens"
      },
      logGroup: new logs.LogGroup(this, "GetTargetTweetsFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-get-target-tweets", removalPolicy: cdk.RemovalPolicy.DESTROY }),
    });

    // Phase 2B: Collect Mentions Lambda Function (새로운 멘션 수집 함수)
    this.collectMentionsFunction = new lambda.Function(this, "CollectMentionsFunction", {
      functionName: "nasun-collect-mentions",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-mentions.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
        SYSTEM_VERSION: "1.0",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true",
        MENTION_TTL_DAYS: process.env.MENTION_TTL_DAYS || "365",
        REPLY_COUNTER_TTL_DAYS: process.env.REPLY_COUNTER_TTL_DAYS || "365",
        EAGER_USER_VIEW_SAVE: "true" // 하이브리드 저장 전략: 초기 운영은 안전성 우선
      },
      logGroup: new logs.LogGroup(this, "CollectMentionsFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-collect-mentions", removalPolicy: cdk.RemovalPolicy.DESTROY }),
    });



    // Phase 3: Aggregate Results Lambda Function
    this.aggregateResultsFunction = new lambda.Function(this, "AggregateResultsFunction", {
      functionName: "nasun-aggregate-results",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/aggregate-results.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        SYSTEM_VERSION: "1.0",
        ENABLE_OAUTH_AUTHENTICATION: "false",
        FALLBACK_TO_BEARER_TOKEN: "true"
      },
      logGroup: new logs.LogGroup(this, "AggregateResultsFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-aggregate-results", removalPolicy: cdk.RemovalPolicy.DESTROY }),
    });

    // Dead Letter: Handle Failure Lambda Function
    this.handleFailureFunction = new lambda.Function(this, "HandleFailureFunction", {
      functionName: "nasun-handle-failure",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/handle-failure.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SNS_TOPIC_ARN: this.dataCollectionTopic.topicArn,
        SYSTEM_VERSION: "1.0"
      },
      logGroup: new logs.LogGroup(this, "HandleFailureFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-handle-failure", removalPolicy: cdk.RemovalPolicy.DESTROY }),
    });

    this.cumulativeLeaderboardTable.grantReadWriteData(this.cumulativeScoreCalculatorFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.cumulativeLeaderboardGeneratorFunction);
    // 🆕 UserIdentityMap 테이블 읽기 권한 부여 (등록 회원 뱃지 기능)
    userIdentityMapTable.grantReadData(this.cumulativeLeaderboardGeneratorFunction);

    // 🔧 UserProfiles 테이블 스캔 권한 추가 (프로필 복구용)
    this.cumulativeLeaderboardGeneratorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Scan'],
      resources: ['arn:aws:dynamodb:ap-northeast-2:135808943968:table/UserProfiles']
    }));

    // Step Functions Lambda permissions
    this.cumulativeLeaderboardTable.grantReadWriteData(this.getTargetTweetsFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.collectMentionsFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.aggregateResultsFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.handleFailureFunction);

    // Step Functions Lambda secret permissions are now managed in AuthStack.

    // SNS publish permissions for failure handler
    this.dataCollectionTopic.grantPublish(this.handleFailureFunction);

    const cloudWatchMetricsPolicy = new iam.PolicyStatement({ effect: iam.Effect.ALLOW, actions: ['cloudwatch:PutMetricData'], resources: ['*'] });
    this.cumulativeScoreCalculatorFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.cumulativeLeaderboardGeneratorFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // 🚀 API Gateway 캐시 무효화 권한 추가 (리더보드 생성 완료 후 자동 캐시 플러시)
    this.cumulativeLeaderboardGeneratorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['apigateway:FlushStageCache', 'apigateway:DELETE'],
      resources: ['*'], // API Gateway의 특정 Stage ARN을 지정할 수도 있음
    }));

    // Step Functions Lambda CloudWatch permissions
    this.getTargetTweetsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.collectMentionsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.aggregateResultsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.handleFailureFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    this.cumulativeScoreCalculatorFunction.addToRolePolicy(new iam.PolicyStatement({ effect: iam.Effect.ALLOW, actions: ['lambda:InvokeFunction'], resources: [this.cumulativeLeaderboardGeneratorFunction.functionArn] }));

    this.getCumulativeLeaderboardFunction = new lambda.Function(this, "GetCumulativeLeaderboardFunction", {
      functionName: "nasun-get-leaderboard",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-cumulative-leaderboard.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: { CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName, SYSTEM_VERSION: "1.0", EXCLUDED_USERNAMES: process.env.EXCLUDED_USERNAMES || "", EXCLUDED_USER_IDS: process.env.EXCLUDED_USER_IDS || "", ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon", EVENT1_START_DATE: process.env.EVENT1_START_DATE || "", EVENT1_END_DATE: process.env.EVENT1_END_DATE || "", EVENT2_START_DATE: process.env.EVENT2_START_DATE || "", EVENT2_END_DATE: process.env.EVENT2_END_DATE || "", EVENT3_START_DATE: process.env.EVENT3_START_DATE || "", EVENT3_END_DATE: process.env.EVENT3_END_DATE || "", LEADERBOARD_DATA_TTL_DAYS: process.env.LEADERBOARD_DATA_TTL_DAYS || "365", MENTION_TTL_DAYS: process.env.MENTION_TTL_DAYS || "365", REPLY_COUNTER_TTL_DAYS: process.env.REPLY_COUNTER_TTL_DAYS || "365", RECENT_ACTIVITY_TTL_DAYS: process.env.RECENT_ACTIVITY_TTL_DAYS || "7", DAILY_SNAPSHOT_TTL_DAYS: process.env.DAILY_SNAPSHOT_TTL_DAYS || "365", PROFILE_CACHE_TTL_DAYS: process.env.PROFILE_CACHE_TTL_DAYS || "7" },
      logGroup: new logs.LogGroup(this, "GetCumulativeLeaderboardFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-get-leaderboard", removalPolicy: cdk.RemovalPolicy.DESTROY }),
      role: apiReadOnlyRole
    });

    this.getBookmarkStatsFunction = new lambda.Function(this, "GetBookmarkStatsFunction", {
      functionName: "nasun-get-bookmark-stats",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-bookmark-stats.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: { CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName, SYSTEM_VERSION: "1.0", EXCLUDED_USERNAMES: process.env.EXCLUDED_USERNAMES || "", EXCLUDED_USER_IDS: process.env.EXCLUDED_USER_IDS || "", ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon" },
      logGroup: new logs.LogGroup(this, "GetBookmarkStatsFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-get-bookmark-stats", removalPolicy: cdk.RemovalPolicy.DESTROY }),
      role: apiReadOnlyRole
    });

    this.getExcludedAccountsStatusFunction = new lambda.Function(this, "GetExcludedAccountsStatusFunction", {
      functionName: "nasun-get-excluded-accounts-status",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/excluded-accounts-status.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: { CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName, SYSTEM_VERSION: "1.0", EXCLUDED_USERNAMES: process.env.EXCLUDED_USERNAMES || "", EXCLUDED_USER_IDS: process.env.EXCLUDED_USER_IDS || "", ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon" },
      logGroup: new logs.LogGroup(this, "GetExcludedAccountsStatusFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-get-excluded-accounts-status", removalPolicy: cdk.RemovalPolicy.DESTROY }),
      role: apiReadOnlyRole
    });

    this.getLeaderboardSnapshotFunction = new lambda.Function(this, "GetLeaderboardSnapshotFunction", {
      functionName: "nasun-get-leaderboard-snapshot",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-leaderboard-snapshot.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: { CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName, SYSTEM_VERSION: "1.0", ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon", EVENT1_START_DATE: process.env.EVENT1_START_DATE || "", EVENT1_END_DATE: process.env.EVENT1_END_DATE || "", EVENT2_START_DATE: process.env.EVENT2_START_DATE || "", EVENT2_END_DATE: process.env.EVENT2_END_DATE || "", EVENT3_START_DATE: process.env.EVENT3_START_DATE || "", EVENT3_END_DATE: process.env.EVENT3_END_DATE || "" },
      logGroup: new logs.LogGroup(this, "GetLeaderboardSnapshotFunctionLogGroup", { logGroupName: "/aws/lambda/nasun-get-leaderboard-snapshot", removalPolicy: cdk.RemovalPolicy.DESTROY }),
      role: apiReadOnlyRole
    });

    // 🆕 Phase 1: User Rank Search Lambda Functions
    this.getUserRankFunction = new lambda.Function(this, "GetUserRankFunction", {
      functionName: "nasun-get-user-rank",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-user-rank.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
      },
      logGroup: new logs.LogGroup(this, "GetUserRankFunctionLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-user-rank",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole
    });

    this.searchUsersFunction = new lambda.Function(this, "SearchUsersFunction", {
      functionName: "nasun-search-users",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/search-users.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
      },
      logGroup: new logs.LogGroup(this, "SearchUsersFunctionLogGroup", {
        logGroupName: "/aws/lambda/nasun-search-users",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole
    });

    // 🆕 Phase 3: Autocomplete Function
    this.autocompleteFunction = new lambda.Function(this, "AutocompleteFunction", {
      functionName: "nasun-autocomplete",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-autocomplete.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
      },
      logGroup: new logs.LogGroup(this, "AutocompleteFunctionLogGroup", {
        logGroupName: "/aws/lambda/nasun-autocomplete",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole
    });

    // 🆕 Phase 3: Rank Changes Function
    this.rankChangesFunction = new lambda.Function(this, "RankChangesFunction", {
      functionName: "nasun-rank-changes",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-rank-changes.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
      },
      logGroup: new logs.LogGroup(this, "RankChangesFunctionLogGroup", {
        logGroupName: "/aws/lambda/nasun-rank-changes",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole
    });

    // 🆕 My Account Rank History Function
    this.getUserRankHistoryFunction = new lambda.Function(this, "GetUserRankHistoryFunction", {
      functionName: "nasun-get-user-rank-history",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-user-rank-history.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
      },
      logGroup: new logs.LogGroup(this, "GetUserRankHistoryFunctionLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-user-rank-history",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole
    });

    // 🆕 Top Climbers Spotlight Function
    this.getTopClimbersFunction = new lambda.Function(this, "GetTopClimbersFunction", {
      functionName: "nasun-get-top-climbers",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-top-climbers.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
      },
      logGroup: new logs.LogGroup(this, "GetTopClimbersFunctionLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-top-climbers",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole
    });

    // 🆕 Leaderboard Dynamic Config Function
    const getLeaderboardConfigFunction = new lambda.Function(this, "GetLeaderboardConfigFunction", {
      functionName: "nasun-get-leaderboard-config",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "api/get-leaderboard-config.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "1.0",
        VISIBLE_LEADERBOARDS: process.env.VISIBLE_LEADERBOARDS || "CUMULATIVE,EVENT1,EVENT2,EVENT3",
        EVENT1_START_DATE: process.env.EVENT1_START_DATE || "",
        EVENT1_END_DATE: process.env.EVENT1_END_DATE || "",
        EVENT2_START_DATE: process.env.EVENT2_START_DATE || "",
        EVENT2_END_DATE: process.env.EVENT2_END_DATE || "",
        EVENT3_START_DATE: process.env.EVENT3_START_DATE || "",
        EVENT3_END_DATE: process.env.EVENT3_END_DATE || "",
      },
      logGroup: new logs.LogGroup(this, "GetLeaderboardConfigFunctionLogGroup", {
        logGroupName: "/aws/lambda/nasun-get-leaderboard-config",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      role: apiReadOnlyRole
    });

    this.cumulativeLeaderboardTable.grantReadData(this.getCumulativeLeaderboardFunction);
    this.cumulativeLeaderboardTable.grantReadData(this.getBookmarkStatsFunction);
    this.cumulativeLeaderboardTable.grantReadData(this.getExcludedAccountsStatusFunction);
    this.cumulativeLeaderboardTable.grantReadData(this.getLeaderboardSnapshotFunction);

    // 🆕 Phase 1: Grant read permissions to new Lambda functions
    this.cumulativeLeaderboardTable.grantReadData(this.getUserRankFunction);
    this.cumulativeLeaderboardTable.grantReadData(this.searchUsersFunction);

    // 🆕 Phase 3: Grant read permissions to autocomplete function
    this.cumulativeLeaderboardTable.grantReadData(this.autocompleteFunction);

    // 🆕 Phase 3: Grant read permissions to rank changes function
    this.cumulativeLeaderboardTable.grantReadData(this.rankChangesFunction);

    // 🆕 My Account Rank History: Grant read permissions to getUserRankHistoryFunction
    this.cumulativeLeaderboardTable.grantReadData(this.getUserRankHistoryFunction);

    // 🆕 Top Climbers Spotlight: Grant read permissions to getTopClimbersFunction
    this.cumulativeLeaderboardTable.grantReadData(this.getTopClimbersFunction);

    // 🆕 Leaderboard Dynamic Config: Grant read permissions
    this.cumulativeLeaderboardTable.grantReadData(getLeaderboardConfigFunction);

    this.getCumulativeLeaderboardFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.getBookmarkStatsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.getExcludedAccountsStatusFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.getLeaderboardSnapshotFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // 🆕 Phase 1: Grant CloudWatch permissions to new Lambda functions
    this.getUserRankFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    this.searchUsersFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // 🆕 Phase 3: Grant CloudWatch permissions to autocomplete function
    this.autocompleteFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // 🆕 Phase 3: Grant CloudWatch permissions to rank changes function
    this.rankChangesFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // 🆕 My Account Rank History: Grant CloudWatch permissions to getUserRankHistoryFunction
    this.getUserRankHistoryFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // 🆕 Top Climbers Spotlight: Grant CloudWatch permissions to getTopClimbersFunction
    this.getTopClimbersFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // 🆕 Leaderboard Dynamic Config: Grant CloudWatch permissions
    getLeaderboardConfigFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // API Gateway 캐시 설정 (환경별 분기)
    const apiGatewayCacheEnabled = process.env.API_GATEWAY_CACHE_ENABLED === 'true';
    console.log(`📊 [CDK] API Gateway Cache: ${apiGatewayCacheEnabled ? 'ENABLED' : 'DISABLED'}`);

    this.nasunApi = new apigw.RestApi(this, "NasunApi", {
      restApiName: "NASUN API Gateway",
      description: "NASUN API Gateway for X Leaderboard system",
      deployOptions: {
        stageName: 'prod',
        // API Gateway Caching (Stage 4) - 환경별 분기
        cachingEnabled: apiGatewayCacheEnabled,
        cacheClusterEnabled: apiGatewayCacheEnabled,
        cacheClusterSize: apiGatewayCacheEnabled ? '1.6' : undefined,  // 1.6 GB (월 $54.36)
        cacheTtl: apiGatewayCacheEnabled ? cdk.Duration.minutes(30) : undefined,  // 기본 TTL 30분
        cacheDataEncrypted: apiGatewayCacheEnabled ? true : undefined,  // 캐시 암호화
        // 추가 최적화
        throttlingBurstLimit: 2000,
        throttlingRateLimit: 1000,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ["http://localhost:5174", "https://nasun.io", "https://staging.nasun.io"],
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "X-Amz-Security-Token"],
      },
    });

    const apiRoot = this.nasunApi.root.addResource("api");
    const apiKey = this.nasunApi.addApiKey("NasunApiKey", { apiKeyName: "nasun-api-key", description: "NASUN API Key" });
    const usagePlan = this.nasunApi.addUsagePlan("NasunUsagePlan", { name: "NASUN API Usage Plan", throttle: { rateLimit: 1000, burstLimit: 2000 }, quota: { limit: 10000, period: apigw.Period.DAY } });
    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: this.nasunApi.deploymentStage });

    // Clean API structure: /api/leaderboard/cumulative
    const leaderboardResource = apiRoot.addResource("leaderboard");
    const cumulativeResource = leaderboardResource.addResource("cumulative");
    cumulativeResource.addMethod("GET", new apigw.LambdaIntegration(this.getCumulativeLeaderboardFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.querystring.period',
        'method.request.querystring.page',
        'method.request.querystring.limit',
        'method.request.querystring.date'
      ]
    }), { apiKeyRequired: false, requestParameters: { 'method.request.querystring.page': false, 'method.request.querystring.limit': false, 'method.request.querystring.period': false, 'method.request.querystring.date': false }, methodResponses: [{ statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }] });

    const bookmarkStatsResource = cumulativeResource.addResource("bookmark-stats");
    bookmarkStatsResource.addMethod("GET", new apigw.LambdaIntegration(this.getBookmarkStatsFunction), { apiKeyRequired: false, requestParameters: { 'method.request.querystring.period': false, 'method.request.querystring.includeTopUsers': false, 'method.request.querystring.topUsersLimit': false }, methodResponses: [{ statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }] });

    const excludedAccountsStatusResource = cumulativeResource.addResource("excluded-accounts-status");
    excludedAccountsStatusResource.addMethod("GET", new apigw.LambdaIntegration(this.getExcludedAccountsStatusFunction), { apiKeyRequired: false, methodResponses: [{ statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }] });

    const snapshotsResource = cumulativeResource.addResource("snapshots");
    const dateResource = snapshotsResource.addResource("{date}");
    dateResource.addMethod("GET", new apigw.LambdaIntegration(this.getLeaderboardSnapshotFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.date',
        'method.request.querystring.page',
        'method.request.querystring.limit'
      ]
    }), { apiKeyRequired: false, requestParameters: { 'method.request.path.date': true, 'method.request.querystring.page': false, 'method.request.querystring.limit': false }, methodResponses: [{ statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "404", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }] });

    // Event1 snapshots API: /api/leaderboard/event1/snapshots/{date}
    const event1Resource = leaderboardResource.addResource("event1");
    const event1SnapshotsResource = event1Resource.addResource("snapshots");
    const event1DateResource = event1SnapshotsResource.addResource("{date}");
    event1DateResource.addMethod("GET", new apigw.LambdaIntegration(this.getLeaderboardSnapshotFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.date',
        'method.request.querystring.page',
        'method.request.querystring.limit'
      ]
    }), { apiKeyRequired: false, requestParameters: { 'method.request.path.date': true, 'method.request.querystring.page': false, 'method.request.querystring.limit': false }, methodResponses: [{ statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "404", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }] });

    // Event2 snapshots API: /api/leaderboard/event2/snapshots/{date}
    const event2Resource = leaderboardResource.addResource("event2");
    const event2SnapshotsResource = event2Resource.addResource("snapshots");
    const event2DateResource = event2SnapshotsResource.addResource("{date}");
    event2DateResource.addMethod("GET", new apigw.LambdaIntegration(this.getLeaderboardSnapshotFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.date',
        'method.request.querystring.page',
        'method.request.querystring.limit'
      ]
    }), { apiKeyRequired: false, requestParameters: { 'method.request.path.date': true, 'method.request.querystring.page': false, 'method.request.querystring.limit': false }, methodResponses: [{ statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "404", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }, { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }] });

    // 🆕 Phase 1: User Rank Search API Endpoints
    // GET /api/leaderboard/{period}/user/{username}?date=YYYY-MM-DD (옵션)
    const periodResource = leaderboardResource.addResource("{period}");
    const userResource = periodResource.addResource("user");
    const usernameResource = userResource.addResource("{username}");
    usernameResource.addMethod("GET", new apigw.LambdaIntegration(this.getUserRankFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.period',
        'method.request.path.username',
        'method.request.querystring.date'
      ]
    }), {
      apiKeyRequired: false,
      requestParameters: {
        'method.request.path.period': true,
        'method.request.path.username': true,
        'method.request.querystring.date': false
      },
      methodResponses: [
        { statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "404", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }
      ]
    });

    // 🆕 My Account Rank History API Endpoint
    // GET /api/leaderboard/{period}/user/{username}/history?days=7
    const historyResource = usernameResource.addResource("history");
    historyResource.addMethod("GET", new apigw.LambdaIntegration(this.getUserRankHistoryFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.period',
        'method.request.path.username',
        'method.request.querystring.days'
      ]
    }), {
      apiKeyRequired: false,
      requestParameters: {
        'method.request.path.period': true,
        'method.request.path.username': true,
        'method.request.querystring.days': false
      },
      methodResponses: [
        { statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "404", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }
      ]
    });

    // GET /api/leaderboard/{period}/search?q=query&date=YYYY-MM-DD (옵션)&limit=10 (옵션)
    const searchResource = periodResource.addResource("search");
    searchResource.addMethod("GET", new apigw.LambdaIntegration(this.searchUsersFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.period',
        'method.request.querystring.q',
        'method.request.querystring.query',
        'method.request.querystring.date',
        'method.request.querystring.limit'
      ]
    }), {
      apiKeyRequired: false,
      requestParameters: {
        'method.request.path.period': true,
        'method.request.querystring.q': false,
        'method.request.querystring.query': false,
        'method.request.querystring.date': false,
        'method.request.querystring.limit': false
      },
      methodResponses: [
        { statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }
      ]
    });

    // 🆕 Phase 3: GET /api/leaderboard/{period}/autocomplete?q=query&limit=10 (옵션)
    const autocompleteResource = periodResource.addResource("autocomplete");
    autocompleteResource.addMethod("GET", new apigw.LambdaIntegration(this.autocompleteFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.period',
        'method.request.querystring.q',
        'method.request.querystring.query',
        'method.request.querystring.limit'
      ]
    }), {
      apiKeyRequired: false,
      requestParameters: {
        'method.request.path.period': true,
        'method.request.querystring.q': false,
        'method.request.querystring.query': false,
        'method.request.querystring.limit': false
      },
      methodResponses: [
        { statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }
      ]
    });

    // 🆕 Top Climbers Spotlight: GET /api/leaderboard/{period}/top-climbers?timeRange={timeRange}&limit={limit}
    const topClimbersResource = periodResource.addResource("top-climbers");
    topClimbersResource.addMethod("GET", new apigw.LambdaIntegration(this.getTopClimbersFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.period',
        'method.request.querystring.timeRange',
        'method.request.querystring.limit'
      ]
    }), {
      apiKeyRequired: false,
      requestParameters: {
        'method.request.path.period': true,
        'method.request.querystring.timeRange': false,
        'method.request.querystring.limit': false
      },
      methodResponses: [
        { statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }
      ]
    });

    // 🆕 Phase 3: GET /api/leaderboard/{period}/changes
    const changesResource = periodResource.addResource("changes");
    changesResource.addMethod("GET", new apigw.LambdaIntegration(this.rankChangesFunction, {
      proxy: true,
      cacheKeyParameters: [
        'method.request.path.period'
      ]
    }), {
      apiKeyRequired: false,
      requestParameters: {
        'method.request.path.period': true
      },
      methodResponses: [
        { statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "400", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }
      ]
    });

    // 🆕 Leaderboard Dynamic Config: GET /api/leaderboard/config
    const configResource = leaderboardResource.addResource("config");
    configResource.addMethod("GET", new apigw.LambdaIntegration(getLeaderboardConfigFunction), {
      apiKeyRequired: false,
       methodResponses: [
        { statusCode: "200", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } },
        { statusCode: "500", responseParameters: { "method.response.header.Access-Control-Allow-Origin": true, "method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true } }
      ]
    });

    const communityClassifierBatchFunction = new lambda.Function(this, "CommunityClassifierBatchFunction", {
      functionName: "nasun-community-classifier-batch",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/community-classifier-batch.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
        TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
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
        PROCESSING_TIMEOUT_MS: "840000"
      },
    });
    this.cumulativeLeaderboardTable.grantReadWriteData(communityClassifierBatchFunction);
    communityClassifierBatchFunction.addToRolePolicy(new iam.PolicyStatement({ effect: iam.Effect.ALLOW, actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: ['*'] }));
    communityClassifierBatchFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: ['arn:aws:secretsmanager:ap-northeast-2:*:secret:nasun-twitter-tokens-*']
    }));
    const communityClassificationRule = new events.Rule(this, "CommunityClassificationSchedule", { ruleName: "nasun-community-classification-weekly", schedule: events.Schedule.cron({ minute: '0', hour: '3', weekDay: 'SUN' }), description: "Weekly community classification batch processing" });
    communityClassificationRule.addTarget(new targets.LambdaFunction(communityClassifierBatchFunction));

    // ========================================
    // 뱃지 기능: 커뮤니티 멤버 동기화 Lambda
    // ========================================
    const syncCommunityMembersFunction = new lambda.Function(
      this,
      'SyncCommunityMembersFunction',
      {
        functionName: 'nasun-sync-community-members',
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset('lambda-src/sync-community-members/dist'),
        timeout: cdk.Duration.minutes(5),
        memorySize: 512,
        environment: {
          USER_PROFILES_TABLE: this.userProfilesTable.tableName,
          CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName
        },
        logGroup: new logs.LogGroup(this, 'SyncCommunityMembersLogGroup', {
          logGroupName: '/aws/lambda/nasun-sync-community-members',
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          retention: logs.RetentionDays.ONE_WEEK
        })
      }
    );

    // 권한 부여
    this.userProfilesTable.grantReadData(syncCommunityMembersFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(syncCommunityMembersFunction);

    // EventBridge 규칙 생성 (매일 KST 00:00)
    new events.Rule(this, 'SyncCommunityMembersSchedule', {
      ruleName: 'nasun-sync-community-members-daily',
      description: 'Sync community members from UserProfiles daily at midnight KST',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '15',  // UTC 15:00 = KST 00:00
      }),
      targets: [new targets.LambdaFunction(syncCommunityMembersFunction)]
    });

    // ========================================
    // 🔐 OAuth 2.0 Token Refresh System
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
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:5174/callback"
      },
    });

    // Secrets Manager 읽기/쓰기 권한 부여
    refreshOAuth2TokenFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:UpdateSecret",
        "secretsmanager:DescribeSecret",
      ],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-twitter-tokens-*`],
    }));

    // CloudWatch Logs 권한
    refreshOAuth2TokenFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*']
    }));

    // CloudWatch Metrics 권한
    refreshOAuth2TokenFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    }));

    // 🔴 Dead Letter Queue for EventBridge Rule failures
    const tokenRefreshDLQ = new sqs.Queue(this, "TokenRefreshDLQ", {
      queueName: "nasun-oauth2-token-refresh-dlq",
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout: cdk.Duration.minutes(5)
    });

    // EventBridge 스케줄: 70분마다 자동 토큰 갱신 (24/7 무중단 운영)
    // 하이브리드 전략: 70분 주기 + 만료 50분 전 갱신 = 수학적 보장 (더 넓은 안전 마진)
    // Twitter OAuth 2.0 Access Token은 2시간(120분) 유효 → 최악의 경우에도 안전
    const tokenRefreshRule = new events.Rule(this, "TokenRefreshSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(70)),  // ⭐ 70분마다 실행 (안전 마진 확보)
      description: "OAuth 2.0 token refresh every 70 minutes (mathematically guaranteed 24/7 uptime)",
      enabled: true
    });

    // ⭐ Enhanced Target with DLQ and retry logic
    tokenRefreshRule.addTarget(new targets.LambdaFunction(refreshOAuth2TokenFunction, {
      event: events.RuleTargetInput.fromObject({
        source: "eventbridge.scheduled",
        scheduledExecution: true,
        forceRefresh: false
      }),
      deadLetterQueue: tokenRefreshDLQ,  // 🔴 실패 시 DLQ로 전송
      retryAttempts: 3,                   // 🔄 최대 3회 재시도
      maxEventAge: cdk.Duration.minutes(10) // ⏰ 10분 이내 재시도
    }));

    // Export Lambda function for monitoring
    this.refreshOAuth2TokenFunction = refreshOAuth2TokenFunction;

    // ========================================
    // 📊 OAuth 토큰 갱신 모니터링 (CloudWatch Alarms)
    // ========================================

    // SNS 토픽 참조 (기존 모니터링 토픽 재사용)
    const monitoringTopic = sns.Topic.fromTopicArn(
      this,
      "MonitoringTopic",
      "arn:aws:sns:ap-northeast-2:135808943968:nasun-monitoring-alerts"
    );

    // ⚠️ 알람 1: OAuth 토큰 갱신 실패 감지
    const tokenRefreshFailureAlarm = new cloudwatch.Alarm(this, "TokenRefreshFailureAlarm", {
      alarmName: "nasun-oauth2-token-refresh-failure",
      metric: refreshOAuth2TokenFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: "Sum"
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "OAuth 2.0 token refresh failed - immediate attention required"
    });
    tokenRefreshFailureAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // ⚠️ 알람 2: 3시간 이상 토큰 갱신 없음 (EventBridge 규칙 비활성화 감지)
    // 90분 주기 × 2회 = 180분(3시간) → 안전 마진 포함
    const tokenNotRefreshedAlarm = new cloudwatch.Alarm(this, "TokenNotRefreshedAlarm", {
      alarmName: "nasun-oauth2-token-not-refreshed-3h",
      metric: refreshOAuth2TokenFunction.metricInvocations({
        period: cdk.Duration.hours(3),  // 24시간 → 3시간
        statistic: "Sum"
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: "OAuth token not refreshed for 3+ hours - check EventBridge rule (90min schedule)"
    });
    tokenNotRefreshedAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // ⚠️ 알람 3: DLQ에 메시지 도착 (EventBridge → Lambda 호출 실패 감지)
    const dlqAlarm = new cloudwatch.Alarm(this, "TokenRefreshDLQAlarm", {
      alarmName: "nasun-oauth2-dlq-not-empty",
      metric: tokenRefreshDLQ.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: "Maximum"
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "EventBridge failed to invoke token refresh Lambda - check DLQ for details"
    });
    dlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // ⚠️ 알람 4: Refresh Token 무효화 감지 (🚨 긴급)
    const invalidRefreshTokenAlarm = new cloudwatch.Alarm(this, "InvalidRefreshTokenAlarm", {
      alarmName: "nasun-oauth2-invalid-refresh-token",
      metric: new cloudwatch.Metric({
        namespace: "NASUN/OAuth",
        metricName: "InvalidRefreshToken",
        statistic: "Sum",
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "CRITICAL: Refresh Token is invalid - manual OAuth 2.0 re-authentication required immediately!"
    });
    invalidRefreshTokenAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // ⚠️ 알람 5: Secrets Manager 업데이트 실패 (긴급)
    const secretUpdateFailureAlarm = new cloudwatch.Alarm(this, "SecretUpdateFailureAlarm", {
      alarmName: "nasun-oauth2-secret-update-failure",
      metric: new cloudwatch.Metric({
        namespace: "NASUN/OAuth",
        metricName: "SecretUpdateFailure",
        statistic: "Sum",
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "CRITICAL: Secrets Manager update failed - Refresh Token may be invalidated!"
    });
    secretUpdateFailureAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // 📊 알람 6: Refresh Token Rotation 모니터링 (정보성)
    const tokenRotationAlarm = new cloudwatch.Alarm(this, "TokenRotationDetectedAlarm", {
      alarmName: "nasun-oauth2-token-rotation-detected",
      metric: new cloudwatch.Metric({
        namespace: "NASUN/OAuth",
        metricName: "RefreshTokenRotation",
        statistic: "Sum",
        period: cdk.Duration.hours(1)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "INFO: Refresh Token Rotation occurred - new token issued by Twitter API"
    });
    // Note: Rotation은 정상 동작이므로 알림 전송 안 함 (모니터링만)

    // ========================================
    // 🚀 V3 Unified Pipeline Implementation
    // ========================================

    // Phase 1: Tweet Batch Splitter Lambda Function
    this.tweetBatchSplitterFunction = new lambda.Function(this, "TweetBatchSplitterFunction", {
      functionName: "nasun-tweet-batch-splitter",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/tweet-batch-splitter.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        SYSTEM_VERSION: "v3",
        BATCH_SIZE: "5"
      },
      logGroup: new logs.LogGroup(this, "TweetBatchSplitterV3LogGroup", {
        logGroupName: "/aws/lambda/nasun-tweet-batch-splitter",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    // Phase 2: High Rate Limit Engagement Collection Functions
    this.collectLikesFunction = new lambda.Function(this, "CollectLikesFunction", {
      functionName: "nasun-collect-likes",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-likes.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        RATE_LIMIT_WINDOW_MINUTES: "15",
        RATE_LIMIT_MAX_CALLS: "5",
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
        TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_USER_ACCESS_TOKEN: process.env.OAUTH2_USER_ACCESS_TOKEN || "",
        OAUTH2_REFRESH_TOKEN: process.env.OAUTH2_REFRESH_TOKEN || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
        ENABLE_OAUTH_AUTHENTICATION: "true",
        FALLBACK_TO_BEARER_TOKEN: "true",
        ENABLE_OAUTH2_AUTHENTICATION: "true",
        // 🆕 X API 데이터 수집 제한 (2025-10-28)
        MAX_LIKES_PER_TWEET: process.env.MAX_LIKES_PER_TWEET || "500"
      },
      logGroup: new logs.LogGroup(this, "CollectLikesV3LogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-likes",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    this.collectRetweetsFunction = new lambda.Function(this, "CollectRetweetsFunction", {
      functionName: "nasun-collect-retweets",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-retweets.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        SYSTEM_VERSION: "v3",
        RATE_LIMIT_WINDOW_MINUTES: "15",
        RATE_LIMIT_MAX_CALLS: "5",
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
        TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_USER_ACCESS_TOKEN: process.env.OAUTH2_USER_ACCESS_TOKEN || "",
        OAUTH2_REFRESH_TOKEN: process.env.OAUTH2_REFRESH_TOKEN || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
        ENABLE_OAUTH_AUTHENTICATION: "true",
        FALLBACK_TO_BEARER_TOKEN: "true",
        ENABLE_OAUTH2_AUTHENTICATION: "true",
        // 🆕 X API 데이터 수집 제한 (2025-10-28)
        MAX_REPOSTS_PER_TWEET: process.env.MAX_REPOSTS_PER_TWEET || "500"
      },
      logGroup: new logs.LogGroup(this, "CollectRetweetsV3LogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-retweets",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    this.collectQuotesFunction = new lambda.Function(this, "CollectQuotesFunction", {
      functionName: "nasun-collect-quotes",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-quotes.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        RATE_LIMIT_WINDOW_MINUTES: "15",
        RATE_LIMIT_MAX_CALLS: "5",
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
        TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_USER_ACCESS_TOKEN: process.env.OAUTH2_USER_ACCESS_TOKEN || "",
        OAUTH2_REFRESH_TOKEN: process.env.OAUTH2_REFRESH_TOKEN || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
        ENABLE_OAUTH_AUTHENTICATION: "true",
        FALLBACK_TO_BEARER_TOKEN: "true",
        ENABLE_OAUTH2_AUTHENTICATION: "true"
      },
      logGroup: new logs.LogGroup(this, "CollectQuotesV3LogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-quotes",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    // Phase 2: Mention Collection Lambda Functions
    this.mentionCollectorFunction = new lambda.Function(this, "MentionCollectorFunction", {
      functionName: "nasun-collect-mentions-search",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-mentions-search.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        SYSTEM_VERSION: "v3",
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
        TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_USER_ACCESS_TOKEN: process.env.OAUTH2_USER_ACCESS_TOKEN || "",
        OAUTH2_REFRESH_TOKEN: process.env.OAUTH2_REFRESH_TOKEN || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
        ENABLE_OAUTH_AUTHENTICATION: "true",
        FALLBACK_TO_BEARER_TOKEN: "true",
        ENABLE_OAUTH2_AUTHENTICATION: "true",
        // 🆕 X API 데이터 수집 제한 (2025-10-28)
        MAX_MENTIONS_PER_DAY: process.env.MAX_MENTIONS_PER_DAY || "1000"
      },
      logGroup: new logs.LogGroup(this, "MentionCollectorV3LogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-mentions-search",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    this.mentionDetailsCollectorFunction = new lambda.Function(this, "MentionDetailsCollectorFunction", {
      functionName: "nasun-collect-mention-details",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "batch/collect-mention-details.handler",
      code: lambda.Code.fromAsset("lambda-src/x-leaderboard/dist"),
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        CUMULATIVE_TABLE_NAME: this.cumulativeLeaderboardTable.tableName,
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
        SYSTEM_VERSION: "v3",
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TARGET_USER_ID: process.env.TARGET_USER_ID || "1725466995565752320",
        TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
        TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
        TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
        TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
        TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
        OAUTH2_CLIENT_ID: process.env.OAUTH2_CLIENT_ID || "",
        OAUTH2_CLIENT_SECRET: process.env.OAUTH2_CLIENT_SECRET || "",
        OAUTH2_USER_ACCESS_TOKEN: process.env.OAUTH2_USER_ACCESS_TOKEN || "",
        OAUTH2_REFRESH_TOKEN: process.env.OAUTH2_REFRESH_TOKEN || "",
        OAUTH2_REDIRECT_URI: process.env.OAUTH2_REDIRECT_URI || "http://localhost:3000/auth/callback",
        ENABLE_OAUTH_AUTHENTICATION: "true",
        FALLBACK_TO_BEARER_TOKEN: "true",
        ENABLE_OAUTH2_AUTHENTICATION: "true"
      },
      logGroup: new logs.LogGroup(this, "MentionDetailsCollectorV3LogGroup", {
        logGroupName: "/aws/lambda/nasun-collect-mention-details",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    // Grant DynamoDB permissions to V3 functions
    this.cumulativeLeaderboardTable.grantReadWriteData(this.tweetBatchSplitterFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.collectLikesFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.collectRetweetsFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.collectQuotesFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.mentionCollectorFunction);
    this.cumulativeLeaderboardTable.grantReadWriteData(this.mentionDetailsCollectorFunction);

    // Grant CloudWatch metrics permissions to V3 functions
    const cloudWatchMetricsPolicyV3 = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    });
    this.tweetBatchSplitterFunction.addToRolePolicy(cloudWatchMetricsPolicyV3);
    this.collectLikesFunction.addToRolePolicy(cloudWatchMetricsPolicyV3);
    this.collectRetweetsFunction.addToRolePolicy(cloudWatchMetricsPolicyV3);
    this.collectQuotesFunction.addToRolePolicy(cloudWatchMetricsPolicyV3);
    this.mentionCollectorFunction.addToRolePolicy(cloudWatchMetricsPolicyV3);
    this.mentionDetailsCollectorFunction.addToRolePolicy(cloudWatchMetricsPolicyV3);

    // Grant Secrets Manager permissions to V3 functions
    const secretsAccessPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: ['arn:aws:secretsmanager:*:*:secret:nasun-twitter-tokens-*']
    });
    this.collectLikesFunction.addToRolePolicy(secretsAccessPolicy);
    this.collectRetweetsFunction.addToRolePolicy(secretsAccessPolicy);
    this.collectQuotesFunction.addToRolePolicy(secretsAccessPolicy);
    this.mentionCollectorFunction.addToRolePolicy(secretsAccessPolicy);
    this.mentionDetailsCollectorFunction.addToRolePolicy(secretsAccessPolicy);
    // 🆕 OAuth 2.0 자동 갱신을 위한 Secrets Manager 권한 추가
    this.getTargetTweetsFunction.addToRolePolicy(secretsAccessPolicy);
    this.tweetBatchSplitterFunction.addToRolePolicy(secretsAccessPolicy);

    // ========================================
    // 🚀 V3 Unified Step Functions Pipeline
    // ========================================

    // ⭐ Phase 0: OAuth 토큰 갱신 (파이프라인 시작 전 명시적 체크)
    // 만료 5분 전이면 즉시 갱신, 아니면 Skip하고 다음 단계로
    const refreshTokenTaskV3 = new stepfunctionsTasks.LambdaInvoke(this, "RefreshTokenIfNeeded", {
      lambdaFunction: refreshOAuth2TokenFunction,
      comment: "Phase 0: Refresh OAuth 2.0 token if expiring within 5 minutes",
      resultPath: "$.refreshTokenResult",
      retryOnServiceExceptions: false,
      payload: stepfunctions.TaskInput.fromObject({
        source: "stepfunctions.pipeline",
        forceRefresh: false  // 만료 5분 전일 때만 갱신
      })
    });

    // Phase 1: Get Target Tweets (reuse existing V2 function)
    const getTargetTweetsTaskV3 = new stepfunctionsTasks.LambdaInvoke(this, "GetTargetTweets", {
      lambdaFunction: this.getTargetTweetsFunction,
      comment: "Phase 1: Get target tweets for the specified date range",
      resultPath: "$.getTargetTweetsResult",
      retryOnServiceExceptions: false
    });

    // Phase 1.5: Tweet Batch Splitter
    const tweetBatchSplitterTask = new stepfunctionsTasks.LambdaInvoke(this, "TweetBatchSplitterTask", {
      lambdaFunction: this.tweetBatchSplitterFunction,
      comment: "Split tweets into batches of 5 for rate limit compliance",
      inputPath: "$.getTargetTweetsResult.Payload",
      resultPath: "$.batchSplitterResult",
      retryOnServiceExceptions: false
    });

    // Phase 2: High Rate Limit Engagement Collection Tasks
    const collectLikesTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectLikesTask", {
      lambdaFunction: this.collectLikesFunction,
      comment: "Collect likes for tweet batch (5 calls/15min limit)",
      retryOnServiceExceptions: false,
      resultPath: '$.likeResult', // 결과를 별도 경로에 저장
      payload: stepfunctions.TaskInput.fromObject({
        // 🚨 V3 Lambda 함수에 맞는 tweetBatch 형식으로 수정
        'tweetBatch.$': '$.tweetBatch',
        'targetUser.$': '$.targetUser',
        'dateRange.$': '$.dateRange',
        'collectionDate.$': '$.collectionDate'
      })
    });

    const collectRetweetsTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectRetweetsTask", {
      lambdaFunction: this.collectRetweetsFunction,
      comment: "Collect retweets for tweet batch (5 calls/15min limit)",
      retryOnServiceExceptions: false,
      resultPath: '$.retweetResult', // 결과를 별도 경로에 저장
      payload: stepfunctions.TaskInput.fromObject({
        // 🚨 V3 Lambda 함수에 맞는 tweetBatch 형식으로 수정
        'tweetBatch.$': '$.tweetBatch',
        'targetUser.$': '$.targetUser',
        'dateRange.$': '$.dateRange',
        'collectionDate.$': '$.collectionDate'
      })
    });

    const collectQuotesTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectQuotesTask", {
      lambdaFunction: this.collectQuotesFunction,
      comment: "Collect quotes for tweet batch (5 calls/15min limit)",
      retryOnServiceExceptions: false,
      resultPath: '$.quoteResult', // 결과를 별도 경로에 저장
      payload: stepfunctions.TaskInput.fromObject({
        // 🚨 V3 Lambda 함수에 맞는 tweetBatch 형식으로 수정
        'tweetBatch.$': '$.tweetBatch',
        'targetUser.$': '$.targetUser',
        'dateRange.$': '$.dateRange',
        'collectionDate.$': '$.collectionDate'
      })
    });

    // Wait states for rate limit compliance - 동적 대기 시간 (배치 개수 기반)
    // 공식: waitSeconds = ceil(900 × totalBatches / 5)
    // 1개 배치: 180초 (3분), 5개 배치: 900초 (15분)
    const waitAfterLikes = new stepfunctions.Wait(this, "WaitAfterLikes", {
      time: stepfunctions.WaitTime.secondsPath('$.tweetBatch.waitAfterLikesSeconds'),
      comment: "Dynamic wait based on batch count - Rate Limit 5 calls/15min (ceil(900*N/5) seconds)"
    });

    const waitAfterRetweets = new stepfunctions.Wait(this, "WaitAfterRetweets", {
      time: stepfunctions.WaitTime.secondsPath('$.tweetBatch.waitAfterRetweetsSeconds'),
      comment: "Dynamic wait based on batch count - Rate Limit 5 calls/15min (ceil(900*N/5) seconds)"
    });

    // Branch A: High Rate Limit Group (Sequential with 3min waits)
    const highRateLimitChain = collectLikesTask
      .addRetry({
        errors: ["NASUN.RateLimitError"],
        interval: cdk.Duration.minutes(15),
        maxAttempts: 2,
        backoffRate: 1.0
      })
      .next(waitAfterLikes)
      .next(collectRetweetsTask
        .addRetry({
          errors: ["NASUN.RateLimitError"],
          interval: cdk.Duration.minutes(15),
          maxAttempts: 2,
          backoffRate: 1.0
        })
      )
      .next(waitAfterRetweets)
      .next(collectQuotesTask
        .addRetry({
          errors: ["NASUN.RateLimitError"],
          interval: cdk.Duration.minutes(15),
          maxAttempts: 2,
          backoffRate: 1.0
        })
      );

    // Map state for processing tweet batches sequentially
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

    // Branch B: Target Bonus Group (existing functions)
    // Branch B: Mention Collection (Phase 2-1: Search mentions)
    const mentionCollectorTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectMentionsTask", {
      lambdaFunction: this.mentionCollectorFunction,
      comment: "Phase 2-1: Search for up to 100 mentions using generous 60 calls/15min API (Active 1 day ago)",
      resultPath: "$.mentionCollectorResult",
      retryOnServiceExceptions: false,
      payload: stepfunctions.TaskInput.fromObject({
        'targetUser.$': '$.getTargetTweetsResult.Payload.targetUser',
        // ⭐ V3: Active 인게이지먼트는 1일 전 범위 사용 (snapshotStrategy.active)
        'dateRange.$': '$.getTargetTweetsResult.Payload.snapshotStrategy.active',
        'collectionDate.$': '$.getTargetTweetsResult.Payload.collectionDate'
      })
    }).addRetry({
      errors: ["NASUN.RateLimitError"],
      interval: cdk.Duration.minutes(15),
      maxAttempts: 3,
      backoffRate: 1.0
    });

    // ⚠️ 주의: parallelDataCollectionV3는 더 이상 사용되지 않음
    // 대신 independentDataCollection을 사용 (Passive/Active 독립 실행)

    // Phase 2: Process Mention Batches (Map State)
    const mentionDetailsCollectorTask = new stepfunctionsTasks.LambdaInvoke(this, "CollectMentionDetailsTask", {
      lambdaFunction: this.mentionDetailsCollectorFunction,
      comment: "Phase 2-2: Collect detailed information for each mention batch",
      retryOnServiceExceptions: false,
      payload: stepfunctions.TaskInput.fromObject({
        'mentionBatch.$': '$.mentionBatch',
        'targetUser.$': '$.targetUser'
      })
    }).addRetry({
      errors: ["NASUN.RateLimitError"],
      interval: cdk.Duration.minutes(15),
      maxAttempts: 3,
      backoffRate: 1.0
    });

    const mentionBatchesMap = new stepfunctions.Map(this, "MentionBatchesMap", {
      comment: "Phase 2-2: Process mention batches sequentially (20 mentions per batch)",
      itemsPath: "$.parallelResults[1].mentionCollectorResult.Payload.mentionBatches",
      itemSelector: {
        'mentionBatch.$': '$$.Map.Item.Value',
        'targetUser.$': '$.getTargetTweetsResult.Payload.targetUser',
        'targetTweetIds.$': '$.getTargetTweetsResult.Payload.targetTweetIds'  // 🆕 타겟 트윗 ID 목록 (중복 방지용, 2025-10-26)
      },
      maxConcurrency: 1, // Sequential processing for rate limit compliance
      resultPath: "$.mentionDetailsResults"
    });
    mentionBatchesMap.itemProcessor(mentionDetailsCollectorTask);

    // Wait 5 minutes after mention details collection (for mentions found branch)
    const waitAfterMentionDetails1 = new stepfunctions.Wait(this, "WaitAfterMentionDetails1", {
      time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(5)),
      comment: "Wait 5 minutes before Phase 3 (mentions found)"
    });

    // Wait 5 minutes (for no mentions branch)
    const waitAfterMentionDetails2 = new stepfunctions.Wait(this, "WaitAfterMentionDetails2", {
      time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(5)),
      comment: "Wait 5 minutes before Phase 3 (no mentions)"
    });

    // Phase 3: Aggregate Results (mentions found branch)
    const aggregateResultsTaskV3_1 = new stepfunctionsTasks.LambdaInvoke(this, "AggregateResults_WithMentions", {
      lambdaFunction: this.aggregateResultsFunction,
      comment: "Phase 3: Aggregate all parallel collection results",
      inputPath: "$",
      resultPath: "$.aggregationResult",
      retryOnServiceExceptions: false
    });

    // Phase 3: Aggregate Results (no mentions branch)
    const aggregateResultsTaskV3_2 = new stepfunctionsTasks.LambdaInvoke(this, "AggregateResults_NoMentions", {
      lambdaFunction: this.aggregateResultsFunction,
      comment: "Phase 3: Aggregate all parallel collection results",
      inputPath: "$",
      resultPath: "$.aggregationResult",
      retryOnServiceExceptions: false
    });

    // Error handler (reuse existing V2 function)
    const handleFailureTaskV3 = new stepfunctionsTasks.LambdaInvoke(this, "HandleFailure", {
      lambdaFunction: this.handleFailureFunction,
      comment: "Handle pipeline failures and send SNS notifications",
      retryOnServiceExceptions: false
    });

    // Phase 3: Prepare Score Calculator Input (mentions found branch)
    const prepareScoreCalculatorInputV3_1 = new stepfunctions.Pass(this, "PrepareScoreCalculatorInput_WithMentions", {
      comment: "Extract collectionDate from AggregateResults output",
      parameters: {
        "targetDate.$": "$.aggregationResult.Payload.collectionDate",
        "forceRecalculation.$": "$.forceRecalculation",
        "collectedEngagements.$": "$.aggregationResult.Payload.collectedEngagements"
      }
    });

    // Phase 3: Prepare Score Calculator Input (no mentions branch)
    const prepareScoreCalculatorInputV3_2 = new stepfunctions.Pass(this, "PrepareScoreCalculatorInput_NoMentions", {
      comment: "Extract collectionDate from AggregateResults output",
      parameters: {
        "targetDate.$": "$.aggregationResult.Payload.collectionDate",
        "forceRecalculation.$": "$.forceRecalculation",
        "collectedEngagements.$": "$.aggregationResult.Payload.collectedEngagements"
      }
    });

    // Phase 4: Score Calculator (mentions found branch)
    const scoreCalculatorTaskV3_1 = new stepfunctionsTasks.LambdaInvoke(this, "ScoreCalculator_WithMentions", {
      lambdaFunction: this.cumulativeScoreCalculatorFunction,
      comment: "Phase 4: Calculate cumulative scores from aggregated engagements",
      retryOnServiceExceptions: false,
      resultPath: "$.scoreCalculatorResult"
    });

    // Phase 4: Score Calculator (no mentions branch)
    const scoreCalculatorTaskV3_2 = new stepfunctionsTasks.LambdaInvoke(this, "ScoreCalculator_NoMentions", {
      lambdaFunction: this.cumulativeScoreCalculatorFunction,
      comment: "Phase 4: Calculate cumulative scores from aggregated engagements",
      retryOnServiceExceptions: false,
      resultPath: "$.scoreCalculatorResult"
    });

    // Phase 5: Leaderboard Generator (mentions found branch)
    const leaderboardGeneratorTaskWithMentions = new stepfunctionsTasks.LambdaInvoke(this, "LeaderboardGenerator_WithMentions", {
      lambdaFunction: this.cumulativeLeaderboardGeneratorFunction,
      comment: "Phase 5: Generate leaderboard from updated cumulative scores",
      retryOnServiceExceptions: false,
      resultPath: "$.leaderboardGeneratorResult"
    });

    // Phase 5: Leaderboard Generator (no mentions branch)
    const leaderboardGeneratorTaskNoMentions = new stepfunctionsTasks.LambdaInvoke(this, "LeaderboardGenerator_NoMentions", {
      lambdaFunction: this.cumulativeLeaderboardGeneratorFunction,
      comment: "Phase 5: Generate leaderboard from updated cumulative scores",
      retryOnServiceExceptions: false,
      resultPath: "$.leaderboardGeneratorResult"
    });

    // Wait states for GSI eventual consistency
    const waitForGsiUpdate1 = new stepfunctions.Wait(this, 'WaitForGsiUpdate1', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.seconds(10)),
      comment: 'Wait 10 seconds for GSI to become consistent before leaderboard generation.'
    });
    const waitForGsiUpdate2 = new stepfunctions.Wait(this, 'WaitForGsiUpdate2', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.seconds(10)),
      comment: 'Wait 10 seconds for GSI to become consistent before leaderboard generation.'
    });

    // Phase 2-3-4 Chain: Mention Details -> Aggregate -> Score Calculator -> Leaderboard
    const phase234Chain = mentionBatchesMap
      .next(waitAfterMentionDetails1)
      .next(aggregateResultsTaskV3_1)
      .next(prepareScoreCalculatorInputV3_1)
      .next(scoreCalculatorTaskV3_1)
      .next(waitForGsiUpdate1)
      .next(leaderboardGeneratorTaskWithMentions);

    const noMentionsChain = new stepfunctions.Pass(this, "NoMentionsFound", {
      comment: "No mentions found, skip mention details collection",
      resultPath: "$.mentionDetailsResults"
    })
      .next(waitAfterMentionDetails2)
      .next(aggregateResultsTaskV3_2)
      .next(prepareScoreCalculatorInputV3_2)
      .next(scoreCalculatorTaskV3_2)
      .next(waitForGsiUpdate2)
      .next(leaderboardGeneratorTaskNoMentions);

    // Phase 2: Check if mentions found
    // Parallel branch structure: [0] batchProcessingMap, [1] mentionCollectorTask
    const checkMentionsChoice = new stepfunctions.Choice(this, "CheckMentionsFound")
      .when(
        stepfunctions.Condition.isPresent("$.parallelResults[1].mentionCollectorResult.Payload.mentionBatches[0]"),
        phase234Chain
      )
      .otherwise(noMentionsChain);

    // ⭐ V3: Passive Branch - Conditional Batch Processing
    // Passive 트윗이 있을 때만 Batch Processing 실행
    const passiveBatchProcessingChoice = new stepfunctions.Choice(this, "CheckTweetsFound")
      .when(
        stepfunctions.Condition.isPresent("$.getTargetTweetsResult.Payload.tweets[0]"),
        batchProcessingMap
          .addCatch(handleFailureTaskV3, {
            errors: ["States.ALL"],
            resultPath: "$.error"
          })
      )
      .otherwise(
        new stepfunctions.Pass(this, "SkipPassiveCollection", {
          comment: "No Passive tweets found, skip batch processing (Likes/Quotes/Retweets)",
          resultPath: "$.batchProcessingResult"
        })
      );

    // ⭐ V3: Parallel Execution - Passive와 Active 독립 실행
    // Branch A: Passive 인게이지먼트 (조건부)
    // Branch B: Active 인게이지먼트 (항상 실행)
    const independentDataCollection = new stepfunctions.Parallel(this, "IndependentDataCollection", {
      comment: "Execute Passive and Active data collection independently",
      resultPath: "$.parallelResults"
    });
    independentDataCollection.branch(passiveBatchProcessingChoice);
    independentDataCollection.branch(mentionCollectorTask);

    // ⭐ V3 Pipeline Definition: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4
    // Phase 0에서 토큰 갱신 체크, Phase 1부터 데이터 수집 시작
    const originalChain = refreshTokenTaskV3
      .addRetry({
        errors: ["States.ALL"],
        interval: cdk.Duration.seconds(10),
        maxAttempts: 2,
        backoffRate: 2.0
      })
      .next(getTargetTweetsTaskV3
        .addRetry({
          errors: ["States.ALL"],
          interval: cdk.Duration.seconds(30),
          maxAttempts: 2,
          backoffRate: 2.0
        })
      )
      .next(tweetBatchSplitterTask)
      .next(independentDataCollection)
      .next(checkMentionsChoice);

    // Fallback 로직 추가: 입력값에 forceRecalculation이 없는 경우를 대비
    const injectDefaultForceRecalculation = new stepfunctions.Pass(this, 'InjectDefaultForceRecalculation', {
      result: stepfunctions.Result.fromBoolean(false),
      resultPath: '$.forceRecalculation',
      comment: 'Injects default value for forceRecalculation if missing from input.'
    });

    const checkForceRecalculation = new stepfunctions.Choice(this, 'CheckForceRecalculationInput', {
      comment: 'Check if forceRecalculation is provided in the input.'
    });

    const v3Definition = checkForceRecalculation
      .when(
        stepfunctions.Condition.isPresent('$.forceRecalculation'),
        originalChain
      )
      .otherwise(
        injectDefaultForceRecalculation.next(originalChain)
      );

    // Create V3 Pipeline with Score Calculator and Leaderboard Generator Integration
    this.leaderboardDataPipeline = new stepfunctions.StateMachine(this, "UnifiedPipelineWithScoring", {
      stateMachineName: "nasun-leaderboard-pipeline",
      definitionBody: stepfunctions.DefinitionBody.fromChainable(v3Definition),
      timeout: cdk.Duration.hours(6),  // Increased from 3h to 6h for batch processing with 15min waits
      comment: "NASUN Complete Pipeline: Data Collection → Score Calculation → Leaderboard Generation",
      logs: {
        destination: new logs.LogGroup(this, "V3PipelineWithScoringLogGroup", {
          logGroupName: "/aws/stepfunctions/nasun-leaderboard-pipeline-v3",
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true
      }
    });

    // ========================================
    // 🕒 V3 Pipeline EventBridge Automation
    // ========================================

    // V3 Daily Data Collection Schedule (Every day at 9:00 AM KST)
    const dailyDataCollectionRuleV3 = new events.Rule(this, "DailyDataCollectionRuleV3", {
      ruleName: "nasun-daily-data-collection",
      description: "V3 Pipeline: Trigger daily data collection at 9:00 AM KST",
      schedule: events.Schedule.cron({
        minute: "10", // 00:10 UTC = 09:10 AM KST
        hour: "0",
        day: "*",
        month: "*",
        year: "*"
      }),
      enabled: true // ✅ 즉시 활성화
    });

    // V3 State Machine을 타겟으로 설정
    dailyDataCollectionRuleV3.addTarget(new targets.SfnStateMachine(this.leaderboardDataPipeline, {
      input: events.RuleTargetInput.fromObject({
        targetDate: events.EventField.time, // ISO 8601 타임스탬프
        source: "eventbridge.scheduled",
        scheduledExecution: true,
        forceRecalculation: false // 파이프라인에 항상 forceRecalculation 플래그를 전달 (기본값 false)
      })
    }));

    new cdk.CfnOutput(this, "ApiKeyId", { value: apiKey.keyId });
    new cdk.CfnOutput(this, "ApiEndpoint", { value: this.nasunApi.url });
    new cdk.CfnOutput(this, "CumulativeTableName", { value: this.cumulativeLeaderboardTable.tableName });
    new cdk.CfnOutput(this, "DataCollectionTopicArn", { value: this.dataCollectionTopic.topicArn });

    // V3 Pipeline Outputs
    new cdk.CfnOutput(this, "V3PipelineWithScoringArn", { value: this.leaderboardDataPipeline.stateMachineArn });
    new cdk.CfnOutput(this, "V3DailyScheduleRuleName", { value: dailyDataCollectionRuleV3.ruleName });
    new cdk.CfnOutput(this, "TweetBatchSplitterV3Name", { value: this.tweetBatchSplitterFunction.functionName });
    new cdk.CfnOutput(this, "CollectLikesV3Name", { value: this.collectLikesFunction.functionName });
    new cdk.CfnOutput(this, "CollectRetweetsV3Name", { value: this.collectRetweetsFunction.functionName });
    new cdk.CfnOutput(this, "CollectQuotesV3Name", { value: this.collectQuotesFunction.functionName });
  }
}