/**
 * Test the block estimator integration with unified block fetcher
 */

import { 
  getEventBlockNumbersUnified, 
  getAllEventBlockNumbersUnified,
  testNetworkConnection 
} from '../unified-block-fetcher.js';
import { estimateBlocksFromHours, getBlockTime, getAllNetworkBlockEstimations } from '../block-estimator.js';

const TEST_BRIDGES = {
  ETHEREUM: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Import Bridge
  BSC: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge
  THREEDPASS: '0x65101a5889F33E303b3753aa7311161F6C708F27' // P3D Export Bridge
};

async function testBlockEstimatorIntegration() {
  console.log('🧪 Testing block estimator integration with unified block fetcher...');
  console.log('');

  try {
    // Test 1: Show block time calculations for each network
    console.log('📊 Block Time Analysis:');
    console.log('='.repeat(50));
    
    const timeframes = [1, 24, 48]; // 1 hour, 1 day, 2 days
    
    for (const hours of timeframes) {
      console.log(`\n⏰ ${hours} hour(s) analysis:`);
      const estimations = getAllNetworkBlockEstimations(hours);
      
      Object.entries(estimations).forEach(([networkKey, data]) => {
        console.log(`  ${networkKey}:`);
        console.log(`    Block Time: ${data.blockTime}s`);
        console.log(`    Estimated Blocks: ${data.estimatedBlocks}`);
        console.log(`    Description: ${data.description}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🌐 Testing RPC calls with block estimator optimization...');
    console.log('='.repeat(60));

    // Test 2: Test each network with 48 hours (2 days)
    for (const [networkKey, bridgeAddress] of Object.entries(TEST_BRIDGES)) {
      console.log(`\n🔍 Testing ${networkKey} with 48-hour range...`);
      console.log('-'.repeat(50));

      try {
        const result48h = await getAllEventBlockNumbersUnified(networkKey, bridgeAddress, {
          targetHours: 48
        });

        console.log(`    ✅ 48h Result:`);
        console.log(`      Source: ${result48h.source}`);
        console.log(`      Event Count: ${result48h.eventCount}`);
        console.log(`      Block Count: ${result48h.blockNumbers.length}`);
        console.log(`      Network: ${result48h.network}`);
        
        if (result48h.eventBreakdown) {
          console.log(`      Event Breakdown:`);
          Object.entries(result48h.eventBreakdown).forEach(([eventType, count]) => {
            console.log(`        ${eventType}: ${count}`);
          });
        }

      } catch (error) {
        console.log(`    ❌ Error testing ${networkKey}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 Block estimator integration test completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testBlockEstimatorIntegration();
