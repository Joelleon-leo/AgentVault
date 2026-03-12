import { neon } from "@neondatabase/serverless";

let _sql = null;

export function getSQL() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set. Add your Neon connection string to .env.local");
    }
    _sql = neon(url);
  }
  return _sql;
}

// Run once on first import to ensure tables exist
let _initialized = false;

export async function ensureTables() {
  if (_initialized) return;
  const sql = getSQL();

  await sql`
    CREATE TABLE IF NOT EXISTS connections (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      granted_scopes JSONB NOT NULL DEFAULT '[]',
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'active',
      token_vault_id TEXT NOT NULL,
      UNIQUE(user_id, service_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tokens (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT NOT NULL DEFAULT 'Bearer',
      expires_at BIGINT,
      scope TEXT DEFAULT '',
      stored_at BIGINT NOT NULL,
      UNIQUE(user_id, service_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS permissions (
      user_id TEXT PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      type TEXT,
      action TEXT,
      service TEXT,
      service_id TEXT,
      detail TEXT,
      status TEXT DEFAULT 'success'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pending_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TIMESTAMPTZ,
      data JSONB NOT NULL DEFAULT '{}'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_policies (
      user_id TEXT PRIMARY KEY,
      policies JSONB NOT NULL DEFAULT '{}'
    )
  `;

  _initialized = true;
}
