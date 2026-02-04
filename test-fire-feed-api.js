/**
 * Test script to check fire feed API endpoint
 * Tests if the API should return trades according to thresholds
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function testFireFeedAPI() {
  console.log('🔥 Testing Fire Feed API\n');
  console.log(`📡 API Endpoint: ${BASE_URL}/api/fire-feed\n`);

  try {
    const response = await fetch(`${BASE_URL}/api/fire-feed`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, response.statusText);
      console.error('Response:', errorText);
      return;
    }

    const data = await response.json();

    console.log('='.repeat(80));
    console.log('API RESPONSE');
    console.log('='.repeat(80));
    console.log();

    console.log(`📊 Trades returned: ${data.trades?.length || 0}`);
    console.log(`👥 Traders returned: ${Object.keys(data.traders || {}).length}`);
    console.log(`📈 Stats available: ${Object.keys(data.stats || {}).length}`);
    console.log();

    if (data.debug) {
      console.log('🔍 Debug Info:');
      console.log(`  Trades checked: ${data.debug.tradesChecked || 0}`);
      console.log(`  Trades passed: ${data.debug.tradesPassed || 0}`);
      console.log(`  Traders without stats: ${data.debug.tradersWithoutStats || 0}`);
      console.log(`  Passed by Win Rate: ${data.debug.passedByWinRate || 0}`);
      console.log(`  Passed by ROI: ${data.debug.passedByRoi || 0}`);
      console.log(`  Passed by Conviction: ${data.debug.passedByConviction || 0}`);
      console.log(`  Trades with null winRate: ${data.debug.tradesWithNullWinRate || 0}`);
      console.log(`  Trades with null ROI: ${data.debug.tradesWithNullRoi || 0}`);
      console.log(`  Trades with null conviction: ${data.debug.tradesWithNullConviction || 0}`);
      console.log(`  Trades with all null stats: ${data.debug.tradesWithAllNull || 0}`);
      console.log();
    } else {
      console.log('⚠️  No debug info available (API might be running in production mode)');
      console.log();
    }

    if (data.error) {
      console.log('❌ API Error:', data.error);
      if (data.details) {
        console.log('Details:', data.details);
      }
      console.log();
      console.log('Full response:', JSON.stringify(data, null, 2));
      console.log();
    }

    if (data.trades && data.trades.length > 0) {
      console.log('✅ SUCCESS: API returned trades!');
      console.log();
      console.log('Sample trades:');
      data.trades.slice(0, 5).forEach((trade, i) => {
        console.log(`\n${i + 1}. Trade ID: ${trade.id || trade.tx_hash || 'unknown'}`);
        console.log(`   Wallet: ${trade.wallet || trade.user || 'unknown'}`);
        console.log(`   Market: ${trade.title || trade.question || 'unknown'}`);
        console.log(`   Timestamp: ${new Date(trade.timestamp * 1000).toISOString()}`);
        if (trade._fireReasons) {
          console.log(`   Fire reasons: ${trade._fireReasons.join(', ')}`);
        }
        if (trade._fireWinRate !== null && trade._fireWinRate !== undefined) {
          console.log(`   Win Rate: ${(trade._fireWinRate * 100).toFixed(1)}%`);
        }
        if (trade._fireRoi !== null && trade._fireRoi !== undefined) {
          console.log(`   ROI: ${(trade._fireRoi * 100).toFixed(1)}%`);
        }
        if (trade._fireConviction !== null && trade._fireConviction !== undefined) {
          console.log(`   Conviction: ${trade._fireConviction.toFixed(2)}x`);
        }
      });
    } else {
      console.log('⚠️  No trades returned');
      console.log();
      console.log('Possible reasons:');
      console.log('  1. No trades in database from last 30 days');
      console.log('  2. No traders have stats in trader_global_stats');
      console.log('  3. All trades failed to meet thresholds');
      console.log('  4. Stats are missing or in wrong format');
      console.log();
      
      if (data.debug) {
        if (data.debug.tradesChecked === 0) {
          console.log('🔍 Issue: No trades were checked');
          console.log('   → Check if there are trades in the database');
        } else if (data.debug.tradesPassed === 0) {
          console.log('🔍 Issue: Trades were checked but none passed');
          console.log(`   → ${data.debug.tradersWithoutStats} traders had no stats`);
          console.log(`   → ${data.debug.tradesWithAllNull} trades had all null stats`);
          if (data.debug.sampleRejectedTrade) {
            console.log('   → Sample rejected trade:', JSON.stringify(data.debug.sampleRejectedTrade, null, 2));
          }
        }
      }
    }

    console.log();
    console.log('='.repeat(80));
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
    console.error(error.stack);
  }
}

testFireFeedAPI();
