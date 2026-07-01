import { Pool } from "pg";
import { config } from "../config";

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ service: "user-service", error_code: "DB_POOL_ERROR", message: err.message }));
});
