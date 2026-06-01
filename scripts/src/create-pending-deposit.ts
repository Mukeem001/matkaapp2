import "dotenv/config";
import { db, depositsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function createPendingDeposit() {
  try {
    // Get the first user
    const [user] = await db.select().from(usersTable).limit(1);
    
    if (!user) {
      console.log("No users found. Please create a user first.");
      return;
    }

    // Create a pending deposit
    const [deposit] = await db.insert(depositsTable).values({
      userId: user.id,
      amount: "500",
      status: "pending",
      paymentMethod: "upi",
      transactionId: "TEST-PENDING-" + Date.now(),
      screenshotUrl: null,
    }).returning();

    console.log(`✅ Created pending deposit:`);
    console.log(`   ID: ${deposit.id}`);
    console.log(`   User: ${user.name} (ID: ${user.id})`);
    console.log(`   Amount: ₹${deposit.amount}`);
    console.log(`   Status: ${deposit.status}`);
    console.log(`   Transaction ID: ${deposit.transactionId}`);
  } catch (error) {
    console.error("Error creating pending deposit:", error);
  }
}

createPendingDeposit();
