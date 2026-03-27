# Market Timing - Code Analysis & Gap Report

## Where Bidding Time Validation Should Be (But Isn't)

### Current Code (Missing Validation)

**File:** [src/routes/user.ts](src/routes/user.ts) - Lines 129-220

```typescript
router.post("/user/bids", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const parsed = PlaceBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { marketId, gameType, number, amount } = parsed.data;
  const userId = req.userId!;

  // ✅ Check if market exists and is active
  const [market] = await db.select().from(marketsTable).where(and(
    eq(marketsTable.id, marketId),
    eq(marketsTable.isActive, true)
  ));

  if (!market) {
    res.status(404).json({ error: "Market not found or market is inactive" });
    return;
  }

  // ✅ Check user balance and status
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.isBlocked) {
    res.status(403).json({ error: "User not found or blocked" });
    return;
  }

  const currentBalance = parseFloat(user.walletBalance as string);
  if (currentBalance < amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;  
  }

  // ✅ Validate bid number format based on game type
  if (!isValidBidNumber(gameType, number)) {
    res.status(400).json({ error: "Invalid bid number for selected game type" });
    return;
  }

  // ✅ Check for duplicate bid
  const [existingBid] = await db.select()
    .from(bidsTable)
    .where(and(
      eq(bidsTable.userId, userId),
      eq(bidsTable.marketId, marketId),
      eq(bidsTable.gameType, gameType),
      eq(bidsTable.number, number)
    ));

  if (existingBid) {
    res.status(409).json({ error: "Duplicate bid not allowed" });
    return;
  }

  // ❌ ❌ ❌ MISSING: TIME-BASED VALIDATION ❌ ❌ ❌
  // No check for: currentTime >= market.openTime
  // No check for: currentTime < market.closeTime
  // No error response for bidding outside market hours
  // No 23:59 constraint

  // Bid is accepted unconditionally...
  await db.transaction(async (tx) => {
    // Deduct balance
    await tx.update(usersTable)
      .set({ walletBalance: sql`${usersTable.walletBalance} - ${amount}` })
      .where(eq(usersTable.id, userId));

    // Create bid with all details
    const currentTime = new Date();
    const [bid] = await tx.insert(bidsTable)
      .values({
        userId,
        marketId,
        marketName: market.name,
        gameType,
        amount: amount.toString(),
        number,
        openTime: market.openTime,      // ← Stored for reference only
        closeTime: market.closeTime,    // ← Stored for reference only
        currentTime,
      })
      .returning();

    res.status(201).json({
      bid: {
        id: bid.id,
        marketId: bid.marketId,
        marketName: bid.marketName,
        gameType: bid.gameType,
        amount: parseFloat(bid.amount as string),
        number: bid.number,
        openTime: bid.openTime,
        closeTime: bid.closeTime,
        currentTime: bid.currentTime?.toISOString() ?? null,
        status: bid.status,
        createdAt: bid.createdAt.toISOString(),
      },
    });
  });
});
```

---

## What Should Be Added

### Option 1: Simple Time Comparison (Recommended)

```typescript
// Add this BEFORE the duplicate bid check:

// ❌ NEW: Check if market is within bidding hours
const now = getNowIST();  // IST timezone
const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

// Parse market times
const [openHours, openMinutes] = market.openTime.split(':').map(Number);
const [closeHours, closeMinutes] = market.closeTime.split(':').map(Number);

const marketOpenMinutes = openHours * 60 + openMinutes;
const marketCloseMinutes = closeHours * 60 + closeMinutes;

// Validate bidding window
if (currentTimeMinutes < marketOpenMinutes) {
  res.status(400).json({ 
    error: "Market not yet open for bidding",
    openTime: market.openTime 
  });
  return;
}

if (currentTimeMinutes >= marketCloseMinutes) {
  res.status(400).json({ 
    error: "Bidding closed for this market",
    closeTime: market.closeTime 
  });
  return;
}
```

### Option 2: Helper Function (Cleaner)

```typescript
// Add to src/lib/time-utils.ts (new file)
import { getNowIST } from './date-utils';

export function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hoursStr, minutesStr] = timeStr.split(":");
  return {
    hours: parseInt(hoursStr, 10),
    minutes: parseInt(minutesStr, 10),
  };
}

export function isWithinMarketHours(
  openTime: string,
  closeTime: string,
  now?: Date
): {
  isOpen: boolean;
  status: 'before_open' | 'open' | 'closed';
  currentMinutes: number;
  openMinutes: number;
  closeMinutes: number;
} {
  const current = now || getNowIST();
  const currentMinutes = current.getHours() * 60 + current.getMinutes();

  const { hours: openH, minutes: openM } = parseTimeString(openTime);
  const openMinutes = openH * 60 + openM;

  const { hours: closeH, minutes: closeM } = parseTimeString(closeTime);
  const closeMinutes = closeH * 60 + closeM;

  let status: 'before_open' | 'open' | 'closed';
  let isOpen: boolean;

  if (currentMinutes < openMinutes) {
    status = 'before_open';
    isOpen = false;
  } else if (currentMinutes >= closeMinutes) {
    status = 'closed';
    isOpen = false;
  } else {
    status = 'open';
    isOpen = true;
  }

  return {
    isOpen,
    status,
    currentMinutes,
    openMinutes,
    closeMinutes,
  };
}

// Usage in routes/user.ts:
import { isWithinMarketHours } from '../lib/time-utils';

const timeCheck = isWithinMarketHours(market.openTime, market.closeTime);

if (!timeCheck.isOpen) {
  if (timeCheck.status === 'before_open') {
    res.status(400).json({ 
      error: "Market not yet open for bidding",
      openTime: market.openTime,
      opens: new Date().setHours(
        Math.floor(timeCheck.openMinutes / 60),
        timeCheck.openMinutes % 60
      )
    });
  } else {
    res.status(400).json({ 
      error: "Bidding closed for this market",
      closeTime: market.closeTime 
    });
  }
  return;
}
```

---

## Validation Layer - What's Missing

### Current Zod Schema (Insufficient)

**File:** [lib/api-zod/src/generated/api.js](lib/api-zod/src/generated/api.js)

```javascript
// ❌ Current - Too permissive
export const CreateMarketBody = zod.object({
    name: zod.string(),
    openTime: zod.string(),           // ← Any string accepted
    closeTime: zod.string(),          // ← Any string accepted
    isActive: zod.boolean(),
});
```

### Should Be Updated To:

```typescript
// ✅ Improved validation
import { z } from "zod/v4";

const timeFormatSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Time must be in HH:mm format")
  .refine(
    (time) => {
      const [hours, minutes] = time.split(":").map(Number);
      return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
    },
    "Time must be between 00:00 and 23:59"
  );

export const CreateMarketBody = zod
  .object({
    name: zod.string().min(1, "Name required"),
    openTime: timeFormatSchema,
    closeTime: timeFormatSchema,
    isActive: zod.boolean(),
  })
  // ✅ Custom validation: openTime must be before closeTime
  .refine(
    (data) => {
      const [openH, openM] = data.openTime.split(":").map(Number);
      const [closeH, closeM] = data.closeTime.split(":").map(Number);
      
      // If times are on same day, open must be before close
      // (Note: doesn't handle cross-midnight markets like 22:00-02:00)
      if (openH !== closeH) {
        return openH < closeH;
      }
      return openM < closeM;
    },
    {
      message: "Open time must be before close time",
      path: ["openTime"],
    }
  );

export const UpdateMarketBody = CreateMarketBody;
```

---

## API Validation Endpoints

### Current State - No Format Validation

**POST /api/markets** (admin)

```bash
curl -X POST "http://localhost:3000/api/markets" \
  -H "Authorization: Bearer adminToken" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Market",
    "openTime": "not-a-time",      # ✅ Accepted (shouldn't be)
    "closeTime": "also-not-valid",  # ✅ Accepted (shouldn't be)
    "isActive": true
  }'

# Response: 201 Created ❌
# Should be: 400 Bad Request
```

### With Proper Validation

```bash
# Same request
# Response: 400 Bad Request
# Error: "Time must be in HH:mm format"
```

---

## Database Constraints (Optional but Recommended)

### Add Check Constraint

```sql
-- Ensure time format is valid HH:mm
ALTER TABLE markets 
ADD CONSTRAINT valid_time_format_open_time
CHECK (open_time ~ '^\d{2}:\d{2}$');

ALTER TABLE markets 
ADD CONSTRAINT valid_time_format_close_time
CHECK (close_time ~ '^\d{2}:\d{2}$');

-- Ensure open_time comes before close_time
-- Note: Requires function to convert HH:mm to minutes
ALTER TABLE markets 
ADD CONSTRAINT valid_market_hours
CHECK (
  (SPLIT_PART(open_time, ':', 1)::INT * 60 + SPLIT_PART(open_time, ':', 2)::INT) <
  (SPLIT_PART(close_time, ':', 1)::INT * 60 + SPLIT_PART(close_time, ':', 2)::INT)
);
```

---

## Markets2 Table - Same Gaps

**File:** [src/routes/markets2.ts](src/routes/markets2.ts)

```typescript
// ❌ Same issue exists here
router.post("/markets2", authMiddleware, async (req, res): Promise<void> => {
  try {
    const body = CreateMarketBody.safeParse(req.body);  // ← No format validation
    if (!body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const result = await db.insert(markets2Table).values(body.data).returning();
    // ❌ No time-based bidding validation in markets2 either
    // ...
  }
});
```

---

## Time Utility Functions Available

### Can Reuse From Scraper Code

**File:** [src/lib/scraper.ts](src/lib/scraper.ts)

```typescript
// ✅ Already exists - can be reused
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hoursStr, minutesStr] = timeStr.split(":");
  return {
    hours: parseInt(hoursStr),
    minutes: parseInt(minutesStr),
  };
}

// ✅ Can adapt for bidding validation
const { hours: openHour, minutes: openMin } = parseTimeString(market.openTime);
const openWindowEndMinutes = openHour * 60 + openMin + 10;  // For scraping

const now = getNowIST();
const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

return currentTimeInMinutes >= openWindowEndMinutes;
```

---

## Test Cases to Add

### In [scripts/MARKET_TESTING_GUIDE.md](scripts/MARKET_TESTING_GUIDE.md)

```javascript
// Test 1: Bid before market opens
GET http://localhost:3000/api/user/bids (auth header)
POST body: {
  "marketId": 1,
  "gameType": "jodi",
  "number": "45",
  "amount": 100
}
// When run 30 minutes BEFORE market openTime
// Expected: 400 Bad Request - "Market not yet open for bidding"
// Current: 201 Created ❌

// Test 2: Bid after market closes
// When run 30 minutes AFTER market closeTime
// Expected: 400 Bad Request - "Bidding closed for this market"
// Current: 201 Created ❌

// Test 3: Bid during market hours
// When run between market openTime and closeTime
// Expected: 201 Created ✅
// Current: 201 Created ✅

// Test 4: Create market with invalid hour
POST /api/markets (admin)
{
  "name": "Bad Timing",
  "openTime": "25:00",      // Invalid hour
  "closeTime": "27:99",     // Invalid time
  "isActive": true
}
// Expected: 400 Bad Request - "Time must be in HH:mm format"
// Current: 201 Created ❌

// Test 5: Market with backwards times
POST /api/markets (admin)
{
  "name": "Backwards",
  "openTime": "18:00",
  "closeTime": "09:00",     // Before open time
  "isActive": true
}
// Expected: 400 Bad Request - "Open time must be before close time"
// Current: 201 Created ❌
```

---

## Summary of Gaps

| Feature | Status | Location | Impact |
|---------|--------|----------|--------|
| Time format validation | ❌ Missing | Zod schema | Any string accepted |
| Time range check (00:00-23:59) | ❌ Missing | Zod schema | Invalid times possible |
| openTime < closeTime validation | ❌ Missing | Zod schema | Backwards markets possible |
| Time-based bid acceptance | ❌ Missing | /api/user/bids | Bets outside hours accepted |
| 23:59+ constraint | ❌ Missing | Zod schema | Late-night markets allowed |
| Error messages | ✅ Documented | Testing guide | But not implemented |
| Time comparison logic | ⚠️ Partial | scraper.ts | Only for result fetching |
| IST timezone handling | ✅ Complete | date-utils.ts | Correct offset applied |

---

## Quick Implementation Checklist

- [ ] Add time format regex to Zod schema
- [ ] Add time range validation (00:00-23:59) to Zod
- [ ] Add openTime < closeTime cross-field validation
- [ ] Create `isWithinMarketHours()` helper function
- [ ] Add bid time window check in POST /api/user/bids
- [ ] Add bid time window check in POST /api/user/markets2-bids
- [ ] Add both error responses: "Market not yet open" and "Bidding closed"
- [ ] Update test guide with actual passing tests
- [ ] Add integration tests for time boundaries
- [ ] Consider database constraints for data integrity
- [ ] Document IST timezone usage requirement

---

## Files to Modify

1. `lib/api-zod/src/generated/api.js` - Zod schemas
2. `src/routes/user.ts` - Bid validation endpoint
3. `src/routes/bids2.ts` - Bid2 validation endpoint (if using)
4. `src/lib/time-utils.ts` - New file with time helpers
5. `scripts/MARKET_TESTING_GUIDE.md` - Update test cases
6. Optional: Database migrations for check constraints
