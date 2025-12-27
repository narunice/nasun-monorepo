"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const priceUpdater_1 = require("./jobs/priceUpdater");
const handler = async (event, context) => {
    try {
        console.log('🔄 Scheduled price update started...');
        await (0, priceUpdater_1.updatePricesInDynamo)();
        console.log('✅ Scheduled price update completed successfully');
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Price update completed successfully',
                timestamp: new Date().toISOString()
            })
        };
    }
    catch (error) {
        console.error('❌ Price update failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Price update failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            })
        };
    }
};
exports.handler = handler;
