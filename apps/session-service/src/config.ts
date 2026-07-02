import { readFileSync } from 'fs';

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function load_jwt_public_key(): string {
  // Option A: path to PEM file
  const keyPath = process.env.JWT_PUBLIC_KEY_PATH;
  if (keyPath) {
    try {
      return readFileSync(keyPath, 'utf8');
    } catch (err) {
      throw new Error(`Cannot read JWT public key from path ${keyPath}: ${err}`);
    }
  }
  // Option B: raw PEM string (newlines as \n)
  const keyStr = process.env.JWT_PUBLIC_KEY;
  if (keyStr) return keyStr.replace(/\\n/g, '\n');

  throw new Error('Must set JWT_PUBLIC_KEY_PATH or JWT_PUBLIC_KEY');
}

export const config = {
  node_env:        process.env.NODE_ENV || 'development',
  port:            parseInt(process.env.PORT || '3002', 10),
  service_name:    process.env.SERVICE_NAME || 'session-service',
  service_version: process.env.SERVICE_VERSION || '1.0.0',

  database_url:    require_env('DATABASE_URL'),

  kafka: {
    brokers:   (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    client_id: process.env.KAFKA_CLIENT_ID || 'session-service',
  },

  jwt_public_key: load_jwt_public_key(),

  // Shared secret for service-to-service calls (CONVENTIONS.md §0, API_CONTRACT.md §0)
  service_secret: require_env('SERVICE_SECRET'),
} as const;
