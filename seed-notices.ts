import { db, noticesTable } from "@workspace/db";

async function seedNotices() {
  try {
    console.log("🌱 Seeding notices...");

    // Insert sample notices
    const notices = await db.insert(noticesTable)
      .values([
        {
          title: "🎉 Welcome to Matka Pro",
          content: "Welcome to our platform! Place your bets wisely and enjoy the game. Make sure to check the latest market rates before placing bids.",
          isActive: true,
          userId: null, // Broadcast to all
        },
        {
          title: "⚠️ Market Update",
          content: "Please note that markets will be closed for maintenance on Saturday. Normal operations will resume on Sunday.",
          isActive: true,
          userId: null,
        },
        {
          title: "💳 New Payment Methods Available",
          content: "We've added new UPI methods for faster deposits and withdrawals. Check the payment settings for more options.",
          isActive: true,
          userId: null,
        },
        {
          title: "🏆 Weekend Jackpot",
          content: "Special jackpot bets available this weekend! Higher returns on selected markets. Hurry, offer ends Sunday midnight.",
          isActive: true,
          userId: null,
        }
      ])
      .returning();

    console.log(`✅ Created ${notices.length} sample notices`);
    console.log("Notices:", notices);
  } catch (error) {
    console.error("❌ Error seeding notices:", error);
  }
}

seedNotices();
