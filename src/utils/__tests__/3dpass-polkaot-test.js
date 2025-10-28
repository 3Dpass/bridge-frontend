/**
 * Test 3DPass Polkadot provider integration in parallel discovery
 */

import { discoverAllBridgeEvents } from '../parallel-bridge-discovery.js';

const TEST_BRIDGE_CONFIGS = [
  {
    bridgeAddress: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C', // P3D bridge on 3DPass
    networkKey: 'THREEDPASS',
    bridgeType: 'export',
    homeNetwork: 'THREEDPASS',
    foreignNetwork: 'ETHEREUM'
  }
];

async function test3DPassPolkadotIntegration() {
  console.log('🧪 Testing 3DPass Polkadot provider integration...');
  console.log('');
  
  try {
    const startTime = Date.now();
    
    // Test parallel discovery with 3DPass only
    const results = await discoverAllBridgeEvents(TEST_BRIDGE_CONFIGS, {
      limit: 10, // Small limit for faster testing
      includeClaimData: false
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('✅ 3DPass parallel discovery completed!');
    console.log(`⏱️ Duration: ${duration}ms`);
    console.log('');
    
    // Display results
    console.log('📊 3DPass Discovery Results:');
    console.log(`  Total Bridges: ${results.stats.totalBridges}`);
    console.log(`  Successful Bridges: ${results.stats.successfulBridges}`);
    console.log(`  Total Events: ${results.stats.totalEvents}`);
    console.log(`  Total Transfers: ${results.stats.totalTransfers}`);
    console.log(`  Total Claims: ${results.stats.totalClaims}`);
    console.log(`  Matched Pairs: ${results.stats.matchedPairs}`);
    console.log('');
    
    // Display per-bridge results
    console.log('🌐 3DPass Bridge Results:');
    results.bridgeResults.forEach((result, index) => {
      const config = TEST_BRIDGE_CONFIGS[index];
      console.log(`  ${config.networkKey} (${config.bridgeType}):`);
      console.log(`    Events: ${result.events.length}`);
      console.log(`    Transfers: ${result.transfers.length}`);
      console.log(`    Claims: ${result.claims.length}`);
      console.log(`    Matched: ${result.matchedTransfers.length}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      
      // Show event details if any
      if (result.events.length > 0) {
        console.log(`    Event Details:`);
        result.events.slice(0, 3).forEach((event, i) => {
          console.log(`      Event ${i + 1}: ${event.eventType} - txid: ${event.txid}`);
        });
      }
    });
    
    console.log('');
    console.log('🎯 3DPass Polkadot integration test completed!');
    
  } catch (error) {
    console.error('❌ 3DPass Polkadot integration test failed:', error);
  }
}

// Run the test
test3DPassPolkadotIntegration();
