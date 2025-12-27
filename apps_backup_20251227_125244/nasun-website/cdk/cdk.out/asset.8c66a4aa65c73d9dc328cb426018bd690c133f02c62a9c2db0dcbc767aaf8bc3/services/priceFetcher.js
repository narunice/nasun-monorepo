"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCryptoPrices = fetchCryptoPrices;
// src/services/priceFetcher.ts
const axios_1 = __importDefault(require("axios"));
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";
const COINS = {
    SUI: "sui",
    IOTA: "iota",
    ETH: "ethereum",
    SOL: "solana",
};
async function fetchCryptoPrices() {
    try {
        const res = await axios_1.default.get(`${COINGECKO_API_URL}/simple/price`, {
            params: {
                ids: Object.values(COINS).join(","),
                vs_currencies: "usd",
                include_last_updated_at: true,
                precision: 8, // ← 정밀도 추가!
            },
        });
        const data = res.data;
        return {
            SUI: {
                usd: data.sui?.usd || 0,
                updatedAt: data.sui?.last_updated_at, // Unix timestamp 유지
            },
            IOTA: {
                usd: data.iota?.usd || 0,
                updatedAt: data.iota?.last_updated_at,
            },
            ETH: {
                usd: data.ethereum?.usd || 0,
                updatedAt: data.ethereum?.last_updated_at,
            },
            SOL: {
                usd: data.solana?.usd || 0,
                updatedAt: data.solana?.last_updated_at,
            },
        };
    }
    catch (error) {
        console.error("Error fetching prices:", error);
        return {
            SUI: { usd: 0, updatedAt: Math.floor(Date.now() / 1000) }, // 현재 Unix 시간
            IOTA: { usd: 0, updatedAt: Math.floor(Date.now() / 1000) },
            ETH: { usd: 0, updatedAt: Math.floor(Date.now() / 1000) },
            SOL: { usd: 0, updatedAt: Math.floor(Date.now() / 1000) },
        };
    }
}
