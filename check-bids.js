const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    console.log('\n📊 Recent Bids Status:');
    const result = await pool.query(`
      SELECT 
        id, 
        market_id, 
        game_type, 
        amount, 
        number, 
        status, 
        market_open_close,
        market_name,
        created_at
      FROM bids 
      ORDER BY created_at DESC 
      LIMIT 15
    `);
    
    console.log('\nID | Market | GameType | Amount | Number | Status | OpenClose | Created (IST)');
    console.log('---|--------|----------|--------|--------|--------|-----------|------------------');
    
    result.rows.forEach(row => {
      const created = new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`${row.id}  | ${row.market_id}  | ${row.game_type.padEnd(12)} | ${row.amount}    | ${row.number.padEnd(6)} | ${row.status.padEnd(6)} | ${(row.market_open_close || 'open').padEnd(9)} | ${created}`);
    });
    
    // Check for pending vs won/lost
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count FROM bids GROUP BY status
    `);
    
    console.log('\n📈 Bid Status Distribution:');
    statusResult.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} bids`);
    });
    
  } catch(e) {
    console.error('❌ Error:', e.message);
  } finally {
    await pool.end();
  }
})();
