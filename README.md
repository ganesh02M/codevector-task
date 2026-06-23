# ProductVault — CodeVector Take-Home Task

Browse 200,000 products (newest first), filter by category, paginate fast — with **zero duplicate/skipped items** even when data changes live.

**Live Demo:** `https://codevector-backend-oouo.onrender.com`  
**Backend API:** `YOUR_RENDER_URL/api/products`

---

## What I Built

A Node.js + Express backend with PostgreSQL (Neon), serving 200k products via **cursor-based pagination**.

### Why cursor-based, not OFFSET?

`OFFSET` is broken for live data:

```sql
-- If 50 rows are inserted above, this now returns DIFFERENT rows than before
SELECT * FROM products ORDER BY created_at DESC LIMIT 20 OFFSET 40
```

With a cursor, you bookmark the last item you saw:

```sql
-- "Give me items strictly older than this item" — new insertions above don't affect this
SELECT * FROM products
WHERE (created_at < $1 OR (created_at = $1 AND id < $2))
ORDER BY created_at DESC, id DESC
LIMIT 20
```

New products inserted while browsing appear only when the user goes back to page 1. Pages 2+ are unaffected. No duplicates, no skips.

### Why composite cursor `(created_at, id)`?

`created_at` alone isn't unique — bulk-inserted products share timestamps. Adding `id` as a tiebreaker makes every cursor position exact.

### Indexes (critical for speed on 200k rows)

```sql
-- All products, newest first
CREATE INDEX idx_products_cursor ON products (created_at DESC, id DESC);

-- Category filter + cursor
CREATE INDEX idx_products_category_cursor ON products (category, created_at DESC, id DESC);
```

Without these, each paginated query is a full table scan. With them, Postgres jumps straight to the cursor position.

---

## Tech Stack

| Layer    | Choice          | Why |
|----------|-----------------|-----|
| Backend  | Node.js + Express | Familiar, fast to set up |
| Database | PostgreSQL (Neon) | Free hosted Postgres, great for cursor queries |
| Frontend | Vanilla HTML/CSS/JS | No build step, deploys anywhere, fast |

---

## Project Structure

```
codevector-task/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app entry
│   │   ├── db.js             # PG pool + DB init
│   │   ├── seed.js           # Bulk seed script (200k rows)
│   │   └── routes/
│   │       └── products.js   # Cursor pagination API
│   ├── .env.example
│   └── package.json
└── frontend/
    └── public/
        └── index.html        # Full UI (single file)
```

---

## Local Setup

### 1. Database (Neon — free, no credit card)

1. Go to [neon.tech](https://neon.tech) → create a project
2. Copy the connection string from the dashboard
3. It looks like: `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`

### 2. Backend

```bash
cd backend
npm install

# Create .env from example
cp .env.example .env
# Edit .env → paste your DATABASE_URL

# Seed 200k products (~10-15 seconds)
npm run seed

# Start server
npm start
# → http://localhost:3000
```

### 3. Frontend

```bash
# Just open the file — no build needed
open frontend/public/index.html
```

Update `API_BASE` in `index.html` to your backend URL for production.

---

## API

### `GET /api/products`

Query params:
- `limit` — items per page (default: 20, max: 100)
- `cursor` — base64-encoded bookmark from previous response
- `category` — filter by category name

```json
// Response
{
  "data": [
    {
      "id": "uuid",
      "name": "Premium Widget 1",
      "category": "Electronics",
      "price": "4299.00",
      "created_at": "2024-08-15T10:23:00Z",
      "updated_at": "2024-08-20T14:00:00Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNC0wOC0xNVQxMDoyMzowMFoiLCJpZCI6InV1aWQifQ==",
  "hasMore": true,
  "count": 20
}
```

Use `nextCursor` as the `cursor` param for the next page.

### `GET /api/products/categories`
Returns all available category names.

### `GET /api/products/stats`
Returns total product count and count per category.

### `GET /health`
Health check endpoint.

---

## Deploy on Render (free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo, set root directory to `backend/`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variable: `DATABASE_URL = your_neon_url`
7. Deploy → copy your Render URL

---

## Seed Script — How It Works

The naive approach (200,000 individual INSERTs in a loop) would take ~5 minutes. Instead, the seed script uses **PostgreSQL's `unnest()`**:

```js
// Build arrays of 10,000 items at once
await client.query(`
  INSERT INTO products (id, name, category, price, created_at, updated_at)
  SELECT
    unnest($1::uuid[]),
    unnest($2::text[]),
    unnest($3::text[]),
    unnest($4::numeric[]),
    unnest($5::timestamptz[]),
    unnest($6::timestamptz[])
`, [ids, names, categories, prices, createdAts, updatedAts]);
```

20 batches × 10,000 rows = 200,000 rows in **~8–12 seconds** instead of minutes.

---

## What I'd Improve With More Time

1. **Search** — full-text search on product name using `pg_trgm` or a `tsvector` column
2. **Sort options** — sort by price, updated_at with cursor support for each
3. **Redis cache** — cache page 1 (highest traffic) for 30s, invalidate on new inserts
4. **Rate limiting** — `express-rate-limit` to prevent abuse
5. **Input validation** — zod/joi schemas on query params
6. **Tests** — Jest integration tests for the pagination logic edge cases
7. **Simulate live changes** — a small script that inserts/updates products every few seconds so the cursor stability can be demoed live

---

## How I Used AI

- **Understood cursor pagination tradeoffs**: Used Claude to understand why `(created_at, id)` composite cursor is needed vs just `id` or just `created_at`
- **Scaffolding speed**: Express boilerplate, CORS setup, dotenv config — AI generated, I reviewed
- **Seed script optimization**: AI suggested the `unnest()` approach, I understood *why* it's faster (one round trip vs 200k)
- **What AI got wrong**: Initially suggested `OFFSET`-based pagination — I caught this and replaced with cursor approach after understanding the problem
- **What I wrote myself**: The pagination query logic with the `OR (created_at = $1 AND id < $2)` tiebreaker — spent time understanding this properly since it's the core of the task

---

## Questions?

Reach out at `siddharth@codevector.in`
