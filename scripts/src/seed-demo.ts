import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, adminsTable, usersTable, marketsTable, bidsTable, gameRatesTable } from "@workspace/db";

async function seedAdmin() {
  const email = "admin@matka.com";
  const password = "admin123";
  const name = "Admin";

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await db.insert(adminsTable).values({
      email,
      password: hashedPassword,
      name,
    });
    console.log("Admin user created successfully");
  } catch (error) {
    console.log("Admin user already exists or error:", (error as Error).message);
  }
}

async function seedDemoUsers() {
  const users = [
    { name: "Rohit Sharma", email: "rohit@matka.com", phone: "9999990001", password: "user123" },
    { name: "Ananya Singh", email: "ananya@matka.com", phone: "9999990002", password: "user123" },
  ];

  for (const u of users) {
    try {
      const hashed = await bcrypt.hash(u.password, 10);
      await db.insert(usersTable).values({
        name: u.name,
        email: u.email,
        phone: u.phone,
        password: hashed,
        walletBalance: "1000",
      });
      console.log(`Created user ${u.email}`);
    } catch (error) {
      console.log(`User already exists or error for ${u.email}:`, (error as Error).message);
    }
  }
}

async function seedMarkets() {
  const markets = [
    { name: "Morning Market", openTime: "09:00", closeTime: "11:00" },
    { name: "Evening Market", openTime: "16:00", closeTime: "18:00" },
    { name: "Test Market - 02:46", openTime: "02:46", closeTime: "11:59" },
    { name: "Late Night Market - 23:30", openTime: "23:30", closeTime: "01:30" },
    { name: "Midnight Market - 23:45", openTime: "23:45", closeTime: "02:00" },
    { name: "Night Market - 23:50", openTime: "23:50", closeTime: "03:00" },
  ];

  for (const m of markets) {
    try {
      await db.insert(marketsTable).values({
        name: m.name,
        openTime: m.openTime,
        closeTime: m.closeTime,
        autoUpdate: false,
      });
      console.log(`Created market ${m.name}`);
    } catch (error) {
      console.log(`Market already exists or error for ${m.name}:`, (error as Error).message);
    }
  }
}

async function seedGameRates() {
  try {
    await db.insert(gameRatesTable).values({
      singleDigit: "9.00",
      jodiDigit: "90.00",
      singlePanna: "150.00",
      doublePanna: "300.00",
      triplePanna: "600.00",
      halfSangam: "1500.00",
      fullSangam: "3000.00",
    });
    console.log("Game rates created successfully");
  } catch (error) {
    console.log("Game rates already exist or error:", (error as Error).message);
  }
}

async function seedBids() {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, "rohit@matka.com"));
  const [market] = await db.select().from(marketsTable).where(eq(marketsTable.name, "Morning Market"));

  if (!user || !market) {
    console.log("Skipping bids seed because user/market not found.");
    return;
  }

  const bids = [
    { gameType: "single_digit", amount: "10", number: "5" },
    { gameType: "jodi", amount: "20", number: "56" },
  ];

  for (const b of bids) {
    try {
      await db.insert(bidsTable).values({
        userId: user.id,
        marketId: market.id,
        gameType: b.gameType,
        amount: b.amount,
        number: b.number,
      });
      console.log(`Created bid ${b.number} for ${user.email}`);
    } catch (error) {
      console.log(`Bid already exists or error for ${b.number}:`, (error as Error).message);
    }
  }
}

async function main() {
  await seedAdmin();
  await seedDemoUsers();
  await seedMarkets();
  await seedGameRates();
  await seedBids();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
