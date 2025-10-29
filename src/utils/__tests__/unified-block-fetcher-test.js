/**
 * Test the updated unified-block-fetcher.js with eth_getLogs as primary source
 */

import { 
  getEventBlockNumbersUnified, 
  getAllEventBlockNumbersUnified,
  testNetworkConnection 
} from '../unified-block-fetcher.js';

const TEST_BRIDGES = {
  ETHEREUM: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Import Bridge
  BSC: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge
  THREEDPASS: '0x65101a5889F33E303b3753aa7311161F6C708F27' // P3D Export Bridge
};

async function testUnifiedBlockFetcher() {
  console.log('🧪 Testing updated unified-block-fetcher.js with eth_getLogs as primary source...');
  console.log('');

  try {
    // Test 1: Network connection tests
    console.log('📡 Testing network connections...');
    for (const [networkKey, bridgeAddress] of Object.entries(TEST_BRIDGES)) {
      console.log(`\n  Testing ${networkKey} connection...`);
      try {
        const isConnected = await testNetworkConnection(networkKey);
        console.log(`  ${isConnected ? '✅' : '❌'} ${networkKey}: ${isConnected ? 'Connected' : 'Failed'}`);
      } catch (error) {
        console.log(`  ❌ ${networkKey}: Error - ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Testing event fetching for each network...');
    console.log('='.repeat(60));

    // Test 2: Get all events for each network
    for (const [networkKey, bridgeAddress] of Object.entries(TEST_BRIDGES)) {
      console.log(`\n🌐 Testing ${networkKey} (${bridgeAddress})`);
      console.log('-'.repeat(50));

      try {
        // Test getting all events
        console.log('  🔍 Getting all events...');
        const allEventsResult = await getAllEventBlockNumbersUnified(networkKey, bridgeAddress, {
          fromBlock: '0x0',
          toBlock: 'latest'
        });

        console.log(`  ✅ All Events Result:`);
        console.log(`    Source: ${allEventsResult.source}`);
        console.log(`    Event Count: ${allEventsResult.eventCount}`);
        console.log(`    Block Count: ${allEventsResult.blockNumbers.length}`);
        console.log(`    Network: ${allEventsResult.network}`);
        
        if (allEventsResult.eventBreakdown) {
          console.log(`    Event Breakdown:`);
          Object.entries(allEventsResult.eventBreakdown).forEach(([eventType, count]) => {
            console.log(`      ${eventType}: ${count}`);
          });
        }

        // Test getting specific event types
        const eventTypes = ['NewClaim', 'NewExpatriation', 'NewRepatriation'];
        
        for (const eventType of eventTypes) {
          console.log(`\n  🔍 Getting ${eventType} events...`);
          try {
            const eventResult = await getEventBlockNumbersUnified(networkKey, bridgeAddress, eventType, {
              fromBlock: '0x0',
              toBlock: 'latest'
            });

            console.log(`    ✅ ${eventType}:`);
            console.log(`      Source: ${eventResult.source}`);
            console.log(`      Event Count: ${eventResult.eventCount}`);
            console.log(`      Block Count: ${eventResult.blockNumbers.length}`);
            
            if (eventResult.eventBreakdown) {
              console.log(`      Event Breakdown:`);
              Object.entries(eventResult.eventBreakdown).forEach(([eventType, count]) => {
                console.log(`        ${eventType}: ${count}`);
              });
            }
          } catch (eventError) {
            console.log(`    ⚠️ ${eventType}: ${eventError.message}`);
          }
        }

      } catch (error) {
        console.log(`  ❌ Error testing ${networkKey}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 Testing completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testUnifiedBlockFetcher();
