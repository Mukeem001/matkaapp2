const API_URL = "https://matka-api-server.onrender.com/api";

async function checkResults() {
  console.log("🔍 CHECKING RESULTS\n");

  try {
    // Get admin token
    console.log("🔑 Getting admin token...");
    const adminRes = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@matka.com",
        password: "admin123",
      }),
    });
    const adminData = await adminRes.json();
    const adminToken = adminData.token;
    console.log("✅ Admin logged in\n");

    // Get results
    console.log("📋 Fetching results...");
    const resultsRes = await fetch(`${API_URL}/results`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resultsData = await resultsRes.json();
    
    // Find results for market 54
    const market54Results = resultsData.filter(r => r.marketId === 54);
    
    console.log(`\nFound ${market54Results.length} results for market 54:\n`);
    market54Results.slice(0, 5).forEach(r => {
      console.log(`Date: ${r.resultDate}`);
      console.log(`  Open: ${r.openResult} | Close: ${r.closeResult} | Jodi: ${r.jodiResult}`);
      console.log(`---`);
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

checkResults();
