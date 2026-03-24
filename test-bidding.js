const API_URL = "https://matka-api-server.onrender.com/api";

async function testFullFlow() {
  console.log("🎯 MATKA BIDDING SYSTEM - COMPLETE FLOW TEST\n");

  try {
    // Step 1: Create User
    console.log("📝 Step 1: Creating new user...");
    const signupRes = await fetch(`${API_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        phone: String(9000000000 + Math.floor(Math.random() * 90000000)),
        password: "test@123",
      }),
    });
    const userData = await signupRes.json();
    console.log("DEBUG - Signup Response:", JSON.stringify(userData, null, 2));
    if (!signupRes.ok) throw new Error(`Signup failed: ${userData.message || userData.error}`);
    const userToken = userData.token;
    const userId = userData.user.id;
    console.log(`✅ User created! ID: ${userId}, Balance: ${userData.user.walletBalance}`);

    // Step 2: Get Admin Token
    console.log("\n🔑 Step 2: Getting admin token...");
    const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@matka.com",
        password: "admin123",
      }),
    });
    const adminData = await adminLoginRes.json();
    const adminToken = adminData.token;
    console.log(`✅ Admin logged in!`);

    // Step 3: Add Wallet Balance (as admin)
    console.log("\n💰 Step 3: Adding ₹1000 to wallet...");
    const updateRes = await fetch(`${API_URL}/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walletBalance: 1000,
      }),
    });
    const updatedUser = await updateRes.json();
    console.log(`✅ Wallet Updated! New Balance: ₹${updatedUser.walletBalance}`);

    // Step 4: Get Markets
    console.log("\n📊 Step 4: Fetching markets...");
    const marketsRes = await fetch(`${API_URL}/markets`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const markets = await marketsRes.json();
    if (!markets.length) throw new Error("No markets available!");
    const market = markets[0];
    console.log(`✅ Markets Loaded! Using: ${market.name} (ID: ${market.id})`);

    // Step 5: Place Bid
    console.log("\n🎲 Step 5: Placing bid...");
    const bidRes = await fetch(`${API_URL}/user/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        marketId: market.id,
        gameType: "single_digit",
        number: "5",
        amount: 100,
      }),
    });
    const bidText = await bidRes.text();
    console.log("DEBUG - Bid Response Status:", bidRes.status);
    console.log("DEBUG - Bid Response:", bidText.substring(0, 200));
    let bidData;
    try {
      bidData = JSON.parse(bidText);
    } catch (e) {
      console.log("❌ Error: Response is not valid JSON");
      console.log("Full response:", bidText);
      throw e;
    }
    if (!bidRes.ok) {
      console.log(`❌ Bid Failed: ${bidData.error || bidData.message}`);
      return;
    }
    const bidId = bidData.bid?.id || bidData.id;
    console.log(
      `✅ Bid Placed! ID: ${bidId}, Amount: ₹${bidData.bid?.amount || bidData.amount}, Number: ${bidData.bid?.number || bidData.number}`
    );

    // Step 6: Check User Wallet After Bid
    console.log("\n👤 Step 6: Checking updated user balance...");
    const userRes = await fetch(`${API_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const userProfile = await userRes.json();
    console.log(`💵 Current Balance: ₹${userProfile.walletBalance}`);

    // Step 7: Declare Result
    console.log("\n🎯 Step 7: Declaring result (Admin action)...");
    const resultRes = await fetch(`${API_URL}/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        marketId: market.id,
        resultDate: new Date().toISOString().split("T")[0],
        openResult: "8",
        closeResult: "7",
        jodiResult: "87",
        pannaResult: "877",
      }),
    });
    const resultData = await resultRes.json();
    if (!resultRes.ok) {
      console.log(`⚠️ Result declared (or already exists): ${resultData.message || resultData.error}`);
    } else {
      console.log(`✅ Result Declared! Open: ${resultData.openResult}`);
    }

    // Step 8: Get Bid Status
    console.log("\n📋 Step 8: Checking bid result...");
    const bidsRes = await fetch(`${API_URL}/bids`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const bidsData = await bidsRes.json();
    const userBids = bidsData.bids || [];
    const myBid = userBids.find((b) => b.id === parseInt(bidId));
    console.log("DEBUG - All bids:", JSON.stringify(userBids.slice(0, 3), null, 2));
    console.log("DEBUG - Looking for bid ID:", bidId);
    console.log("DEBUG - Found bid:", JSON.stringify(myBid, null, 2));
    if (myBid) {
      console.log(`\n🎰 BID RESULT:`);
      console.log(`   ID: ${myBid.id}`);
      console.log(`   Market: ${myBid.market?.name || "Unknown"}`);
      console.log(`   Number: ${myBid.number}`);
      console.log(`   Amount: ₹${myBid.amount}`);
      console.log(`   Status: ${myBid.status}`);
      if (myBid.status === "WON") {
        console.log(`   🏆 WIN! Prize: ₹${myBid.winAmount}`);
      } else if (myBid.status === "LOST") {
        console.log(`   ❌ LOST!`);
      } else {
        console.log(`   ⏳ Status: ${myBid.status}`);
      }
    }

    // Step 9: Final Wallet Check
    console.log("\n💰 Step 9: Final wallet check...");
    const finalUserRes = await fetch(`${API_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const finalUser = await finalUserRes.json();
    console.log(`✅ Final Balance: ₹${finalUser.walletBalance}`);
    console.log(`   Spent: ₹1000 - ₹${finalUser.walletBalance} = ₹${1000 - finalUser.walletBalance}`);

    console.log("\n✨ TEST COMPLETE! ✨\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testFullFlow();
