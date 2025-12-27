// src/routes/prices.routes.ts
import { Router } from "express";
import { docClient } from "../services/dynamoClient";
import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const router = Router();

// 리스트에서 여러 코인 가격을 한번에 조회 (Primary: CoinGecko, Backup: CoinMarketCap)
router.get("/prices", async (req, res) => {
  try {
    const coinIds = ["SUI", "IOTA", "ETH", "SOL"];
    let prices = [];
    let dataSource = "CoinGecko";

    // First attempt: CryptoPrices (CoinGecko)
    try {
      const primaryResult = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            CryptoPrices: {
              Keys: coinIds.map((coinId) => ({ coinId })),
            },
          },
        })
      );

      prices = primaryResult.Responses?.CryptoPrices || [];
      
      // If no data from primary source, try backup
      if (prices.length === 0) {
        throw new Error("No data from primary source");
      }
    } catch (primaryError) {
      const errorMessage = primaryError instanceof Error ? primaryError.message : 'Unknown error';
      console.warn("Primary source (CoinGecko) failed, trying backup (CoinMarketCap):", errorMessage);
      
      // Backup attempt: CryptoBackupPrices (CoinMarketCap)
      const backupResult = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            CryptoBackupPrices: {
              Keys: coinIds.map((coinId) => ({ coinId })),
            },
          },
        })
      );

      prices = backupResult.Responses?.CryptoBackupPrices || [];
      dataSource = "CoinMarketCap";
    }

    res.json({
      success: true,
      data: prices,
      metadata: {
        source: dataSource,
        count: prices.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("Error fetching prices from both sources:", err);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error",
      message: "Both primary and backup price sources are unavailable"
    });
  }
});

export default router;
