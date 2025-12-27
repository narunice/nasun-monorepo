// src/server.ts
import app from "./app";
import { updatePricesInDynamo } from "./jobs/priceUpdater";
import cron from "node-cron";

const PORT = process.env.PORT || 3001;

// 스케줄: 매 1분마다 가격 업데이트
cron.schedule("*/1 * * * *", async () => {
  try {
    console.log("🔄 Updating crypto prices...");
    await updatePricesInDynamo();
  } catch (err) {
    console.error("❌ Price update failed:", err);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
