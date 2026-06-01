import { db, bidsTable, usersTable, marketsTable } from "@workspace/db";

/**
 * Script to add 2 test bids with bidsStatus field for testing
 */
async function addTestBids() {
  try {
    console.log("📝 Adding 2 test bids with bidsStatus field...");

    // Get first user
    const users = await db.select().from(usersTable).limit(1);
    if (users.length === 0) {
      console.error("❌ No users found. Please create a user first.");
      return;
    }
    const userId = users[0].id;
    console.log(`✅ Using user ID: ${userId}`);

    // Get first market
    const markets = await db.select().from(marketsTable).limit(1);
    if (markets.length === 0) {
      console.error("❌ No markets found. Please create a market first.");
      return;
    }
    const marketId = markets[0].id;
    const marketName = markets[0].name;
    console.log(`✅ Using market: ${marketName} (ID: ${marketId})`);

    // Test Bid 1 - Open Bids
    const bid1 = {
      userId,
      marketId,
      marketName,
      gameType: "SINGLE",
      amount: "100",
      number: "45",
      openTime: "10:00 AM",
      closeTime: "11:00 AM",
      bidsStatus: "open-bids",
      status: "pending",
    };

    // Test Bid 2 - Close Bids
    const bid2 = {
      userId,
      marketId,
      marketName,
      gameType: "JODI",
      amount: "500",
      number: "89",
      openTime: "11:00 AM",
      closeTime: "12:00 PM",
      bidsStatus: "close-bids",
      status: "pending",
    };

    // Insert bids
    const result1 = await db.insert(bidsTable).values(bid1);
    console.log(`✅ Bid 1 created: ${bid1.number} (${bid1.bidsStatus}) - Amount: ₹${bid1.amount}`);

    const result2 = await db.insert(bidsTable).values(bid2);
    console.log(`✅ Bid 2 created: ${bid2.number} (${bid2.bidsStatus}) - Amount: ₹${bid2.amount}`);

    // Fetch and display all bids
    const allBids = await db.select().from(bidsTable).limit(10);
    console.log(`\n📊 Total bids in database: ${allBids.length}`);
    console.log("\nRecent bids:");
    allBids.slice(-2).forEach((bid, idx) => {
      console.log(`  ${idx + 1}. ${bid.number} (${bid.bidsStatus}) - ₹${bid.amount} - Status: ${bid.status}`);
    });

    console.log("\n✨ Test bids added successfully!");
  } catch (error) {
    console.error("❌ Error adding test bids:", error);
    process.exit(1);
  }
}

addTestBids().then(() => {
  console.log("✅ Script completed");
  process.exit(0);
});
