# Market Timing Logic Verification for Late-Night Markets

**Status:** ✅ **LOGIC IS CORRECT**

## Function Overview

Location: [src/lib/scheduler.ts](src/lib/scheduler.ts#L44-L68)

The `updateMarketActivityStatus()` function determines if a market should be active based on current time and market hours.

### Core Logic
```typescript
// Normal case: market operates within same day (e.g., 09:00 - 11:00)
if (openTimeInMinutes < closeTimeInMinutes) {
    shouldBeActive = currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes <= closeTimeInMinutes;
}
// Day-wrapping case: market spans midnight (e.g., 23:50 - 02:00)
else {
    shouldBeActive = currentTimeInMinutes >= openTimeInMinutes || currentTimeInMinutes <= closeTimeInMinutes;
}
```

---

## Verification: Test Case (23:45 - 02:00)

Market: **Midnight Market - 23:45** (openTime="23:45", closeTime="02:00")

### Time Conversions
- openTimeInMinutes = 23 × 60 + 45 = **1425 minutes**
- closeTimeInMinutes = 2 × 60 + 0 = **120 minutes**
- Condition: 1425 < 120? → **NO** (use day-wrapping logic)

---

### Test Point 1: 23:30 → Should be **INACTIVE** ✅
**Current Time:** 23:30 = 23 × 60 + 30 = 1410 minutes

```
shouldBeActive = (1410 >= 1425) || (1410 <= 120)
               = false || false
               = false ✅ INACTIVE (correct)
```
**Reason:** Before the market opens

---

### Test Point 2: 23:45 → Should be **ACTIVE** ✅
**Current Time:** 23:45 = 1425 minutes

```
shouldBeActive = (1425 >= 1425) || (1425 <= 120)
               = true || false
               = true ✅ ACTIVE (correct)
```
**Reason:** Exactly at openTime (boundary condition handled correctly)

---

### Test Point 3: 23:59 → Should be **ACTIVE** ✅
**Current Time:** 23:59 = 23 × 60 + 59 = 1439 minutes

```
shouldBeActive = (1439 >= 1425) || (1439 <= 120)
               = true || false
               = true ✅ ACTIVE (correct)
```
**Reason:** Between 23:45 and midnight

---

### Test Point 4: 00:00 (Midnight) → Should be **ACTIVE** ✅
**Current Time:** 00:00 = 0 × 60 + 0 = 0 minutes

```
shouldBeActive = (0 >= 1425) || (0 <= 120)
               = false || true
               = true ✅ ACTIVE (correct)
```
**Reason:** After midnight, within closeTime window of 02:00

---

### Test Point 5: 01:30 → Should be **ACTIVE** ✅
**Current Time:** 01:30 = 1 × 60 + 30 = 90 minutes

```
shouldBeActive = (90 >= 1425) || (90 <= 120)
               = false || true
               = true ✅ ACTIVE (correct)
```
**Reason:** Still within the 02:00 closeTime

---

### Test Point 6: 02:00 (Exactly at closeTime) → **ACTIVE** ✅
**Current Time:** 02:00 = 120 minutes

```
shouldBeActive = (120 >= 1425) || (120 <= 120)
               = false || true
               = true ✅ ACTIVE (correct)
```
**Reason:** Inclusive boundary at closeTime (market includes the close minute)

---

### Test Point 7: 02:01 → Should be **INACTIVE** ✅
**Current Time:** 02:01 = 2 × 60 + 1 = 121 minutes

```
shouldBeActive = (121 >= 1425) || (121 <= 120)
               = false || false
               = false ✅ INACTIVE (correct)
```
**Reason:** After closeTime

---

### Test Point 8: 12:00 (Daytime) → Should be **INACTIVE** ✅
**Current Time:** 12:00 = 12 × 60 + 0 = 720 minutes

```
shouldBeActive = (720 >= 1425) || (720 <= 120)
               = false || false
               = false ✅ INACTIVE (correct)
```
**Reason:** Outside market hours (daytime)

---

### Test Point 9: 22:00 (Before market opens) → Should be **INACTIVE** ✅
**Current Time:** 22:00 = 22 × 60 + 0 = 1320 minutes

```
shouldBeActive = (1320 >= 1425) || (1320 <= 120)
               = false || false
               = false ✅ INACTIVE (correct)
```
**Reason:** Before 23:45 opening time

---

## Verification: All Three Late-Night Markets

### Market 1: Late Night Market - 23:30 (openTime="23:30", closeTime="01:30")

- openTimeInMinutes = 1410
- closeTimeInMinutes = 90
- Condition: 1410 < 90? → **NO** (day-wrapping)

| Time | Minutes | Calculation | Result |
|------|---------|-------------|--------|
| 23:00 | 1380 | (1380≥1410)\|(1380≤90) = F\|F | ❌ INACTIVE |
| 23:30 | 1410 | (1410≥1410)\|(1410≤90) = T\|F | ✅ ACTIVE |
| 00:00 | 0 | (0≥1410)\|(0≤90) = F\|T | ✅ ACTIVE |
| 01:30 | 90 | (90≥1410)\|(90≤90) = F\|T | ✅ ACTIVE |
| 01:31 | 91 | (91≥1410)\|(91≤90) = F\|F | ❌ INACTIVE |
| 12:00 | 720 | (720≥1410)\|(720≤90) = F\|F | ❌ INACTIVE |

---

### Market 2: Midnight Market - 23:45 (openTime="23:45", closeTime="02:00")

- openTimeInMinutes = 1425
- closeTimeInMinutes = 120
- Condition: 1425 < 120? → **NO** (day-wrapping)

| Time | Minutes | Calculation | Result |
|------|---------|-------------|--------|
| 23:30 | 1410 | (1410≥1425)\|(1410≤120) = F\|F | ❌ INACTIVE |
| 23:45 | 1425 | (1425≥1425)\|(1425≤120) = T\|F | ✅ ACTIVE |
| 00:00 | 0 | (0≥1425)\|(0≤120) = F\|T | ✅ ACTIVE |
| 02:00 | 120 | (120≥1425)\|(120≤120) = F\|T | ✅ ACTIVE |
| 02:01 | 121 | (121≥1425)\|(121≤120) = F\|F | ❌ INACTIVE |
| 12:00 | 720 | (720≥1425)\|(720≤120) = F\|F | ❌ INACTIVE |

---

### Market 3: Night Market - 23:50 (openTime="23:50", closeTime="03:00")

- openTimeInMinutes = 1430
- closeTimeInMinutes = 180
- Condition: 1430 < 180? → **NO** (day-wrapping)

| Time | Minutes | Calculation | Result |
|------|---------|-------------|--------|
| 23:45 | 1425 | (1425≥1430)\|(1425≤180) = F\|F | ❌ INACTIVE |
| 23:50 | 1430 | (1430≥1430)\|(1430≤180) = T\|F | ✅ ACTIVE |
| 00:00 | 0 | (0≥1430)\|(0≤180) = F\|T | ✅ ACTIVE |
| 03:00 | 180 | (180≥1430)\|(180≤180) = F\|T | ✅ ACTIVE |
| 03:01 | 181 | (181≥1430)\|(181≤180) = F\|F | ❌ INACTIVE |
| 12:00 | 720 | (720≥1430)\|(720≤180) = F\|F | ❌ INACTIVE |

---

## Comparison: Normal vs Day-Wrapping Markets

### Normal Market: Morning Market (09:00 - 11:00)

- openTimeInMinutes = 540
- closeTimeInMinutes = 660
- Condition: 540 < 660? → **YES** (normal case)
- Logic: `currentTimeInMinutes >= 540 AND currentTimeInMinutes <= 660`

| Time | Result |
|------|--------|
| 08:59 | ❌ INACTIVE |
| 09:00 | ✅ ACTIVE |
| 10:30 | ✅ ACTIVE |
| 11:00 | ✅ ACTIVE |
| 11:01 | ❌ INACTIVE |

---

## Implementation Details

### Helper Functions

**Time Conversion:**
```typescript
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}
```

### Key Insight: The OR Operator

The day-wrapping logic uses **OR** because:
- **After openTime:** `currentTimeInMinutes >= openTimeInMinutes` (e.g., 23:45 → 23:59)
- **Before closeTime:** `currentTimeInMinutes <= closeTimeInMinutes` (e.g., 00:00 → 02:00)
- **Either condition makes market ACTIVE**

This elegantly handles the midnight boundary without special cases.

---

## Affected Code Locations

1. **Market 1 Status Updates:** [src/lib/scheduler.ts](src/lib/scheduler.ts#L44-L68)
2. **Market 2 Status Updates:** [src/lib/scraper2.ts](src/lib/scraper2.ts) - similar logic
3. **Seed Markets:** [scripts/src/seed-demo.ts](scripts/src/seed-demo.ts#L41-L46)

---

## Summary

✅ **All logic verified**
✅ **All boundary conditions correct**
✅ **Day-wrapping handles midnight correctly**
✅ **All three late-night test markets will work**
✅ **No edge cases identified**

The market timing logic is production-ready for late-night markets.

---

## Related Files for Testing

- [MARKET_TIMING_CONFIGURATION_REPORT.md](MARKET_TIMING_CONFIGURATION_REPORT.md) - Full analysis
- [MARKET_TIMING_QUICK_REFERENCE.md](MARKET_TIMING_QUICK_REFERENCE.md) - Quick guide
- [scripts/MARKET_TESTING_GUIDE.md](scripts/MARKET_TESTING_GUIDE.md) - Testing procedures
