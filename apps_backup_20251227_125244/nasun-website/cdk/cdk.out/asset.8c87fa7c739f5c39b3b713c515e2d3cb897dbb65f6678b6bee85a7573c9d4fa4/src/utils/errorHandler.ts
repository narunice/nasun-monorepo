/**
 * Error Handler for NFT Event Lambda Functions
 *
 * @description
 * Lambda 함수에서 발생하는 에러를 표준화하고 적절한 HTTP 응답으로 변환
 *
 * @features
 * - 에러 타입별 분류 (X API, DynamoDB, Validation)
 * - 표준화된 에러 응답 생성
 * - CloudWatch Logs에 상세 로깅
 *
 * @author Claude Code
 * @created 2025-10-25
 */

import { APIGatewayProxyResult } from 'aws-lambda';

export enum ErrorCode {
  // Validation Errors (400)
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS',
  INVALID_WALLET_ADDRESS = 'INVALID_WALLET_ADDRESS',
  INVALID_USER_ID = 'INVALID_USER_ID',

  // X API Errors (429, 503)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  X_API_ERROR = 'X_API_ERROR',

  // DynamoDB Errors (500)
  DYNAMODB_ERROR = 'DYNAMODB_ERROR',

  // Business Logic Errors (400, 409)
  ALREADY_REGISTERED = 'ALREADY_REGISTERED',
  NOT_ELIGIBLE = 'NOT_ELIGIBLE',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  // System Errors (500, 503)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  message: string;
  details?: any;
}

/**
 * 에러를 표준화된 API Gateway 응답으로 변환
 *
 * @param error - 원본 에러 객체
 * @param context - 추가 컨텍스트 정보
 * @returns API Gateway 프록시 응답
 */
export function handleError(
  error: any,
  context?: any
): APIGatewayProxyResult {
  console.error('[ErrorHandler] Error occurred:', {
    error: error.message || error,
    stack: error.stack,
    context,
  });

  let statusCode = 500;
  let errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR;
  let message = '내부 서버 오류가 발생했습니다.';

  // 에러 타입별 분류
  const errorMessage = error.message || String(error);

  if (errorMessage.includes('MISSING_REQUIRED_FIELDS')) {
    statusCode = 400;
    errorCode = ErrorCode.MISSING_REQUIRED_FIELDS;
    message = '필수 필드가 누락되었습니다. walletAddress와 xUserId를 제공해주세요.';
  } else if (errorMessage.includes('INVALID_WALLET_ADDRESS')) {
    statusCode = 400;
    errorCode = ErrorCode.INVALID_WALLET_ADDRESS;
    message = '유효하지 않은 지갑 주소입니다.';
  } else if (errorMessage.includes('INVALID_USER_ID')) {
    statusCode = 400;
    errorCode = ErrorCode.INVALID_USER_ID;
    message = '유효하지 않은 X 사용자 ID입니다.';
  } else if (errorMessage.includes('RATE_LIMIT_EXCEEDED')) {
    statusCode = 429;
    errorCode = ErrorCode.RATE_LIMIT_EXCEEDED;
    message = 'X API Rate Limit에 도달했습니다. 15분 후 다시 시도해주세요.';
  } else if (errorMessage.includes('X_API_ERROR')) {
    statusCode = 503;
    errorCode = ErrorCode.X_API_ERROR;
    message = 'X API 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  } else if (errorMessage.includes('DYNAMODB_ERROR')) {
    statusCode = 500;
    errorCode = ErrorCode.DYNAMODB_ERROR;
    message = '데이터베이스 오류가 발생했습니다.';
  } else if (errorMessage.includes('ALREADY_REGISTERED')) {
    statusCode = 409;
    errorCode = ErrorCode.ALREADY_REGISTERED;
    message = '이미 등록된 지갑 주소입니다.';
  } else if (errorMessage.includes('NOT_ELIGIBLE')) {
    statusCode = 400;
    errorCode = ErrorCode.NOT_ELIGIBLE;
    message = '참여 조건을 충족하지 못했습니다.';
  } else if (errorMessage.includes('DUPLICATE_ENTRY')) {
    statusCode = 409;
    errorCode = ErrorCode.DUPLICATE_ENTRY;
    message = '중복된 항목입니다.';
  } else if (errorMessage.includes('SERVICE_UNAVAILABLE')) {
    statusCode = 503;
    errorCode = ErrorCode.SERVICE_UNAVAILABLE;
    message = '서비스를 일시적으로 사용할 수 없습니다.';
  }

  const errorResponse: ErrorResponse = {
    success: false,
    error: errorMessage,
    code: errorCode,
    message,
    details: context,
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
    },
    body: JSON.stringify(errorResponse),
  };
}

/**
 * 입력 검증 에러 생성
 *
 * @param fieldName - 누락된 필드명
 * @returns 표준화된 에러
 */
export function createValidationError(fieldName: string): Error {
  return new Error(`MISSING_REQUIRED_FIELDS: ${fieldName} is required`);
}

/**
 * X API 에러 생성
 *
 * @param message - 에러 메시지
 * @returns 표준화된 에러
 */
export function createXApiError(message: string): Error {
  return new Error(`X_API_ERROR: ${message}`);
}

/**
 * DynamoDB 에러 생성
 *
 * @param message - 에러 메시지
 * @returns 표준화된 에러
 */
export function createDynamoDbError(message: string): Error {
  return new Error(`DYNAMODB_ERROR: ${message}`);
}
