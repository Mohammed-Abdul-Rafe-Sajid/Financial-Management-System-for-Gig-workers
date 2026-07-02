import { Pool } from 'pg';
import { config } from '../config';

// Single pool shared across the process — never create per-request connections
export const pool = new Pool({
  connectionString: config.database_url,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({
    level: 'error',
    service: config.service_name,
    message: 'PostgreSQL pool error',
    error: err.message,
  }));
});
