import { Pool, type PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __polzaPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Не задан DATABASE_URL. Скопируйте .env.example в .env.local и укажите подключение к PostgreSQL.",
    );
  }

  return new Pool({
    connectionString,
    max: 10,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

export const db = globalThis.__polzaPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.__polzaPool = db;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
