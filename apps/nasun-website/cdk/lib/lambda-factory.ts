/**
 * Lambda Factory
 * 
 * Purpose: Lambda Registry를 기반으로 Lambda 함수를 자동 생성
 * - 중앙 집중식 Lambda 관리
 * - Handler 경로 불일치 자동 방지
 * - 코드 중복 제거
 */

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaConfig, lambdaRegistry } from '../config/lambda-registry';

/**
 * Lambda 생성 옵션 (Registry 설정 오버라이드)
 */
export interface LambdaFactoryOptions {
  /** 환경 변수 */
  environment?: { [key: string]: string };
  
  /** CloudWatch Logs 그룹 생성 여부 (기본: true) */
  createLogGroup?: boolean;
  
  /** Log Group 이름 (지정하지 않으면 자동 생성) */
  logGroupName?: string;
  
  /** Log Group RemovalPolicy (기본: DESTROY) */
  logRetention?: cdk.RemovalPolicy;
  
  /** Timeout 오버라이드 */
  timeout?: cdk.Duration;
  
  /** Memory 오버라이드 */
  memorySize?: number;
}

/**
 * Lambda Factory 클래스
 */
export class LambdaFactory {
  /**
   * Registry 키로 Lambda 함수 생성
   * 
   * @param scope CDK Construct scope
   * @param registryKey lambda-registry.ts의 키
   * @param options 추가 옵션 (환경 변수 등)
   * @returns Lambda Function
   */
  static createFromRegistry(
    scope: Construct,
    registryKey: string,
    options: LambdaFactoryOptions = {}
  ): lambda.Function {
    // Registry에서 설정 가져오기
    const config = lambdaRegistry[registryKey];
    if (!config) {
      throw new Error(
        `Lambda configuration not found in registry: "${registryKey}"\n` +
        `Available keys: ${Object.keys(lambdaRegistry).join(', ')}`
      );
    }

    // Lambda 함수 생성
    return this.createFunction(scope, config, options);
  }

  /**
   * Lambda Config로 함수 생성 (내부 메서드)
   */
  private static createFunction(
    scope: Construct,
    config: LambdaConfig,
    options: LambdaFactoryOptions
  ): lambda.Function {
    const createLogGroup = options.createLogGroup !== false; // 기본값: true

    // Log Group 생성
    let logGroup: logs.ILogGroup | undefined;
    if (createLogGroup) {
      const logGroupName = options.logGroupName || `/aws/lambda/${config.functionName}`;
      logGroup = new logs.LogGroup(scope, `${config.constructId}LogGroup`, {
        logGroupName,
        removalPolicy: options.logRetention || cdk.RemovalPolicy.DESTROY
      });
    }

    // Lambda 함수 생성
    const fn = new lambda.Function(scope, config.constructId, {
      functionName: config.functionName,
      runtime: config.runtime,
      handler: config.handler,
      code: lambda.Code.fromAsset(config.assetPath),
      timeout: options.timeout || config.timeout,
      memorySize: options.memorySize || config.memorySize,
      environment: options.environment || {},
      logGroup,
      description: config.description
    });

    return fn;
  }

  /**
   * 여러 Lambda 함수를 배치로 생성
   * 
   * @param scope CDK Construct scope
   * @param configs 생성할 Lambda 설정 배열
   * @returns Lambda Function 맵
   */
  static createBatch(
    scope: Construct,
    configs: Array<{ key: string; options?: LambdaFactoryOptions }>
  ): { [key: string]: lambda.Function } {
    const functions: { [key: string]: lambda.Function } = {};

    configs.forEach(({ key, options }) => {
      functions[key] = this.createFromRegistry(scope, key, options || {});
    });

    return functions;
  }

  /**
   * Registry의 모든 Lambda 정보 반환 (디버깅용)
   */
  static listRegistry(): string[] {
    return Object.keys(lambdaRegistry).sort();
  }

  /**
   * Registry 키 검증 (컴파일 타임)
   */
  static validateKey(key: string): boolean {
    return key in lambdaRegistry;
  }
}

/**
 * Lambda Function Builder (Fluent API)
 * 
 * Example:
 *   const fn = new LambdaBuilder(scope, 'wallet-api')
 *     .withEnvironment({ TABLE_NAME: table.tableName })
 *     .withTimeout(cdk.Duration.seconds(60))
 *     .build();
 */
export class LambdaBuilder {
  private registryKey: string;
  private scope: Construct;
  private options: LambdaFactoryOptions = {};

  constructor(scope: Construct, registryKey: string) {
    this.scope = scope;
    this.registryKey = registryKey;
  }

  withEnvironment(env: { [key: string]: string }): this {
    this.options.environment = { ...this.options.environment, ...env };
    return this;
  }

  withTimeout(timeout: cdk.Duration): this {
    this.options.timeout = timeout;
    return this;
  }

  withMemorySize(memorySize: number): this {
    this.options.memorySize = memorySize;
    return this;
  }

  withLogGroup(name: string, retention?: cdk.RemovalPolicy): this {
    this.options.logGroupName = name;
    this.options.logRetention = retention;
    return this;
  }

  withoutLogGroup(): this {
    this.options.createLogGroup = false;
    return this;
  }

  build(): lambda.Function {
    return LambdaFactory.createFromRegistry(this.scope, this.registryKey, this.options);
  }
}
