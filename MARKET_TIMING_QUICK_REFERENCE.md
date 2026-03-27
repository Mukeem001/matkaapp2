# Market Timing Configuration - Quick Reference

## TL;DR

| Question | Answer |
|----------|---------|
| **Where are openTime values stored?** | Database as `text` fields in HH:mm format (e.g., "09:00") |
| **Current openTime values for markets** | Morning: 09:00, Evening: 16:00, Test Market: 02:46 |
| **Any logic preventing 23:59+ openings?** | ❌ **NO** - No validation exists |
| **How configured?** | Admin UI with HTML5 time picker (no backend validation) |
| **Can users bid outside market hours?** | ✅ **YES** - No time-based bidding restrictions |
| **Is there openTime < closeTime validation?** | ❌ **NO** - You could set openTime=18:00, closeTime=09:00 |

---

## Current Market Times in Database

```
markets table:
├── Morning Market:     09:00 → 11:00 ✅
├── Evening Market:     16:00 → 18:00 ✅
└── Test Market-02:46:  02:46 → 11:59 ⚠️ (late-night opening)

markets2 table:
└── (Same structure, no defaults configured)
```

---

## Where Market Times Are Configured

### 1️⃣ Database Schema
- **Tables:** `markets` and `markets2`
- **Columns:** `open_time` and `close_time` (text type)
- **No constraints:** Any string value accepted

### 2️⃣ Seed Data
- **File:** [scripts/src/seed-demo.ts](scripts/src/seed-demo.ts)
- **Hardcoded:** Three default markets with fixed times
- **Sample:** Morning (09:00-11:00), Evening (16:00-18:00), Late (02:46-11:59)

### 3️⃣ Admin UI
- **File:** [artifacts/admin-panel/src/pages/markets.tsx](artifacts/admin-panel/src/pages/markets.tsx)
- **Input:** HTML5 `<input type="time">`
- **Defaults:** 09:00 open, 21:00 close
- **Validation:** Frontend only (browser built-in)

### 4️⃣ API Endpoints
- **Create:** `POST /api/markets` (admin only)
- **Update:** `PUT /api/markets/:id` (admin only)
- **Zod Validation:** Only checks `typeof string`, no format/value validation

---

## Time Validation Status

```
┌─ Database Level
│  ├─ Format Validation:  ❌ NO
│  ├─ Range Check:        ❌ NO
│  └─ Logic (open<close): ❌ NO
│
├─ API Validation Layer
│  ├─ Format Check:       ❌ NO (accepts any string)
│  ├─ Time Value Check:   ❌ NO
│  ├─ Bid Window Check:   ❌ NO
│  └─ 23:59+ Constraint:  ❌ NO
│
├─ Frontend
│  ├─ HTML5 Picker:       ✅ YES (format: HH:mm)
│  └─ Server Override:    ❌ Can bypass with direct API
│
└─ Business Logic
   ├─ Enforce Bidding Hours: ❌ NO
   └─ Result Fetch Timing:   ⚠️ YES (but based on openTime + 10min)
```

---

## What Can Currently Be Done ✅ (No Restrictions)

```javascript
// Create a market with ANY time
POST /api/markets
{
  "name": "Midnight Market",
  "openTime": "23:45",      // ✅ Allowed
  "closeTime": "23:59",     // ✅ Allowed
  "isActive": true
}

// Backwards market (opens after close)
{
  "name": "Backwards",
  "openTime": "18:00",      // ✅ Creates today's 18:00
  "closeTime": "09:00",     // ✅ Would be next day's 09:00?
  "isActive": true
}

// Place bid at any time
POST /api/user/bids
{
  "marketId": 1,
  "gameType": "single_digit",
  "number": "5",
  "amount": 100
}
// ✅ Succeeds even if market is closed or not open yet
```

---

## What Can't Be Done ❌ (Actual Restrictions)

```javascript
// Place bid with inactive market
{
  "marketId": 999,  // doesn't exist
  "gameType": "jodi",
  "number": "45",
  "amount": 100
}
// ❌ Error: Market not found

// Duplicate bid
// Same user, market, gameType, number
// ❌ Error: Duplicate bid not allowed

// Insufficient balance
// wallet has ₹50, bid amount ₹100
// ❌ Error: Insufficient balance
```

---

## File Locations Reference

### Market Definition
- Schema: [lib/db/src/schema/markets.ts](lib/db/src/schema/markets.ts)
- Seeds: [scripts/src/seed-demo.ts](scripts/src/seed-demo.ts)  
- Migrations: [lib/db/drizzle/0000_heavy_tarot.sql](lib/db/drizzle/0000_heavy_tarot.sql)

### Admin Endpoints
- CRUD Routes: [src/routes/markets.ts](src/routes/markets.ts)
- Validation: [lib/api-zod/src/generated/api.js](lib/api-zod/src/generated/api.js)

### User Bidding  
- Bid Placement: [src/routes/user.ts - POST /user/bids](src/routes/user.ts#L129)
- Market Status: [src/routes/user.ts - GET /user/markets](src/routes/user.ts#L82)

### Admin UI
- Markets Page: [artifacts/admin-panel/src/pages/markets.tsx](artifacts/admin-panel/src/pages/markets.tsx)
- Markets2 Page: [artifacts/admin-panel/src/pages/markets2.tsx](artifacts/admin-panel/src/pages/markets2.tsx)

### Utilities
- Time Functions: [src/lib/date-utils.ts](src/lib/date-utils.ts)
- Scraper Logic: [src/lib/scraper.ts](src/lib/scraper.ts)

---

## Intended Behavior (Documented but NOT Implemented)

**File:** [scripts/MARKET_TESTING_GUIDE.md](scripts/MARKET_TESTING_GUIDE.md)

The documentation describes this logic (which doesn't actually run):

```
IF currentTime < market.openTime THEN
  Response: "Market not yet open for bidding"
  Status: 400
ELSE IF currentTime >= market.closeTime THEN
  Response: "Bidding closed for this market"
  Status: 400
ELSE
  Accept bid and deduct from wallet
  Status: 201
```

---

## Time Comparisons Happening

### ✅ For Result Scraping (Based on openTime + 10 minutes)
- **File:** [src/lib/scraper.ts](src/lib/scraper.ts)
- **Logic:** Fetch results 10 minutes after market opening
- **Purpose:** Auto-update market results after initial results come in

### ✅ For Market Activity Status
- **File:** [src/lib/scheduler.ts](src/lib/scheduler.ts)
- **Logic:** Market active until openTime + 10 minutes
- **Purpose:** Control result fetching window

### ❌ For Bid Placement (MISSING)
- No time window validation
- No openTime >= currentTime check
- No currentTime < closeTime check

---

## Database Queries for Current State

```sql
-- See all markets with their timing
SELECT id, name, open_time, closeTime, is_active, created_at 
FROM markets;

-- Find markets with late-night operations (after 20:00)
SELECT id, name, open_time, close_time 
FROM markets 
WHERE open_time >= '20:00' OR close_time >= '20:00';

-- Check if any have invalid configurations
SELECT id, name, open_time, close_time 
FROM markets 
WHERE open_time >= close_time;

-- See recent market activity
SELECT id, name, last_fetched_at, auto_update, source_url
FROM markets
ORDER BY last_fetched_at DESC;
```

---

## Key Takeaways

1. **No validation exists** for market opening times after 23:59
2. **Times stored as strings** in HH:mm format (e.g., "09:00")
3. **Admin can create invalid timings** (backwards, late-night, etc.)
4. **Users can bid anytime** - no hour-based restrictions
5. **Documented behavior exists** in testing guide but not implemented in code
6. **IST timezone used** (UTC+5:30) for all time operations
7. **Time comparisons only used** for result scraping, not bidding validation

---

## To Implement Timing Constraints

See [MARKET_TIMING_CONFIGURATION_REPORT.md](MARKET_TIMING_CONFIGURATION_REPORT.md) section "Recommendations" for implementation details.
