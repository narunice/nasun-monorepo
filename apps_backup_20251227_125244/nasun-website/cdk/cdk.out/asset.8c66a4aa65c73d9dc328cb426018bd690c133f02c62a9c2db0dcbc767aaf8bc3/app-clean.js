"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app-clean.ts - Express app without cron job for Lambda
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const prices_routes_1 = __importDefault(require("./routes/prices.routes"));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Health check endpoint
app.get("/", (req, res) => {
    res.json({
        message: "✅ PriceAPI is running",
        timestamp: new Date().toISOString(),
        endpoints: ["/api/prices"]
    });
});
// API routes
app.use("/api", prices_routes_1.default);
// 404 handler
app.use("*", (req, res) => {
    res.status(404).json({
        error: "Endpoint not found",
        path: req.originalUrl,
        availableEndpoints: ["/", "/api/prices"]
    });
});
exports.default = app;
