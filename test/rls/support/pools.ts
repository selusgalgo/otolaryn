import { Pool, PoolConfig } from 'pg';

function baseConfig(): PoolConfig {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
  };
}

export function ownerPool(): Pool {
  return new Pool({
    ...baseConfig(),
    user: process.env.DB_OWNER_USER,
    password: process.env.DB_OWNER_PASSWORD,
  });
}

export function appPool(max = 10): Pool {
  return new Pool({
    ...baseConfig(),
    user: process.env.DB_APP_USER,
    password: process.env.DB_APP_PASSWORD,
    max,
  });
}
