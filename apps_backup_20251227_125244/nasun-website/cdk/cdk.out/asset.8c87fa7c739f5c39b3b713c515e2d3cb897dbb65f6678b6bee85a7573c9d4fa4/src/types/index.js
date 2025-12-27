"use strict";
/**
 * NFT Event Type Definitions
 *
 * @description
 * Wave 1 Battalion NFT Free Mint 이벤트 관련 TypeScript 타입 정의
 *
 * @author Claude Code
 * @date 2025-10-25
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = exports.NftEventError = void 0;
// ========== Error Types ==========
/**
 * NFT Event 에러 타입
 */
class NftEventError extends Error {
    constructor(message, code, statusCode = 500) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'NftEventError';
    }
}
exports.NftEventError = NftEventError;
/**
 * 에러 코드
 */
var ErrorCode;
(function (ErrorCode) {
    // Validation Errors (400)
    ErrorCode["INVALID_WALLET_ADDRESS"] = "INVALID_WALLET_ADDRESS";
    ErrorCode["INVALID_X_USER_ID"] = "INVALID_X_USER_ID";
    ErrorCode["INVALID_X_USERNAME"] = "INVALID_X_USERNAME";
    // Business Logic Errors (400)
    ErrorCode["ALREADY_REGISTERED"] = "ALREADY_REGISTERED";
    ErrorCode["NOT_ELIGIBLE"] = "NOT_ELIGIBLE";
    ErrorCode["TASKS_NOT_COMPLETED"] = "TASKS_NOT_COMPLETED";
    // X API Errors (502, 429)
    ErrorCode["X_API_ERROR"] = "X_API_ERROR";
    ErrorCode["X_API_RATE_LIMIT"] = "X_API_RATE_LIMIT";
    // Database Errors (500)
    ErrorCode["DYNAMODB_ERROR"] = "DYNAMODB_ERROR";
    // Unknown Errors (500)
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
//# sourceMappingURL=index.js.map