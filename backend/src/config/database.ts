import path from 'path';
import fs from 'fs';

// ─── Shared client interface ──────────────────────────────────────────────────

export interface DBClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

// ─── PGlite (local file-based PostgreSQL) ────────────────────────────────────

let _pglite: import('@electric-sql/pglite').PGlite | null = null;

async function getPGlite(): Promise<import('@electric-sql/pglite').PGlite> {
  if (_pglite) return _pglite;
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  _pglite = new PGlite(path.join(dataDir, 'tenpos'));
  await runMigrations(_pglite);
  return _pglite;
}

async function runMigrations(db: import('@electric-sql/pglite').PGlite) {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`
  );
  if (result.rows[0]?.exists) return;
  const sql = fs.readFileSync(
    path.join(__dirname, '../db/migrations/001_initial.sql'),
    'utf8'
  );
  await db.exec(sql);
  console.log('Local database initialised.');
}

// ─── pg Pool (remote PostgreSQL / Supabase) ───────────────────────────────────

let _pool: import('pg').Pool | null = null;

function getPgPool(): import('pg').Pool {
  if (_pool) return _pool;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg') as typeof import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  });
  pool.on('error', (err: Error) => console.error('DB pool error:', err));
  _pool = pool;
  return pool;
}

// ─── Mode ─────────────────────────────────────────────────────────────────────

const useRemote = Boolean(process.env.DATABASE_URL);

// ─── Public query API ─────────────────────────────────────────────────────────

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  if (useRemote) {
    const client = await getPgPool().connect();
    try {
      const result = await client.query(text, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }
  const db = await getPGlite();
  const result = await db.query<T>(text, params ?? []);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(
  fn: (client: DBClient) => Promise<T>
): Promise<T> {
  if (useRemote) {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client as DBClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      (client as import('pg').PoolClient).release();
    }
  }
  const db = await getPGlite();
  await db.query('BEGIN');
  try {
    const result = await fn(db as unknown as DBClient);
    await db.query('COMMIT');
    return result;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

// ─── Compatibility shim for server.ts ────────────────────────────────────────

export const pool = {
  query: (text: string) => query(text),
  end: async () => { if (_pool) await _pool.end(); },
};
