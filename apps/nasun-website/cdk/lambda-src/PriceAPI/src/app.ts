// app.ts
import express from "express";
import pricesRoutes from "./routes/prices.routes";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ Backend API is running.");
});

app.use("/api", pricesRoutes);

export default app;
