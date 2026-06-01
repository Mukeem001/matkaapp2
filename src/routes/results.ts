import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, resultsTable, marketsTable } from "@workspace/db";
import { GetResultsQueryParams, DeclareResultBody } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import { processMarketBids } from "../lib/bid-processor.js";

const router: IRouter = Router();

router.get("/results", authMiddleware, async (req, res): Promise<void> => {
  const query = GetResultsQueryParams.safeParse(req.query);

  let conditions: any[] = [];

  // Filter by marketId if provided
  if (query.data?.marketId) {
    conditions.push(eq(resultsTable.marketId, query.data.marketId));
    console.log(`[Results] Filtering by marketId: ${query.data.marketId}`);
  }

  // Filter by date if provided
  if (query.data?.date) {
    conditions.push(eq(resultsTable.resultDate, query.data.date));
    console.log(`[Results] Filtering by date: ${query.data.date}`);
  }

  let selectQuery: any = db
    .select({
      id: resultsTable.id,
      marketId: resultsTable.marketId,
      marketName: marketsTable.name,
      resultDate: resultsTable.resultDate,
      openResult: resultsTable.openResult,
      closeResult: resultsTable.closeResult,
      jodiResult: resultsTable.jodiResult,
      pannaResult: resultsTable.pannaResult,
      declaredAt: resultsTable.declaredAt,
    })
    .from(resultsTable)
    .leftJoin(marketsTable, eq(resultsTable.marketId, marketsTable.id))
    .orderBy(resultsTable.resultDate, resultsTable.marketId);

  // Apply conditions if any
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const results = await selectQuery;
  
  console.log(`[Results] Found ${results.length} results for query:`, {
    marketId: query.data?.marketId,
    date: query.data?.date,
  });

  res.json(results.map(r => ({
    ...r,
    marketName: r.marketName ?? "Unknown",
    declaredAt: r.declaredAt?.toISOString() ?? null,
  })));
});

router.post("/results", authMiddleware, async (req, res): Promise<void> => {
  const body = DeclareResultBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [result] = await db.insert(resultsTable).values({
    marketId: body.data.marketId,
    resultDate: body.data.resultDate,
    openResult: body.data.openResult,
    closeResult: body.data.closeResult,
    jodiResult: body.data.jodiResult,
    pannaResult: body.data.pannaResult,
    declaredAt: new Date(),
  }).returning();

  // Update market results
  await db.update(marketsTable).set({
    openResult: body.data.openResult,
    closeResult: body.data.closeResult,
    jodiResult: body.data.jodiResult,
  }).where(eq(marketsTable.id, body.data.marketId));

  // Process bids for this market result
  const marketResult = {
    openResult: body.data.openResult,
    closeResult: body.data.closeResult,
    jodiResult: body.data.jodiResult,
    pannaResult: body.data.pannaResult,
  };

  console.log(`Declaring result for market ${body.data.marketId}:`, marketResult);

  try {
    await processMarketBids(body.data.marketId, marketResult);
    console.log(`Successfully processed bids for market ${body.data.marketId}`);
  } catch (error) {
    console.error("Error processing market bids:", error);
    // Don't fail the result declaration if bid processing fails
  }

  const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, result.marketId));

  res.status(201).json({
    ...result,
    marketName: market?.name ?? "Unknown",
    declaredAt: result.declaredAt?.toISOString() ?? null,
  });
});

export default router;
