"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const login_1 = require("./src/handlers/login");
const callback_1 = require("./src/handlers/callback");
/**
 * Main Lambda handler that routes requests to appropriate handlers
 * GET /auth/twitter/login -> loginHandler
 * POST /auth/twitter/callback -> callbackHandler
 */
const handler = async (event) => {
    console.log('Twitter Auth Lambda invoked:', {
        httpMethod: event.httpMethod,
        path: event.path,
        resource: event.resource,
        pathParameters: event.pathParameters,
    });
    // Route based on HTTP method and path
    try {
        // Handle CORS preflight for all routes
        if (event.httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
                body: '',
            };
        }
        // Route to appropriate handler based on path and method
        const pathSegments = event.path.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (event.httpMethod === 'GET' && (lastSegment === 'login' || event.path.includes('login'))) {
            return await (0, login_1.loginHandler)(event);
        }
        else if (event.httpMethod === 'POST' && (lastSegment === 'callback' || event.path.includes('callback'))) {
            return await (0, callback_1.callbackHandler)(event);
        }
        else {
            // Unknown route
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
                body: JSON.stringify({
                    error: 'Not Found',
                    message: `Route not found: ${event.httpMethod} ${event.path}`,
                }),
            };
        }
    }
    catch (error) {
        console.error('Lambda routing error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: 'Lambda routing failed',
            }),
        };
    }
};
exports.handler = handler;
