# Market Timing Configuration Report

## Executive Summary

The Matka Admin Panel uses a **HH:mm string format** (24-hour) for market openTime and closeTime values stored in the database. **There are currently NO active validation constraints** preventing markets from opening after 23:59 or late-night hours. The testing documentation describes the intended validation logic, but it has not been implemented in the codebase yet.

---

## 1. DATABASE SCHEMA & STORAGE

### Market Tables
Two market tables exist in the database:

#### Table: `markets` (Original)
```sql
CREATE TABLE "markets" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "open_time" text NOT NULL,          -- Stored as HH:mm string (e.g., "09:00")
    "close_time" text NOT NULL,         -- Stored as HH:mm string (e.g., "11:00")
    "is_active" boolean DEFAULT true,
    "open_result" text,
    "close_result" text,
    "jodi_result" text,
    "auto_update" boolean DEFAULT false,
    "source_url" text,
    "last_fetched_at" timestamp,
    "fetch_error" text,
    "created_at" timestamp DEFAULT now()
);
```

#### Table: `markets2` (Extended/Alternate)
```sql
CREATE TABLE "markets2" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "open_time" text NOT NULL,          -- Stored as HH:mm string
    "close_time" text NOT NULL,         -- Stored as HH:mm string
    "is_active" boolean DEFAULT true,
    "openResult" text,
    "closeResult" text,
    "jodiResult" text,
    "auto_update" boolean DEFAULT false,
    "source_url" text,
    "last_fetched_at" timestamp,
    "fetch_error" text,
    "created_at" timestamp DEFAULT now()
);
```

### Schema Details

**File Location:** [lib/db/src/schema/markets.ts](lib/db/src/schema/markets.ts)

```typescript
export const marketsTable = pgTable("markets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  openTime: text("open_time").notNull(),              // ← No validation here
  closeTime: text("close_time").notNull(),            // ← No validation here
  isActive: boolean("is_active").notNull().default(true),
  // ... other fields
});
```

**⚠️ No database-level constraints on time values**

---

## 2. CURRENT MARKET CONFIGURATION

### Default/Seeded Markets

**File:** [scripts/src/seed-demo.ts](scripts/src/seed-demo.ts)

```
Market 1: Morning Market
  - openTime: 09:00
  - closeTime: 11:00
  
Market 2: Evening Market
  - openTime: 16:00
  - closeTime: 18:00
  
Market 3: Test Market - 02:46
  - openTime: 02:46           ← ⚠️ Late-night opening already in seeds
  - closeTime: 11:59          ← ⚠️ Edge case closeTime
```

---

## 3. DATA VALIDATION LAYER

### API Zod Schemas

**File:** [lib/api-zod/src/generated/api.js](lib/api-zod/src/generated/api.js)

```javascript
export const CreateMarketBody = zod.object({
    name: zod.string(),
    openTime: zod.string(),                    // ← Basic string validation only
    closeTime: zod.string(),                   // ← No HH:mm format check
    isActive: zod.boolean(),
});

export const UpdateMarketBody = zod.object({
    name: zod.string(),
    openTime: zod.string(),                    // ← No format/time constraints
    closeTime: zod.string(),                   // ← No format/time constraints
    isActive: zod.boolean(),
});
```

**✅ What IS validated:**
- Both fields must be strings
- Both fields must be present

**❌ What is NOT validated:**
- Time format (HH:mm)
- Valid time range (00:00-23:59)
- OpenTime < CloseTime logic
- No constraint on late-night times
- No constraint on 23:59+ times

---

## 4. ADMIN UI FOR MARKET CREATION

### Market Management Interface

**File:** [artifacts/admin-panel/src/pages/markets.tsx](artifacts/admin-panel/src/pages/markets.tsx)

```typescript
const marketSchema = z.object({
  name: z.string().min(1, "Name is required"),
  openTime: z.string().min(1, "Open time is required"),    // ← String validation only
  closeTime: z.string().min(1, "Close time is required"),  // ← String validation only
  isActive: z.boolean(),
});
```

**UI Implementation:**
```tsx
<Label>Open Time</Label>
<Input type="time" {...form.register("openTime")} className="rounded-xl" />

<Label>Close Time</Label>
<Input type="time" {...form.register("closeTime")} className="rounded-xl" />
```

**✅ Browser-level validation:**
- HTML5 `type="time"` input provides client-side picker
- Defaults: openTime = "09:00", closeTime = "21:00"

**❌ What's missing:**
- No server-side validation of format
- No constraint on late-night hours
- No validation that openTime < closeTime
- No prevention of 23:59+ times

---

## 5. BIDDING TIME CONSTRAINTS

### Current Bidding Logic

**File:** [src/routes/user.ts](src/routes/user.ts)  
**POST `/user/bids` endpoint**

```typescript
router.post("/user/bids", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const parsed = PlaceBidBody.safeParse(req.body);
  
  // Check if market exists and is active
  const [market] = await db.select().from(marketsTable).where(and(
    eq(marketsTable.id, marketId),
    eq(marketsTable.isActive, true)
  ));

  if (!market) {
    res.status(404).json({ error: "Market not found or market is inactive" });
    return;
  }

  // ✅ Check user balance
  const currentBalance = parseFloat(user.walletBalance as string);
  if (currentBalance < amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // ❌ NO TIME-BASED VALIDATION HERE
  // ❌ NO CHECK IF currentTime >= openTime && currentTime < closeTime
  
  // Bid is placed unconditionally...
  await db.transaction(async (tx) => {
    const [bid] = await tx.insert(bidsTable).values({
      userId,
      marketId,
      marketName: market.name,
      gameType,
      amount: amount.toString(),
      number,
      openTime: market.openTime,        // ← Stored for reference
      closeTime: market.closeTime,      // ← Stored for reference
      currentTime,                      // ← Current timestamp at time of bid
    }).returning();
  });
});
```

**✅ Current Validations:**
1. Market exists and is active
2. User has sufficient balance
3. Valid bid number format for game type
4. No duplicate bids

**❌ Missing Time Validations:**
1. No check if `currentTime >= market.openTime`
2. No check if `currentTime < market.closeTime`
3. No rejection of bids placed outside bidding window
4. No 23:59 constraint

---

## 6. DOCUMENTED INTENDED BEHAVIOR (Not Yet Implemented)

**File:** [scripts/MARKET_TESTING_GUIDE.md](scripts/MARKET_TESTING_GUIDE.md)

### Expected Market Timing Constraints

```
Current Time Validation (Intended Logic - NOT YET IMPLEMENTED):
├─ if (currentTime < openTime)
│  └─ Error: "Market not yet open for bidding"
├─ if (openTime ≤ currentTime < closeTime)
│  └─ ✅ Accept bid
└─ if (currentTime ≥ closeTime)
   └─ Error: "Bidding closed for this market"

Note: Bid at closeTime is REJECTED (uses ≥ comparison)
```

### Test Case Examples (From Documentation)

| Time  | Market | Result | Code | Error |
|-------|--------|--------|------|-------|
| 08:50 | Morning (09:00-11:00) | ❌ FAIL | 400 | `Market not yet open for bidding` |
| 09:00 | Morning (09:00-11:00) | ✅ PASS | 201 | (accept bid) |
| 11:00 | Morning (09:00-11:00) | ❌ FAIL | 400 | `Bidding closed for this market` |
| 02:45 | Test Market (02:46-11:59) | ❌ FAIL | 400 | `Market not yet open for bidding` |
| 11:59 | Test Market (02:46-11:59) | ❌ FAIL | 400 | `Bidding closed for this market` |

⚠️ **IMPORTANT:** These behavior descriptions exist ONLY in documentation files. The actual backend code does NOT enforce these constraints.

---

## 7. MARKET TIMING HELPER FUNCTIONS

### Time Parsing Functions

**File:** [src/lib/date-utils.ts](src/lib/date-utils.ts)

```typescript
export function getNowIST(): Date {
  const now = new Date();
  const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);  // IST = UTC+5:30
  return istTime;
}

export function getTodayDateIST(): string {
  const now = getNowIST();
  return format(now, "yyyy-MM-dd");
}
```

### Time String Parsing (Scraper Logic)

**File:** [src/lib/scraper.ts](src/lib/scraper.ts)

```typescript
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hoursStr, minutesStr] = timeStr.split(":");
  return {
    hours: parseInt(hoursStr),
    minutes: parseInt(minutesStr),
  };
}

// Used for checking if after 10-minute window post-open
function isAfterOpenWindow(openTime: string): boolean {
  const { hours: openHour, minutes: openMin } = parseTimeString(openTime);
  const openTimeInMinutes = openHour * 60 + openMin + 10;  // +10 for fetch window
  
  const now = getNowIST();
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
  
  return currentTimeInMinutes >= openTimeInMinutes;
}
```

**Note:** Time comparison functions exist but are used only for **scraper result fetching**, not for bid placement validation.

---

## 8. MARKET ENDPOINTS

### Admin Endpoints (Market CRUD)

| Endpoint | Method | Auth | Time Validation |
|----------|--------|------|-----------------|
| `/api/markets` | POST | ✅ Admin | ❌ None |
| `/api/markets/:id` | PUT | ✅ Admin | ❌ None |
| `/api/markets` | GET | ✅ User | N/A |
| `/api/markets/:id` | GET | ✅ User | N/A |
| `/api/markets/:id` | DELETE | ✅ Admin | N/A |

**Admin can create/update markets with any openTime/closeTime values** - no validation.

### User Bidding Endpoints

| Endpoint | Method | Auth | Time Validation |
|----------|--------|------|-----------------|
| `POST /api/user/bids` | POST | ✅ User | ❌ None |
| `POST /api/user/markets2-bids` | POST | ✅ User | ❌ None |

**Users can place bids at ANY time** - no openTime/closeTime check.

---

## 9. WHAT IS CURRENTLY POSSIBLE

### ✅ Currently Allowed (No Restrictions)

1. **Create market with any time:**
   ```javascript
   POST /api/markets (admin)
   {
     "name": "Midnight Market",
     "openTime": "23:45",     // ✅ Allowed - no validation
     "closeTime": "23:59",    // ✅ Allowed - no validation
     "isActive": true
   }
   ```

2. **Create market that spans midnight:**
   ```javascript
   {
     "name": "Late Night",
     "openTime": "22:00",     // ✅ Allowed
     "closeTime": "23:59",    // ✅ Allowed  
     "isActive": true
   }
   ```

3. **Place bids at any time:**
   ```javascript
   POST /api/user/bids (user)
   {
     "marketId": 1,
     "gameType": "single_digit",
     "number": "5",
     "amount": 100
   }
   // ✅ Allowed even if market is closed
   // ✅ Allowed even if market hasn't opened yet
   ```

4. **Create openTime > closeTime:**
   ```javascript
   {
     "name": "Backwards Market",
     "openTime": "18:00",     // ✅ Allowed
     "closeTime": "09:00",    // ✅ Allowed (would be next day)
     "isActive": true
   }
   ```

### ❌ Currently Restricted (By Active Code)

1. User cannot place bid if:
   - Market is inactive (`isActive: false`)
   - Market doesn't exist
   - User balance < bid amount
   - Duplicate bid for same market/gameType/number/user combination

2. Admin cannot access market endpoints without authentication token

---

## 10. TIME ZONE HANDLING

### IST (Indian Standard Time) Used
- **UTC Offset:** +5:30
- **Conversion Function:** [src/lib/date-utils.ts - getNowIST()](src/lib/date-utils.ts)

```typescript
const now = new Date();
const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
```

**Implications:**
- All market times should be in IST
- Server converts system time to IST automatically
- Bid timestamps stored in IST

---

## 11. FILES INVOLVED IN MARKET TIMING

### Database
- [lib/db/drizzle/0000_heavy_tarot.sql](lib/db/drizzle/0000_heavy_tarot.sql) - Initial schema
- [lib/db/drizzle/0004_markets2.sql](lib/db/drizzle/0004_markets2.sql) - Markets2 table
- [lib/db/src/schema/markets.ts](lib/db/src/schema/markets.ts) - Markets schema
- [lib/db/src/schema/markets2.ts](lib/db/src/schema/markets2.ts) - Markets2 schema

### Backend Routes
- [src/routes/markets.ts](src/routes/markets.ts) - Market CRUD endpoints
- [src/routes/markets2.ts](src/routes/markets2.ts) - Market2 CRUD endpoints  
- [src/routes/user.ts](src/routes/user.ts) - User bidding endpoints
- [src/routes/bids.ts](src/routes/bids.ts) - Bid processing endpoints

### Validation
- [lib/api-zod/src/generated/api.js](lib/api-zod/src/generated/api.js) - Zod schemas
- [src/routes/user.ts - isValidBidNumber()](src/routes/user.ts#L9) - Number validation only

### Admin UI
- [artifacts/admin-panel/src/pages/markets.tsx](artifacts/admin-panel/src/pages/markets.tsx) - Markets page
- [artifacts/admin-panel/src/pages/markets2.tsx](artifacts/admin-panel/src/pages/markets2.tsx) - Markets2 page

### Utilities
- [src/lib/date-utils.ts](src/lib/date-utils.ts) - IST time conversion
- [src/lib/scraper.ts](src/lib/scraper.ts) - Result scraping (uses time windows)
- [src/lib/scheduler.ts](src/lib/scheduler.ts) - Market activity scheduling

### Documentation
- [scripts/MARKET_TESTING_GUIDE.md](scripts/MARKET_TESTING_GUIDE.md) - Intended timing behavior (not implemented)

---

## 12. RECOMMENDATIONS

### To Implement Market Timing Constraints:

1. **Add Zod Validation for Time Format:**
   ```typescript
   openTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
   closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
   ```

2. **Add Time Range Validation:**
   ```typescript
   .refine(
     (data) => {
       const [openH, openM] = data.openTime.split(":").map(Number);
       const [closeH, closeM] = data.closeTime.split(":").map(Number);
       return (openH * 60 + openM) < (closeH * 60 + closeM);
     },
     { message: "Open time must be before close time" }
   )
   ```

3. **Add Bid Time Validation in `/api/user/bids`:**
   ```typescript
   // Parse market times
   const [openH, openM] = market.openTime.split(":").map(Number);
   const [closeH, closeM] = market.closeTime.split(":").map(Number);
   
   const now = getNowIST();
   const currentMin = now.getHours() * 60 + now.getMinutes();
   const openMin = openH * 60 + openM;
   const closeMin = closeH * 60 + closeM;
   
   if (currentMin < openMin) {
     return res.status(400).json({ error: "Market not yet open for bidding" });
   }
   if (currentMin >= closeMin) {
     return res.status(400).json({ error: "Bidding closed for this market" });
   }
   ```

4. **Optional: Add Database Check Constraint:**
   ```sql
   ALTER TABLE markets ADD CONSTRAINT valid_open_close_time
   CHECK (open_time < close_time);
   ```

---

## 13. SUMMARY TABLE

| Aspect | Current Status | Details |
|--------|---|---------|
| **Data Storage** | HH:mm strings | No format validation |
| **Format Validation** | ❌ Missing | Accept any string |
| **Range Validation** | ❌ Missing | No 00:00-23:59 check |
| **Logic (openTime < closeTime)** | ❌ Missing | Allows backwards times |
| **Bid Time Check** | ❌ Missing | No market window validation |
| **23:59+ Constraint** | ❌ None | Late-night markets allowed |
| **Admin UI** | HTML5 time input | Basic browser validation |
| **Documentation** | Describes intended behavior | Not yet implemented |
| **Time Zone** | IST (UTC+5:30) | Correct for Indian market |

---

## 14. EXAMPLE QUERIES

To inspect current market configuration:

```sql
-- All markets with their timings
SELECT id, name, open_time, close_time, is_active FROM markets;

-- Markets with late-night opening
SELECT id, name, open_time, close_time FROM markets WHERE open_time >= '20:00';

-- Find potentially problematic timings
SELECT id, name, open_time, close_time FROM markets 
WHERE open_time >= close_time OR open_time > '23:00';
```

---

## Conclusion

**The codebase currently allows:**
- Markets to open at any time (including after 23:59)
- Markets with invalid time ranges
- Users to place bids outside market hours

**No implementation exists for the documented timing constraints** shown in the testing guide. These appear to be planned features based on the documentation, but the actual validation logic has not been added to the backend code.
