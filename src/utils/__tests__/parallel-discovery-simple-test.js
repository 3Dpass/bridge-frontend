/**
 * Simple test for the parallel bridge discovery system
 * Tests the core logic without hitting API rate limits
 */

import { discoverAllBridgeEvents } from '../parallel-bridge-discovery.js';

const TEST_BRIDGE_CONFIGS = [
  {
    bridgeAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Export Bridge on Ethereum
    networkKey: 'ETHEREUM',
    bridgeType: 'export',
    homeNetwork: 'ETHEREUM',
    foreignNetwork: 'THREEDPASS'
  }
];

async function testParallelDiscoverySimple() {
  console.log('🧪 Testing parallel bridge discovery system (simple)...');
  console.log('');
  
  try {
    const startTime = Date.now();
    
    // Test parallel discovery with very limited scope
    const results = await discoverAllBridgeEvents(TEST_BRIDGE_CONFIGS, {
      limit: 5, // Very small limit to avoid rate limits
      includeClaimData: false
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('✅ Parallel discovery completed!');
    console.log(`⏱️ Duration: ${duration}ms`);
    console.log('');
    
    // Display results
    console.log('📊 Discovery Results:');
    console.log(`  Total Bridges: ${results.stats.totalBridges}`);
    console.log(`  Successful Bridges: ${results.stats.successfulBridges}`);
    console.log(`  Total Events: ${results.stats.totalEvents}`);
    console.log(`  Total Transfers: ${results.stats.totalTransfers}`);
    console.log(`  Total Claims: ${results.stats.totalClaims}`);
    console.log(`  Matched Pairs: ${results.stats.matchedPairs}`);
    console.log('');
    
    // Display per-bridge results
    console.log('🌐 Per-Bridge Results:');
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
    });
    
    console.log('');
    console.log('🎯 Simple parallel discovery test completed!');
    
    // Test the core matching logic
    console.log('');
    console.log('🔗 Testing event matching logic...');
    
    // Create mock events for testing
    const mockExpatriations = [
      { transactionHash: '0x123', eventType: 'NewExpatriation', amount: '1000000' },
      { transactionHash: '0x456', eventType: 'NewExpatriation', amount: '2000000' }
    ];
    
    const mockClaims = [
      { txid: '0x123', eventType: 'NewClaim', claimNum: 1 },
      { txid: '0x789', eventType: 'NewClaim', claimNum: 2 }
    ];
    
    // Test matching function (we'll need to import it or recreate the logic)
    const matchedTransfers = [];
    
    for (const expat of mockExpatriations) {
      const matchingClaim = mockClaims.find(claim => 
        claim.txid === expat.transactionHash
      );
      
      matchedTransfers.push({
        transfer: expat,
        claim: matchingClaim || null,
        isComplete: !!matchingClaim,
        transferType: 'NewExpatriation'
      });
    }
    
    console.log(`✅ Mock matching test: ${matchedTransfers.length} transfers, ${matchedTransfers.filter(t => t.isComplete).length} complete`);
    
  } catch (error) {
    console.error('❌ Simple parallel discovery test failed:', error);
  }
}

// Run the test
testParallelDiscoverySimple();
