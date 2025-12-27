"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// src/lambda-handler.ts
const serverless_express_1 = __importDefault(require("@vendia/serverless-express"));
const app_clean_1 = __importDefault(require("./app-clean"));
// Create the serverless express handler
const handler = (0, serverless_express_1.default)({ app: app_clean_1.default });
exports.handler = handler;
