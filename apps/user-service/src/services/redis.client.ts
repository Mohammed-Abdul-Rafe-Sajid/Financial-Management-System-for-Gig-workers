import { createClient } from "redis";
import { config } from "../config";

export const redisClient = createClient({ url: config.redisUrl });

redisClient.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ service: "user-service", error_code: "REDIS_ERROR", message: err.message }));
});

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}
