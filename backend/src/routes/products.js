/**
 * Products Router
 *
 * GET /api/products
 *   Query params:
 *     - limit     : number of items per page (default: 20, max: 100)
 *     - cursor    : base64-encoded JSON { created_at, id } of last seen item
 *     - category  : filter by category (optional)
 *
 * Why cursor-based pagination instead of OFFSET?
 * -----------------------------------------------
 * OFFSET shifts based on row count. If 50 new products are inserted while
 * someone is on page 3, their OFFSET 40 now points to different rows — causing
 * duplicate or skipped items.
 *
 * With a cursor (created_at + id), we ask:
 *   "Give me items strictly older than this item"
 * New insertions at the top don't affect pages below the cursor at all.
 *
 * Composite (created_at, id) cursor handles ties — two products can share
 * the same created_at, so id as a tiebreaker makes the cursor unique.
 */

const express = require("express");
const router = express.Router();
const { pool } = require("../db");

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

// GET /api/products
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const category = req.query.category || null;
    const cursorParam = req.query.cursor || null;

    let cursorCreatedAt = null;
    let cursorId = null;

    // Decode cursor if provided
    if (cursorParam) {
      try {
        const decoded = JSON.parse(
          Buffer.from(cursorParam, "base64").toString("utf8")
        );
        cursorCreatedAt = decoded.created_at;
        cursorId = decoded.id;
      } catch {
        return res.status(400).json({ error: "Invalid cursor" });
      }
    }

    // Build query dynamically based on whether cursor and category exist
    // We fetch limit+1 to know if there's a next page without a COUNT(*) query
    const params = [];
    let whereClauses = [];
    let paramIndex = 1;

    if (category) {
      whereClauses.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (cursorCreatedAt && cursorId) {
      // The core cursor logic:
      // Items where created_at is older than cursor,
      // OR same created_at but id is lexicographically smaller (tiebreaker)
      whereClauses.push(
        `(created_at < $${paramIndex} OR (created_at = $${paramIndex} AND id < $${paramIndex + 1}))`
      );
      params.push(cursorCreatedAt, cursorId);
      paramIndex += 2;
    }

    params.push(limit + 1); // fetch one extra to check hasMore
    const limitParam = paramIndex;

    const whereSQL =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const query = `
      SELECT id, name, category, price, created_at, updated_at
      FROM products
      ${whereSQL}
      ORDER BY created_at DESC, id DESC
      LIMIT $${limitParam}
    `;

    const { rows } = await pool.query(query, params);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor from the last item returned
    let nextCursor = null;
    if (hasMore) {
      const last = items[items.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ created_at: last.created_at, id: last.id })
      ).toString("base64");
    }

    return res.json({
      data: items,
      nextCursor,
      hasMore,
      count: items.length,
    });
  } catch (err) {
    console.error("GET /products error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/categories — return all categories
router.get("/categories", async (_req, res) => {
  res.json({ categories: CATEGORIES });
});

// GET /api/products/stats — total count per category (for UI)
router.get("/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM products
      GROUP BY category
      ORDER BY count DESC
    `);
    const total = rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    res.json({ total, byCategory: rows });
  } catch (err) {
    console.error("GET /products/stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
