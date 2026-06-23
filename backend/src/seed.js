/**
 * Seed Script — generates 200,000 products in one bulk INSERT using PostgreSQL's unnest().
 *
 * Why unnest instead of a loop?
 * - A JS loop with individual INSERTs = 200,000 round trips → very slow (~minutes)
 * - unnest() sends all data in one query → PostgreSQL inserts in bulk → ~5-10 seconds
 *
 * Run: node src/seed.js
 */

require("dotenv").config();
const { Pool } = require("pg");
const { randomUUID } = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TOTAL = 200_000;
const BATCH_SIZE = 10_000; // send in batches to stay under memory/param limits

const CATEGORIES = [
  "Electronics",
  "Clothing",
  "Books",
  "Home & Kitchen",
  "Sports",
  "Toys",
  "Food & Grocery",
  "Beauty",
  "Automotive",
  "Garden",
];

const ADJECTIVES = [
  "Premium", "Ultra", "Slim", "Pro", "Classic", "Smart", "Eco",
  "Portable", "Wireless", "Compact", "Deluxe", "Mini", "Advanced",
];

const NOUNS = [
  "Widget", "Gadget", "Device", "Tool", "Kit", "Set", "Pack",
  "Bundle", "Module", "Unit", "System", "Series", "Edition",
];

function randomProduct(i) {
  const adj = ADJECTIVES[i % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(i / ADJECTIVES.length) % NOUNS.length];
  const category = CATEGORIES[i % CATEGORIES.length];
  const price = (Math.random() * 9990 + 10).toFixed(2);

  // Spread created_at over past 2 years so pagination is interesting
  const daysAgo = Math.floor(Math.random() * 730);
  const createdAt = new Date(Date.now() - daysAgo * 86400_000).toISOString();
  const updatedAt = new Date(
    new Date(createdAt).getTime() + Math.random() * 86400_000 * 30
  ).toISOString();

  return {
    id: randomUUID(),
    name: `${adj} ${noun} ${i + 1}`,
    category,
    price,
    createdAt,
    updatedAt,
  };
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log(`🌱 Seeding ${TOTAL.toLocaleString()} products in batches of ${BATCH_SIZE.toLocaleString()}...`);

    // Ensure table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        price       NUMERIC(10, 2) NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_products_cursor
        ON products (created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_products_category_cursor
        ON products (category, created_at DESC, id DESC);
    `);

    // Clear existing data
    await client.query("TRUNCATE products");
    console.log("🗑️  Cleared existing products");

    const startTime = Date.now();
    let inserted = 0;

    for (let batch = 0; batch < TOTAL / BATCH_SIZE; batch++) {
      const ids = [], names = [], categories = [], prices = [], createdAts = [], updatedAts = [];

      for (let i = 0; i < BATCH_SIZE; i++) {
        const p = randomProduct(batch * BATCH_SIZE + i);
        ids.push(p.id);
        names.push(p.name);
        categories.push(p.category);
        prices.push(p.price);
        createdAts.push(p.createdAt);
        updatedAts.push(p.updatedAt);
      }

      // Single INSERT per batch using unnest — no loop, no 10k round trips
      await client.query(
        `INSERT INTO products (id, name, category, price, created_at, updated_at)
         SELECT
           unnest($1::uuid[]),
           unnest($2::text[]),
           unnest($3::text[]),
           unnest($4::numeric[]),
           unnest($5::timestamptz[]),
           unnest($6::timestamptz[])`,
        [ids, names, categories, prices, createdAts, updatedAts]
      );

      inserted += BATCH_SIZE;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r   Inserted ${inserted.toLocaleString()} / ${TOTAL.toLocaleString()} (${elapsed}s)`);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Done! Seeded ${TOTAL.toLocaleString()} products in ${totalTime}s`);

    // Quick verify
    const { rows } = await client.query("SELECT COUNT(*) FROM products");
    console.log(`📊 Total rows in DB: ${Number(rows[0].count).toLocaleString()}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
