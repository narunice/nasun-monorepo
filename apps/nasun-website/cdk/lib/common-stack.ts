import * as dotenv from "dotenv";
dotenv.config();
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface CommonStackProps extends cdk.StackProps {
  // 필요한 경우 다른 스택 참조 추가
}

// Security: CORS 허용 도메인 목록
const ALLOWED_ORIGINS = [
  'https://nasun.io',
  'https://www.nasun.io',
  'https://staging.nasun.io',
  'https://gensol.nasun.io',
  'https://staging.gensol.io',
  'https://pado.finance',
  'https://staging.pado.finance',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'] : []),
];

export class CommonStack extends cdk.Stack {
  public readonly priceApiGateway: apigw.LambdaRestApi;
  public readonly priceUpdaterLambda: lambda.Function;
  public readonly userProfilesTable: dynamodb.ITable;
  public readonly cumulativeLeaderboardTable: dynamodb.ITable;

  constructor(scope: Construct, id: string, props?: CommonStackProps) {
    super(scope, id, props);

    // ========================================
    // DynamoDB 테이블 참조 (기존 테이블 사용)
    // ========================================
    this.cumulativeLeaderboardTable = dynamodb.Table.fromTableName(
      this,
      "CumulativeLeaderboardTable",
      "nasun-leaderboard-data"
    );
    const cryptoBackupPricesTable = dynamodb.Table.fromTableName(
      this,
      "CryptoBackupPricesTable",
      "CryptoBackupPrices"
    );
    const supplyCountTable = dynamodb.Table.fromTableName(
      this,
      "SupplyCountTable",
      "NftImages"
    );
    this.userProfilesTable = dynamodb.Table.fromTableName(
      this,
      "UserProfilesTable",
      "UserProfiles"
    );
    const userIdentityMapTable = dynamodb.Table.fromTableName(
      this,
      "UserIdentityMapTable",
      "UserIdentityMap"
    );
    const cryptoPricesTable = dynamodb.Table.fromTableName(
      this,
      "CryptoPricesTable",
      "CryptoPrices"
    );

    // ========================================
    // 1. NFT/Supply Lambda 함수들
    // ========================================

    // 1-1. Get Backup Prices
    const getBackupPricesLambda = new lambda.Function(this, "GetBackupPricesLambda", {
      functionName: "nasun-common-get-backup-prices",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/get-backup-prices/dist"),
      environment: { TABLE_NAME: cryptoBackupPricesTable.tableName },
      logGroup: new logs.LogGroup(this, "GetBackupPricesLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-backup-prices",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoBackupPricesTable.grantReadData(getBackupPricesLambda);

    const getBackupPricesApi = new apigw.LambdaRestApi(this, "GetBackupPricesApi", {
      handler: getBackupPricesLambda,
      restApiName: "NASUN Get Backup Prices API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // 1-2. Get Supply Count
    const getSupplyCountLambda = new lambda.Function(this, "GetSupplyCountLambda", {
      functionName: "nasun-common-get-supply-count",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/getSupplyCount/dist"),
      environment: { TABLE_NAME: supplyCountTable.tableName },
      logGroup: new logs.LogGroup(this, "GetSupplyCountLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-supply-count",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    supplyCountTable.grantReadData(getSupplyCountLambda);

    const getSupplyCountApi = new apigw.LambdaRestApi(this, "GetSupplyCountApi", {
      handler: getSupplyCountLambda,
      restApiName: "NASUN Get Supply Count API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // 1-3. Get All Supply Counts
    const getAllSupplyCountsLambda = new lambda.Function(this, "GetAllSupplyCountsLambda", {
      functionName: "nasun-common-get-all-supply-counts",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/getAllSupplyCounts"),
      environment: { TABLE_NAME: supplyCountTable.tableName },
      logGroup: new logs.LogGroup(this, "GetAllSupplyCountsLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-all-supply-counts",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    supplyCountTable.grantReadData(getAllSupplyCountsLambda);

    const getAllSupplyCountsApi = new apigw.LambdaRestApi(this, "GetAllSupplyCountsApi", {
      handler: getAllSupplyCountsLambda,
      restApiName: "NASUN Get All Supply Counts API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // 1-4. Random Image Handler
    const randomImageHandlerLambda = new lambda.Function(this, "RandomImageHandlerLambda", {
      functionName: "nasun-common-random-image-handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/randomImageHandler"),
      environment: {
        TABLE_NAME: supplyCountTable.tableName,
        MAX_MINT_COUNTS: '{"TIER1":1,"TIER2":2,"TIER3":3,"TIER4":4,"TIER5":100}'
      },
      logGroup: new logs.LogGroup(this, "RandomImageHandlerLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-random-image-handler",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    supplyCountTable.grantReadWriteData(randomImageHandlerLambda);

    const randomImageApi = new apigw.LambdaRestApi(this, "RandomImageApi", {
      handler: randomImageHandlerLambda,
      restApiName: "NASUN Random Image API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // ========================================
    // 2. User Profile Lambda 함수들
    // ========================================

    // 2-1. Get User Profile
    const getUserProfileLambda = new lambda.Function(this, "GetUserProfileLambda", {
      functionName: "nasun-common-get-user-profile",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/get-user-profile"),
      environment: {
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        USER_IDENTITY_MAP_TABLE: userIdentityMapTable.tableName
      },
      logGroup: new logs.LogGroup(this, "GetUserProfileLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-user-profile",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(getUserProfileLambda);
    userIdentityMapTable.grantReadData(getUserProfileLambda);

    const userProfileApi = new apigw.LambdaRestApi(this, "UserProfileApi", {
      handler: getUserProfileLambda,
      restApiName: "NASUN User Profile API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

    // 2-2. Link Account
    const linkAccountLambda = new lambda.Function(this, "LinkAccountLambda", {
      functionName: "nasun-common-link-account",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/link-account"),
      environment: { USER_PROFILES_TABLE: this.userProfilesTable.tableName },
      timeout: cdk.Duration.seconds(10),
      logGroup: new logs.LogGroup(this, "LinkAccountLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-link-account",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(linkAccountLambda);

    const linkAccountApi = new apigw.LambdaRestApi(this, "LinkAccountApi", {
      handler: linkAccountLambda,
      restApiName: "NASUN Link Account API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

    // 2-3. Wallet API
    const walletApiLambda = new lambda.Function(this, "WalletApiLambda", {
      functionName: "nasun-common-wallet-api",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/wallet-api/dist"),
      environment: { USER_PROFILES_TABLE: this.userProfilesTable.tableName },
      logGroup: new logs.LogGroup(this, "WalletApiLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-wallet-api",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(walletApiLambda);

    const walletApi = new apigw.LambdaRestApi(this, "WalletApi", {
      handler: walletApiLambda,
      restApiName: "NASUN Wallet API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

    // 2-4. Governance API
    const governanceApiLambda = new lambda.Function(this, "GovernanceApiLambda", {
      functionName: "nasun-common-governance-api",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/governance-api/dist"),
      environment: {
        LEADERBOARD_TABLE: this.cumulativeLeaderboardTable.tableName,
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || "",
        NASUN_NFT_CONTRACT_ADDRESS: process.env.NASUN_NFT_CONTRACT_ADDRESS || "",
        NFT_BONUS: process.env.NFT_BONUS || "2",
        LEADERBOARD_WEIGHT: process.env.LEADERBOARD_WEIGHT || "1",
        TOKEN_WEIGHT: process.env.TOKEN_WEIGHT || "0",
      },
      logGroup: new logs.LogGroup(this, "GovernanceApiLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-governance-api",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.cumulativeLeaderboardTable.grantReadData(governanceApiLambda);
    this.userProfilesTable.grantReadData(governanceApiLambda);

    const governanceApi = new apigw.LambdaRestApi(this, "GovernanceApi", {
      handler: governanceApiLambda,
      restApiName: "NASUN Governance API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

    // ========================================
    // 3. Price API Lambda 함수들
    // ========================================

    // 3-1. Update Backup Prices
    const updateBackupPricesLambda = new lambda.Function(this, "UpdateBackupPricesLambda", {
      functionName: "nasun-common-update-backup-prices",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/update-backup-prices/src"),
      environment: {
        CMC_API_KEY: process.env.CMC_API_KEY || "",
        TABLE_NAME: cryptoBackupPricesTable.tableName
      },
      logGroup: new logs.LogGroup(this, "UpdateBackupPricesLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-update-backup-prices",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoBackupPricesTable.grantWriteData(updateBackupPricesLambda);

    // 3-2. Price API
    const priceApiLambda = new lambda.Function(this, "PriceApiLambda", {
      functionName: "nasun-common-price-api",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "lambda-handler.handler",
      code: lambda.Code.fromAsset("lambda-src/PriceAPI/dist"),
      environment: {},
      logGroup: new logs.LogGroup(this, "PriceApiLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-price-api",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoPricesTable.grantReadData(priceApiLambda);
    cryptoBackupPricesTable.grantReadData(priceApiLambda);

    // 3-3. Price Updater
    this.priceUpdaterLambda = new lambda.Function(this, "PriceUpdaterLambda", {
      functionName: "nasun-common-price-updater",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "price-updater-handler.handler",
      code: lambda.Code.fromAsset("lambda-src/PriceAPI/lambda-package"),
      timeout: cdk.Duration.minutes(5),
      environment: {},
      logGroup: new logs.LogGroup(this, "PriceUpdaterLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-price-updater",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    cryptoBackupPricesTable.grantReadWriteData(this.priceUpdaterLambda);
    cryptoPricesTable.grantReadWriteData(this.priceUpdaterLambda);

    this.priceApiGateway = new apigw.LambdaRestApi(this, "PriceApiGateway", {
      handler: priceApiLambda,
      restApiName: "NASUN Price API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
    });

    // 3-4. Price Update Rule (EventBridge)
    const priceUpdateRule = new events.Rule(this, "PriceUpdateRule", {
      ruleName: "nasun-common-price-update",
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      description: "Trigger price updates every minute (Common Stack)",
    });
    priceUpdateRule.addTarget(new targets.LambdaFunction(this.priceUpdaterLambda));

    // ========================================
    // 4. AWS Credentials Lambda
    // ========================================

    const getAwsCredentialsLambda = new lambda.Function(this, "GetAwsCredentialsLambda", {
      functionName: "nasun-common-get-aws-credentials",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/get-aws-credentials"),
      environment: {},
      logGroup: new logs.LogGroup(this, "GetAwsCredentialsLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-aws-credentials",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    getAwsCredentialsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-identity:GetCredentialsForIdentity"],
        resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`]
      })
    );

    const getAwsCredentialsApi = new apigw.LambdaRestApi(this, "GetAwsCredentialsApi", {
      handler: getAwsCredentialsLambda,
      restApiName: "NASUN Get AWS Credentials API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"]
      },
    });

    // ========================================
    // 5. User Account Management (Deactivation & Purge)
    // ========================================

    // ✅ Lambda Authorizer 제거: identityId 기반 인증으로 변경
    // 로그인 시스템을 건드리지 않기 위해 Custom Token Authorizer를 사용하지 않음

    // 5-2. Deactivate User Account Lambda
    const deactivateUserAccountLambda = new lambda.Function(this, "DeactivateUserAccountLambda", {
        functionName: "nasun-common-deactivate-user-account",
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lambda-src/deactivate-user-account/dist"),
        environment: {
            USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        },
        logGroup: new logs.LogGroup(this, "DeactivateUserAccountLogGroup", {
            logGroupName: "/aws/lambda/nasun-common-deactivate-user-account",
            removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
    });
    this.userProfilesTable.grantWriteData(deactivateUserAccountLambda);

    // ✅ identityId 기반 인증: 인증 없이 쿼리 파라미터로 identityId 전달
    // Lambda 함수 내부에서 DynamoDB 프로필 존재 여부로 검증
    const deactivateAccountApi = new apigw.LambdaRestApi(this, "DeactivateAccountApi", {
        handler: deactivateUserAccountLambda,
        restApiName: "NASUN Deactivate Account API (Common)",
        proxy: false,
        defaultCorsPreflightOptions: {
            allowOrigins: ALLOWED_ORIGINS,
            allowMethods: ["DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization"],
        },
    });
    deactivateAccountApi.root.addMethod('DELETE', new apigw.LambdaIntegration(deactivateUserAccountLambda));

    // 5-3. Purge Deactivated Accounts Lambda (Scheduled)
    const purgeDeactivatedAccountsLambda = new lambda.Function(this, "PurgeDeactivatedAccountsLambda", {
      functionName: "nasun-common-purge-deactivated-accounts",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/purge-deactivated-accounts/dist"),
      environment: {
        USER_PROFILES_TABLE: this.userProfilesTable.tableName,
        COGNITO_IDENTITY_POOL_ID: process.env.VITE_COGNITO_IDENTITY_POOL_ID || "",
      },
      timeout: cdk.Duration.minutes(5),
      logGroup: new logs.LogGroup(this, "PurgeDeactivatedAccountsLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-purge-deactivated-accounts",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    this.userProfilesTable.grantReadWriteData(purgeDeactivatedAccountsLambda);
    purgeDeactivatedAccountsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-identity:UnlinkIdentity", "cognito-identity:DescribeIdentity"],
        resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`]
      })
    );

    const purgeAccountsRule = new events.Rule(this, "PurgeAccountsRule", {
      ruleName: "nasun-common-purge-deactivated-accounts-daily",
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      description: "Trigger to purge deactivated accounts daily (Common Stack)",
    });
    purgeAccountsRule.addTarget(new targets.LambdaFunction(purgeDeactivatedAccountsLambda));

    // ========================================
    // 6. Get User Count Lambda (Roadmap 메트릭용)
    // ========================================

    const getUserCountLambda = new lambda.Function(this, "GetUserCountLambda", {
      functionName: "nasun-common-get-user-count",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/get-user-count/dist"),
      environment: { USER_PROFILES_TABLE: this.userProfilesTable.tableName },
      logGroup: new logs.LogGroup(this, "GetUserCountLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-user-count",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });
    // DescribeTable 권한 추가
    getUserCountLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:DescribeTable"],
        resources: [this.userProfilesTable.tableArn]
      })
    );

    const getUserCountApi = new apigw.LambdaRestApi(this, "GetUserCountApi", {
      handler: getUserCountLambda,
      restApiName: "NASUN Get User Count API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "OPTIONS"]
      },
    });

    // ========================================
    // 6-2. Get Follower Count Lambda (Twitter API)
    // ========================================

    const getFollowerCountLambda = new lambda.Function(this, "GetFollowerCountLambda", {
      functionName: "nasun-common-get-follower-count",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda-src/get-follower-count/dist"),
      timeout: cdk.Duration.seconds(30),
      environment: {
        TARGET_USERNAME: process.env.TARGET_USERNAME || "Nasun_io",
        TWITTER_TOKENS_SECRET_NAME: process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens",
      },
      logGroup: new logs.LogGroup(this, "GetFollowerCountLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-get-follower-count",
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
    });

    // Secrets Manager 읽기 권한 추가
    getFollowerCountLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-twitter-tokens*`,
        ]
      })
    );

    const getFollowerCountApi = new apigw.LambdaRestApi(this, "GetFollowerCountApi", {
      handler: getFollowerCountLambda,
      restApiName: "NASUN Get Follower Count API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ["GET", "OPTIONS"]
      },
    });

    // ========================================
    // 7. SSM Parameters
    // ========================================

    new ssm.StringParameter(this, 'PriceApiUrlParam', {
      parameterName: '/nasun/common/price-api-url',
      stringValue: this.priceApiGateway.url,
      description: 'CommonStack Price API URL',
    });

    new ssm.StringParameter(this, 'GetBackupPricesApiUrlParam', {
      parameterName: '/nasun/common/get-backup-prices-api-url',
      stringValue: getBackupPricesApi.url,
      description: 'CommonStack Get Backup Prices API URL',
    });

    new ssm.StringParameter(this, 'UserProfileApiUrlParam', {
      parameterName: '/nasun/common/user-profile-api-url',
      stringValue: userProfileApi.url,
      description: 'CommonStack User Profile API URL',
    });

    // ========================================
    // 6. Stack Outputs
    // ========================================

    new cdk.CfnOutput(this, "PriceApiUrl", {
      value: this.priceApiGateway.url,
      description: "Price API Gateway URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetBackupPricesApiUrl", {
      value: getBackupPricesApi.url,
      description: "Get Backup Prices API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetSupplyCountApiUrl", {
      value: getSupplyCountApi.url,
      description: "Get Supply Count API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetAllSupplyCountsApiUrl", {
      value: getAllSupplyCountsApi.url,
      description: "Get All Supply Counts API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "RandomImageApiUrl", {
      value: randomImageApi.url,
      description: "Random Image API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "UserProfileApiUrl", {
      value: userProfileApi.url,
      description: "User Profile API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "LinkAccountApiUrl", {
      value: linkAccountApi.url,
      description: "Link Account API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "DeactivateAccountApiUrl", {
      value: deactivateAccountApi.url,
      description: "Deactivate Account API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "WalletApiUrl", {
      value: walletApi.url,
      description: "Wallet API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GovernanceApiUrl", {
      value: governanceApi.url,
      description: "Governance API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetAwsCredentialsApiUrl", {
      value: getAwsCredentialsApi.url,
      description: "Get AWS Credentials API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetUserCountApiUrl", {
      value: getUserCountApi.url,
      description: "Get User Count API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "GetFollowerCountApiUrl", {
      value: getFollowerCountApi.url,
      description: "Get Follower Count API URL (CommonStack)",
    });

    // ========================================
    // 10. NFT Whitelist 시스템
    // ========================================
    // NOTE: Renamed from "FoundersNftWhitelist" to "GenesisNftWhitelist"
    // MIGRATION REQUIRED: Before CDK deploy, run data migration script.

    // 10-1. DynamoDB 테이블 생성
    const whitelistTable = new dynamodb.Table(this, "GenesisNftWhitelistTable", {
      tableName: "GenesisNftWhitelist",
      partitionKey: {
        name: "walletAddress",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // 프로덕션 데이터 보호
      pointInTimeRecovery: true, // 백업 활성화
    });

    // GSI: 날짜별 조회용
    whitelistTable.addGlobalSecondaryIndex({
      indexName: "joinedAt-index",
      partitionKey: {
        name: "status",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "joinedAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 10-2. Lambda 공통 환경변수
    const whitelistEnv = {
      WHITELIST_TABLE_NAME: whitelistTable.tableName,
      ADMIN_API_KEY: process.env.ADMIN_API_KEY || "default-insecure-key",
    };

    // 10-3. Join Whitelist Lambda
    const joinWhitelistLambda = new lambda.Function(this, "JoinWhitelistLambda", {
      functionName: "nasun-common-whitelist-join",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "dist/handlers/join.handler",
      code: lambda.Code.fromAsset("lambda-src/whitelist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "JoinWhitelistLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-join",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadWriteData(joinWhitelistLambda);

    const joinWhitelistApi = new apigw.LambdaRestApi(this, "JoinWhitelistApi", {
      handler: joinWhitelistLambda,
      restApiName: "NASUN Join Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // 10-4. Withdraw Whitelist Lambda
    const withdrawWhitelistLambda = new lambda.Function(this, "WithdrawWhitelistLambda", {
      functionName: "nasun-common-whitelist-withdraw",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "dist/handlers/withdraw.handler",
      code: lambda.Code.fromAsset("lambda-src/whitelist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "WithdrawWhitelistLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-withdraw",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadWriteData(withdrawWhitelistLambda);

    const withdrawWhitelistApi = new apigw.LambdaRestApi(this, "WithdrawWhitelistApi", {
      handler: withdrawWhitelistLambda,
      restApiName: "NASUN Withdraw Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // 10-5. Check Whitelist Lambda
    const checkWhitelistLambda = new lambda.Function(this, "CheckWhitelistLambda", {
      functionName: "nasun-common-whitelist-check",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "dist/handlers/check.handler",
      code: lambda.Code.fromAsset("lambda-src/whitelist"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "CheckWhitelistLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-check",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadData(checkWhitelistLambda);

    const checkWhitelistApi = new apigw.LambdaRestApi(this, "CheckWhitelistApi", {
      handler: checkWhitelistLambda,
      restApiName: "NASUN Check Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // 10-6. Admin List Lambda
    const adminListLambda = new lambda.Function(this, "AdminListLambda", {
      functionName: "nasun-common-whitelist-admin-list",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "dist/handlers/admin-list.handler",
      code: lambda.Code.fromAsset("lambda-src/whitelist"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "AdminListLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-admin-list",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadData(adminListLambda);

    const adminListApi = new apigw.LambdaRestApi(this, "AdminListApi", {
      handler: adminListLambda,
      restApiName: "NASUN Admin List Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // 10-7. Admin Export Lambda
    const adminExportLambda = new lambda.Function(this, "AdminExportLambda", {
      functionName: "nasun-common-whitelist-export",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "dist/handlers/admin-export.handler",
      code: lambda.Code.fromAsset("lambda-src/whitelist"),
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: whitelistEnv,
      logGroup: new logs.LogGroup(this, "AdminExportLambdaLogGroup", {
        logGroupName: "/aws/lambda/nasun-common-whitelist-export",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    whitelistTable.grantReadData(adminExportLambda);

    const adminExportApi = new apigw.LambdaRestApi(this, "AdminExportApi", {
      handler: adminExportLambda,
      restApiName: "NASUN Admin Export Whitelist API (Common)",
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    // 10-8. CloudFormation Outputs
    new cdk.CfnOutput(this, "WhitelistTableName", {
      value: whitelistTable.tableName,
      description: "Genesis NFT Whitelist DynamoDB Table Name",
    });

    new cdk.CfnOutput(this, "JoinWhitelistApiUrl", {
      value: joinWhitelistApi.url,
      description: "Join Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "WithdrawWhitelistApiUrl", {
      value: withdrawWhitelistApi.url,
      description: "Withdraw Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "CheckWhitelistApiUrl", {
      value: checkWhitelistApi.url,
      description: "Check Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "AdminListWhitelistApiUrl", {
      value: adminListApi.url,
      description: "Admin List Whitelist API URL (CommonStack)",
    });

    new cdk.CfnOutput(this, "AdminExportWhitelistApiUrl", {
      value: adminExportApi.url,
      description: "Admin Export Whitelist API URL (CommonStack)",
    });
  }
}
