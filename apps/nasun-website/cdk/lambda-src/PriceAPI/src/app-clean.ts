// src/app-clean.ts - Express app without cron job for Lambda
import express from "express";
import cors from "cors";
import pricesRoutes from "./routes/prices.routes";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "✅ PriceAPI is running",
    timestamp: new Date().toISOString(),
    endpoints: ["/api/prices"]
  });
});

// API routes
app.use("/api", pricesRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.originalUrl,
    availableEndpoints: ["/", "/api/prices"]
  });
});

export default app;