import express from "express";
import { config } from "./config";
import { connectRedis } from "./services/redis.client";
import { pool } from "./repositories/db";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

const app = express();

app.use(express.json());

// /health is unversioned per CONVENTIONS.md §6
app.use(healthRoutes);

// All business endpoints are versioned under /api/v1 (CONVENTIONS.md §3)
app.use("/api/v1", authRoutes);
app.use("/api/v1", userRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function start(): Promise<void> {
  await connectRedis();
  await pool.query("SELECT 1"); // fail fast if DB is unreachable

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ service: "user-service", message: `listening on port ${config.port}` }));
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ service: "user-service", error_code: "STARTUP_FAILURE", message: err.message }));
  process.exit(1);
});

export default app;
