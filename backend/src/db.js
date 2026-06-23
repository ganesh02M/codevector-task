const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Neon/Supabase
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      category    TEXT NOT NULL,
      price       NUMERIC(10, 2) NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Composite index for cursor pagination (newest first)
    CREATE INDEX IF NOT EXISTS idx_products_cursor
      ON products (created_at DESC, id DESC);

    -- Index for category filter + cursor pagination
    CREATE INDEX IF NOT EXISTS idx_products_category_cursor
      ON products (category, created_at DESC, id DESC);
  `);

  console.log("✅ DB initialized with indexes");
}

module.exports = { pool, initDB };
