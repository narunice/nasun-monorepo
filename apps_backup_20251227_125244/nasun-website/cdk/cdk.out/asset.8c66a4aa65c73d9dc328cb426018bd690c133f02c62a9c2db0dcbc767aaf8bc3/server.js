"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const app_1 = __importDefault(require("./app"));
const priceUpdater_1 = require("./jobs/priceUpdater");
const node_cron_1 = __importDefault(require("node-cron"));
const PORT = process.env.PORT || 3001;
// 스케줄: 매 1분마다 가격 업데이트
node_cron_1.default.schedule("*/1 * * * *", async () => {
    try {
        console.log("🔄 Updating crypto prices...");
        await (0, priceUpdater_1.updatePricesInDynamo)();
    }
    catch (err) {
        console.error("❌ Price update failed:", err);
    }
});
app_1.default.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
