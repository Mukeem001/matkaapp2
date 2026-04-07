#!/usr/bin/env node

/**
 * Test script for Markets2 CRUD operations
 * Tests all API endpoints: CREATE, READ, UPDATE, DELETE
 */

const API_BASE_URL = process.env.API_URL || "http://localhost:3000";

// Mock token for testing (you need to update this with a real token from login)
const MOCK_TOKEN = process.env.TEST_TOKEN || "your-auth-token-here";

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName) {
  log(`\n▶ ${testName}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function makeRequest(method, endpoint, body = null) {
  const url = `${API_BASE_URL}/api/${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MOCK_TOKEN}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    let data = null;
    
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: Object.fromEntries(response.headers),
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      data: { error: error.message },
      error,
    };
  }
}

async function runTests() {
  log(`\n${'='.repeat(60)}`, 'bold');
  log('Markets2 CRUD Test Suite', 'bold');
  log(`${'='.repeat(60)}`, 'bold');

  let testMarketId = null;
  let passed = 0;
  let failed = 0;

  // Test 1: CREATE - Add a new market
  logTest('CREATE - POST /api/markets2');
  const createPayload = {
    name: `TEST_MARKET_${Date.now()}`,
    openTime: "10:00",
    closeTime: "22:00",
    isActive: true,
  };

  const createResponse = await makeRequest("POST", "markets2", createPayload);
  if (createResponse.ok) {
    testMarketId = createResponse.data.id;
    logSuccess(`Market created with ID: ${testMarketId}`);
    log(`Response: ${JSON.stringify(createResponse.data, null, 2)}`, 'blue');
    passed++;
  } else {
    logError(`Failed to create market: ${createResponse.status}`);
    log(`Response: ${JSON.stringify(createResponse.data, null, 2)}`, 'red');
    failed++;
  }

  if (!testMarketId) {
    logError("Cannot continue tests without a valid market ID");
    return { passed, failed };
  }

  // Test 2: READ - Get all markets
  logTest('READ - GET /api/markets2');
  const readAllResponse = await makeRequest("GET", "markets2");
  if (readAllResponse.ok && Array.isArray(readAllResponse.data)) {
    logSuccess(`Found ${readAllResponse.data.length} markets`);
    const testMarket = readAllResponse.data.find(m => m.id === testMarketId);
    if (testMarket) {
      logSuccess(`Test market found in list: ${testMarket.name}`);
      log(`Market data: ${JSON.stringify(testMarket, null, 2)}`, 'blue');
      passed++;
    } else {
      logWarning(`Test market not found in list`);
    }
  } else {
    logError(`Failed to read markets: ${readAllResponse.status}`);
    log(`Response: ${JSON.stringify(readAllResponse.data, null, 2)}`, 'red');
    failed++;
  }

  // Test 3: READ - Get single market
  logTest(`READ - GET /api/markets2/${testMarketId}`);
  const readOneResponse = await makeRequest("GET", `markets2/${testMarketId}`);
  if (readOneResponse.ok) {
    logSuccess(`Market retrieved: ${readOneResponse.data.name}`);
    log(`Market data: ${JSON.stringify(readOneResponse.data, null, 2)}`, 'blue');
    passed++;
  } else {
    logError(`Failed to read market: ${readOneResponse.status}`);
    log(`Response: ${JSON.stringify(readOneResponse.data, null, 2)}`, 'red');
    failed++;
  }

  // Test 4: UPDATE - Partial update (name)
  logTest(`UPDATE - PUT /api/markets2/${testMarketId} (name)`);
  const updatePayload1 = {
    name: `UPDATED_${Date.now()}`,
  };

  const updateResponse1 = await makeRequest("PUT", `markets2/${testMarketId}`, updatePayload1);
  if (updateResponse1.ok) {
    logSuccess(`Market name updated`);
    log(`Response: ${JSON.stringify(updateResponse1.data, null, 2)}`, 'blue');
    passed++;
  } else {
    logError(`Failed to update market: ${updateResponse1.status}`);
    log(`Response: ${JSON.stringify(updateResponse1.data, null, 2)}`, 'red');
    failed++;
  }

  // Test 5: UPDATE - Toggle autoUpdate
  logTest(`UPDATE - PUT /api/markets2/${testMarketId} (autoUpdate toggle)`);
  const updatePayload2 = {
    autoUpdate: true,
  };

  const updateResponse2 = await makeRequest("PUT", `markets2/${testMarketId}`, updatePayload2);
  if (updateResponse2.ok) {
    logSuccess(`AutoUpdate toggled`);
    log(`Response: ${JSON.stringify(updateResponse2.data, null, 2)}`, 'blue');
    passed++;
  } else {
    logError(`Failed to toggle autoUpdate: ${updateResponse2.status}`);
    log(`Response: ${JSON.stringify(updateResponse2.data, null, 2)}`, 'red');
    failed++;
  }

  // Test 6: UPDATE - Full update
  logTest(`UPDATE - PUT /api/markets2/${testMarketId} (full update)`);
  const updatePayload3 = {
    name: `FULL_UPDATE_${Date.now()}`,
    openTime: "11:00",
    closeTime: "23:00",
    isActive: false,
    autoUpdate: false,
  };

  const updateResponse3 = await makeRequest("PUT", `markets2/${testMarketId}`, updatePayload3);
  if (updateResponse3.ok) {
    logSuccess(`Market fully updated`);
    log(`Response: ${JSON.stringify(updateResponse3.data, null, 2)}`, 'blue');
    passed++;
  } else {
    logError(`Failed to fully update market: ${updateResponse3.status}`);
    log(`Response: ${JSON.stringify(updateResponse3.data, null, 2)}`, 'red');
    failed++;
  }

  // Test 7: Fetch-Now (if market has sourceUrl)
  logTest(`FETCH-NOW - POST /api/markets2/${testMarketId}/fetch-now`);
  const fetchNowResponse = await makeRequest("POST", `markets2/${testMarketId}/fetch-now`);
  if (fetchNowResponse.ok) {
    logSuccess(`Fetch-now triggered`);
    log(`Response: ${JSON.stringify(fetchNowResponse.data, null, 2)}`, 'blue');
    passed++;
  } else {
    // This might fail if no sourceUrl is configured, which is OK
    if (fetchNowResponse.status === 400 || fetchNowResponse.status === 422) {
      logWarning(`Fetch-now returned ${fetchNowResponse.status} (expected if no sourceUrl configured)`);
    } else {
      logError(`Failed to trigger fetch-now: ${fetchNowResponse.status}`);
      log(`Response: ${JSON.stringify(fetchNowResponse.data, null, 2)}`, 'red');
      failed++;
    }
  }

  // Test 8: DELETE - Delete the market
  logTest(`DELETE - DELETE /api/markets2/${testMarketId}`);
  const deleteResponse = await makeRequest("DELETE", `markets2/${testMarketId}`);
  if (deleteResponse.ok) {
    logSuccess(`Market deleted successfully`);
    log(`Response: ${JSON.stringify(deleteResponse.data, null, 2)}`, 'blue');
    passed++;
  } else {
    logError(`Failed to delete market: ${deleteResponse.status}`);
    log(`Response: ${JSON.stringify(deleteResponse.data, null, 2)}`, 'red');
    failed++;
  }

  // Test 9: READ - Verify deletion
  logTest(`VERIFY - GET /api/markets2/${testMarketId} (should not exist)`);
  const verifyDeleteResponse = await makeRequest("GET", `markets2/${testMarketId}`);
  if (verifyDeleteResponse.status === 404) {
    logSuccess(`Market successfully deleted (404 Not Found)`);
    passed++;
  } else if (!verifyDeleteResponse.ok) {
    logSuccess(`Market not accessible (status: ${verifyDeleteResponse.status})`);
    passed++;
  } else {
    logWarning(`Market still exists after deletion`);
    log(`Market data: ${JSON.stringify(verifyDeleteResponse.data, null, 2)}`, 'yellow');
  }

  // Summary
  log(`\n${'='.repeat(60)}`, 'bold');
  log('Test Summary', 'bold');
  log(`${'='.repeat(60)}`, 'bold');
  logSuccess(`Passed: ${passed}`);
  if (failed > 0) {
    logError(`Failed: ${failed}`);
  }

  return { passed, failed };
}

// Main execution
(async () => {
  if (MOCK_TOKEN === 'your-auth-token-here') {
    logWarning('\n⚠️ USING PLACEHOLDER TOKEN - Tests will likely fail');
    logWarning('Set TEST_TOKEN environment variable with a valid auth token');
    logWarning('Example: TEST_TOKEN=your_token node test-markets2-crud.js\n');
  }

  const results = await runTests();
  
  log(`\n${'='.repeat(60)}\n`, 'bold');
  
  if (results.failed === 0) {
    log('✅ All tests passed!', 'green');
  } else {
    log(`⚠️ ${results.failed} test(s) failed`, 'yellow');
  }

  process.exit(results.failed > 0 ? 1 : 0);
})();
