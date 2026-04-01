import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { format } from "date-fns";
import { db, bidsTable, usersTable, gameRatesTable, resultsTable, marketsTable } from "@workspace/db";
import { getTodayDateIST } from "./date-utils";

export interface MarketResult {
  openResult?: string;
  closeResult?: string;
  jodiResult?: string;
  pannaResult?: string;
}

export interface GameRates {
  singleDigit: number;
  jodiDigit: number;
  singlePanna: number;
  doublePanna: number;
  triplePanna: number;
  halfSangam: number;
  fullSangam: number;
}

/**
 * Check if a bid number matches the result based on game type and marketopenclose
 */
export function isBidWinner(bidNumber: string, gameType: string, result: MarketResult, marketopenclose?: string): boolean {
  const { openResult, closeResult, jodiResult, pannaResult } = result;

  console.log(`Checking bid: number=${bidNumber}, gameType=${gameType}, marketopenclose=${marketopenclose}, result=`, result);

  switch (gameType) {
    case "single_digit":
      // Single digit matches the FIRST digit of jodiResult
      if (jodiResult && jodiResult.length > 0) {
        const firstDigit = jodiResult.charAt(0);
        const matchResult = bidNumber === firstDigit;
        console.log(`Single digit check: jodiResult = ${jodiResult}, first digit = ${firstDigit}, bid = ${bidNumber}, match = ${matchResult}`);
        return matchResult;
      }
      return false;

    case "jodi":
      // Jodi matches the jodiResult exactly
      if (jodiResult) {
        const matchResult = bidNumber === jodiResult;
        console.log(`Jodi check: jodiResult = ${jodiResult}, bid = ${bidNumber}, match = ${matchResult}`);
        return matchResult;
      }
      return false;

    case "single_panna":
      // Single panna: open-bids matches openResult, close-bids matches closeResult
      const resultForSinglePanna = marketopenclose === "close-bids" ? closeResult : openResult;
      if (resultForSinglePanna) {
        const matchResult = bidNumber === resultForSinglePanna;
        console.log(`Single panna check: marketopenclose=${marketopenclose}, result=${resultForSinglePanna}, bid=${bidNumber}, match=${matchResult}`);
        return matchResult;
      }
      return false;

    case "double_panna":
      // Double panna: open-bids matches openResult, close-bids matches closeResult (two same digits)
      const resultForDoublePanna = marketopenclose === "close-bids" ? closeResult : openResult;
      if (resultForDoublePanna && resultForDoublePanna.length === 3) {
        const digits = resultForDoublePanna.split("");
        const uniqueDigits = [...new Set(digits)];
        const matchResult = uniqueDigits.length === 2 && bidNumber === resultForDoublePanna;
        console.log(`Double panna check: marketopenclose=${marketopenclose}, result=${resultForDoublePanna}, unique digits=${uniqueDigits.length}, bid=${bidNumber}, match=${matchResult}`);
        return matchResult;
      }
      return false;

    case "triple_panna":
      // Triple panna: open-bids matches openResult, close-bids matches closeResult (all different digits)
      const resultForTriplePanna = marketopenclose === "close-bids" ? closeResult : openResult;
      if (resultForTriplePanna && resultForTriplePanna.length === 3) {
        const digits = resultForTriplePanna.split("");
        const uniqueDigits = [...new Set(digits)];
        const matchResult = uniqueDigits.length === 3 && bidNumber === resultForTriplePanna;
        console.log(`Triple panna check: marketopenclose=${marketopenclose}, result=${resultForTriplePanna}, unique digits=${uniqueDigits.length}, bid=${bidNumber}, match=${matchResult}`);
        return matchResult;
      }
      return false;

    case "half_sangam":
      // Half sangam logic pending - return false for now
      console.log(`Half sangam check: PENDING - bid=${bidNumber}`);
      return false;

    case "full_sangam":
      // Full sangam: matches both openResult and closeResult combined (openResult-closeResult)
      if (openResult && closeResult && bidNumber.includes("-")) {
        const [openPart, closePart] = bidNumber.split("-");
        const matchResult = openPart === openResult && closePart === closeResult;
        console.log(`Full sangam check: openResult=${openResult}, closeResult=${closeResult}, bid openPart=${openPart}, bid closePart=${closePart}, match=${matchResult}`);
        return matchResult;
      }
      return false;

    default:
      console.log(`Unknown game type: ${gameType}`);
      return false;
  }
}

/**
 * Calculate winnings based on game type and rates
 */
export function calculateWinnings(bidAmount: number, gameType: string, rates: GameRates): number {
  // Map snake_case game types to camelCase property names
  const gameTypeMapping: Record<string, keyof GameRates> = {
    "single_digit": "singleDigit",
    "jodi": "jodiDigit",
    "single_panna": "singlePanna",
    "double_panna": "doublePanna",
    "triple_panna": "triplePanna",
    "half_sangam": "halfSangam",
    "full_sangam": "fullSangam",
  };

  const rateKey = gameTypeMapping[gameType];
  const multiplier = rateKey ? rates[rateKey] : 1;
  return bidAmount * multiplier;
}

/**
 * Process all pending bids for a market when results are declared
 */
export async function processMarketBids(marketId: number, result: MarketResult): Promise<void> {
  console.log(`Processing bids for market ${marketId} with result:`, result);

  // Get game rates
  const [rates] = await db.select().from(gameRatesTable).limit(1);
  if (!rates) {
    console.error("Game rates not found");
    return;
  }

  console.log("Game rates found:", rates);

  const gameRates: GameRates = {
    singleDigit: parseFloat(rates.singleDigit as string),
    jodiDigit: parseFloat(rates.jodiDigit as string),
    singlePanna: parseFloat(rates.singlePanna as string),
    doublePanna: parseFloat(rates.doublePanna as string),
    triplePanna: parseFloat(rates.triplePanna as string),
    halfSangam: parseFloat(rates.halfSangam as string),
    fullSangam: parseFloat(rates.fullSangam as string),
  };

  console.log("Parsed game rates:", gameRates);

  // Get all pending bids for this market
  const pendingBids = await db.select({
    id: bidsTable.id,
    userId: bidsTable.userId,
    gameType: bidsTable.gameType,
    amount: bidsTable.amount,
    number: bidsTable.number,
    marketopenclose: bidsTable.marketopenclose,
  })
    .from(bidsTable)
    .where(and(
      eq(bidsTable.marketId, marketId),
      eq(bidsTable.status, "pending")
    ));

  console.log(`Found ${pendingBids.length} pending bids for market ${marketId}`);
  if (pendingBids.length > 0) {
    console.log("Sample bids:", pendingBids.slice(0, 3));
  }

  // Process each bid
  for (const bid of pendingBids) {
    const bidAmount = parseFloat(bid.amount as string);
    const isWinner = isBidWinner(bid.number, bid.gameType, result, bid.marketopenclose);

    console.log(`Processing bid ${bid.id}: number=${bid.number}, gameType=${bid.gameType}, amount=${bidAmount}, isWinner=${isWinner}`);

    if (isWinner) {
      // Calculate winnings
      const winnings = calculateWinnings(bidAmount, bid.gameType, gameRates);
      const totalWinnings = bidAmount + winnings; // Return original bid + winnings

      console.log(`Bid ${bid.id} won! Winnings: ${winnings}, Total: ${totalWinnings}`);

      // Update bid status and user wallet in transaction
      await db.transaction(async (tx) => {
        // Update bid status to won
        const updateResult = await tx.update(bidsTable)
          .set({ status: "won" })
          .where(eq(bidsTable.id, bid.id));

        console.log(`Updated bid ${bid.id} status to won, result:`, updateResult);

        // Add winnings to user wallet
        const walletResult = await tx.update(usersTable)
          .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
          .where(eq(usersTable.id, bid.userId));

        console.log(`Updated user ${bid.userId} wallet by ${totalWinnings}, result:`, walletResult);
      });

      console.log(`User ${bid.userId} won ${totalWinnings} on bid ${bid.id}`);
    } else {
      // Update bid status to lost
      const updateResult = await db.update(bidsTable)
        .set({ status: "lost" })
        .where(eq(bidsTable.id, bid.id));

      console.log(`Updated bid ${bid.id} status to lost, result:`, updateResult);
    }
  }
}

/**
 * Process market bids before closeTime - 20 minutes
 * Called when user wants to check win/loss for today's bets
 * Fetches TODAY's result and updates bid status accordingly
 */
export async function processMarketBidsPreClose(marketId: number): Promise<{
  success: boolean;
  message: string;
  processed?: number;
  won?: number;
  lost?: number;
}> {
  try {
    // Get market details
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, marketId));
    if (!market) {
      return { success: false, message: "Market not found" };
    }

    // Get TODAY's result for this market (in IST)
    const today = getTodayDateIST();
    let result = await db.select().from(resultsTable).where(
      and(
        eq(resultsTable.marketId, marketId),
        eq(resultsTable.resultDate, today)
      )
    )
      .then(rows => rows[0]);

    // If not found, try yesterday (for UTC/IST timezone shift)
    if (!result) {
      const yesterdayDate = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
      const istOffset = 5.5 * 60 * 60 * 1000;
      const yesterdayIST = new Date(yesterdayDate.getTime() + istOffset);
      const yesterdayYear = yesterdayIST.getUTCFullYear();
      const yesterdayMonth = String(yesterdayIST.getUTCMonth() + 1).padStart(2, '0');
      const yesterdayDay = String(yesterdayIST.getUTCDate()).padStart(2, '0');
      const yesterdayResultDate = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;

      result = await db.select().from(resultsTable).where(
        and(
          eq(resultsTable.marketId, marketId),
          eq(resultsTable.resultDate, yesterdayResultDate)
        )
      )
        .then(rows => rows[0]);
    }

    if (!result || !result.openResult || !result.closeResult) {
      return {
        success: false,
        message: `Result not found for ${market.name}. Result needs openResult and closeResult.`,
      };
    }

    const marketResult: MarketResult = {
      openResult: result.openResult,
      closeResult: result.closeResult,
      jodiResult: result.jodiResult || undefined,
      pannaResult: result.pannaResult || undefined,
    };

    console.log(`[Pre-Close Processing] ${market.name} (${today}):`, marketResult);

    // Get game rates
    const [rates] = await db.select().from(gameRatesTable).limit(1);
    if (!rates) {
      return { success: false, message: "Game rates not found" };
    }

    const gameRates: GameRates = {
      singleDigit: parseFloat(rates.singleDigit as string),
      jodiDigit: parseFloat(rates.jodiDigit as string),
      singlePanna: parseFloat(rates.singlePanna as string),
      doublePanna: parseFloat(rates.doublePanna as string),
      triplePanna: parseFloat(rates.triplePanna as string),
      halfSangam: parseFloat(rates.halfSangam as string),
      fullSangam: parseFloat(rates.fullSangam as string),
    };

    // Get all pending bids for this market
    const pendingBids = await db.select({
      id: bidsTable.id,
      userId: bidsTable.userId,
      gameType: bidsTable.gameType,
      amount: bidsTable.amount,
      number: bidsTable.number,
      marketopenclose: bidsTable.marketopenclose,
    })
      .from(bidsTable)
      .where(and(
        eq(bidsTable.marketId, marketId),
        eq(bidsTable.status, "pending")
      ));

    if (pendingBids.length === 0) {
      return {
        success: true,
        message: "No pending bids to process",
        processed: 0,
        won: 0,
        lost: 0,
      };
    }

    let wonCount = 0;
    let lostCount = 0;

    // Process each bid
    for (const bid of pendingBids) {
      const bidAmount = parseFloat(bid.amount as string);
      const isWinner = isBidWinner(bid.number, bid.gameType, marketResult, bid.marketopenclose);

      if (isWinner) {
        const winnings = calculateWinnings(bidAmount, bid.gameType, gameRates);
        const totalWinnings = bidAmount + winnings;

        await db.transaction(async (tx) => {
          // Update bid status to won
          await tx.update(bidsTable)
            .set({ status: "won" })
            .where(eq(bidsTable.id, bid.id));

          // Add winnings to user wallet
          await tx.update(usersTable)
            .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
            .where(eq(usersTable.id, bid.userId));
        });

        console.log(`[Pre-Close] Bid ${bid.id} WON: +₹${totalWinnings}`);
        wonCount++;
      } else {
        // Update bid status to lost
        await db.update(bidsTable)
          .set({ status: "lost" })
          .where(eq(bidsTable.id, bid.id));

        console.log(`[Pre-Close] Bid ${bid.id} LOST`);
        lostCount++;
      }
    }

    return {
      success: true,
      message: `✅ Processed ${pendingBids.length} bids for ${market.name}`,
      processed: pendingBids.length,
      won: wonCount,
      lost: lostCount,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Pre-Close Processing Error]:", errorMessage);
    return {
      success: false,
      message: `Error: ${errorMessage}`,
    };
  }
}