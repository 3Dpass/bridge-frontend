/**
 * Test the new parallel bridge discovery system
 */

import { discoverAllBridgeEvents } from '../parallel-bridge-discovery.js';

const TEST_BRIDGE_CONFIGS = [
  {
    bridgeAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Export Bridge on Ethereum
    networkKey: 'ETHEREUM',
    bridgeType: 'export',
    homeNetwork: 'ETHEREUM',
    foreignNetwork: 'THREEDPASS'
  },
  {
    bridgeAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge on BSC
    networkKey: 'BSC',
    bridgeType: 'import',
    homeNetwork: 'BSC',
    foreignNetwork: 'ETHEREUM'
  },
  {
    bridgeAddress: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C', // P3D bridge on 3DPass
    networkKey: 'THREEDPASS',
    bridgeType: 'export',
    homeNetwork: 'THREEDPASS',
    foreignNetwork: 'ETHEREUM'
  }
];

async function testParallelDiscovery() {
  console.log('🧪 Testing parallel bridge discovery system...');
  console.log('Testing all three networks (Ethereum, BSC, 3DPass) in parallel');
  console.log('');
  
  try {
    const startTime = Date.now();
    
    console.log('🚀 Starting parallel discovery for all networks...');
    console.log(`  - Ethereum: ${TEST_BRIDGE_CONFIGS[0].bridgeAddress}`);
    console.log(`  - BSC: ${TEST_BRIDGE_CONFIGS[1].bridgeAddress}`);
    console.log(`  - 3DPass: ${TEST_BRIDGE_CONFIGS[2].bridgeAddress}`);
    console.log('');
    
    // Test parallel discovery with all three networks
    const results = await discoverAllBridgeEvents(TEST_BRIDGE_CONFIGS, {
      limit: 20, // Increased limit to get more comprehensive results
      includeClaimData: false
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('✅ Parallel discovery completed!');
    console.log(`⏱️ Total Duration: ${duration}ms`);
    console.log(`⚡ Average per bridge: ${Math.round(duration / TEST_BRIDGE_CONFIGS.length)}ms`);
    console.log('');
    
    // Display overall results
    console.log('📊 Overall Discovery Results:');
    console.log(`  Total Bridges: ${results.stats.totalBridges}`);
    console.log(`  Successful Bridges: ${results.stats.successfulBridges}`);
    console.log(`  Failed Bridges: ${results.stats.totalBridges - results.stats.successfulBridges}`);
    console.log(`  Total Events: ${results.stats.totalEvents}`);
    console.log(`  Total Transfers: ${results.stats.totalTransfers}`);
    console.log(`  Total Claims: ${results.stats.totalClaims}`);
    console.log(`  Matched Pairs: ${results.stats.matchedPairs}`);
    console.log('');
    
    // Display detailed per-bridge results
    console.log('🌐 Detailed Per-Bridge Results:');
    results.bridgeResults.forEach((result, index) => {
      const config = TEST_BRIDGE_CONFIGS[index];
      const status = result.error ? '❌' : '✅';
      
      console.log(`\n  ${status} ${config.networkKey} (${config.bridgeType}):`);
      console.log(`    Bridge Address: ${config.bridgeAddress}`);
      console.log(`    Home Network: ${config.homeNetwork}`);
      console.log(`    Foreign Network: ${config.foreignNetwork}`);
      
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      } else {
        console.log(`    Events Found: ${result.events.length}`);
        console.log(`    Transfers: ${result.transfers.length}`);
        console.log(`    Claims: ${result.claims.length}`);
        console.log(`    Matched Pairs: ${result.matchedTransfers.length}`);
        
        // Show event breakdown
        const expatriations = result.events.filter(e => e.eventType === 'NewExpatriation').length;
        const repatriations = result.events.filter(e => e.eventType === 'NewRepatriation').length;
        const claims = result.events.filter(e => e.eventType === 'NewClaim').length;
        
        console.log(`    Event Breakdown:`);
        console.log(`      - NewExpatriation: ${expatriations}`);
        console.log(`      - NewRepatriation: ${repatriations}`);
        console.log(`      - NewClaim: ${claims}`);
        
        // Show sample events if any
        if (result.events.length > 0) {
          console.log(`    Sample Events:`);
          result.events.slice(0, 3).forEach((event, i) => {
            console.log(`      ${i + 1}. ${event.eventType} - txid: ${event.txid}`);
          });
          if (result.events.length > 3) {
            console.log(`      ... and ${result.events.length - 3} more events`);
          }
        }
      }
    });
    
    // Performance analysis
    console.log('\n⚡ Performance Analysis:');
    const successfulBridges = results.bridgeResults.filter(r => !r.error);
    if (successfulBridges.length > 0) {
      const avgEventsPerBridge = successfulBridges.reduce((sum, r) => sum + r.events.length, 0) / successfulBridges.length;
      const avgTransfersPerBridge = successfulBridges.reduce((sum, r) => sum + r.transfers.length, 0) / successfulBridges.length;
      const avgClaimsPerBridge = successfulBridges.reduce((sum, r) => sum + r.claims.length, 0) / successfulBridges.length;
      
      console.log(`  Average Events per Bridge: ${avgEventsPerBridge.toFixed(1)}`);
      console.log(`  Average Transfers per Bridge: ${avgTransfersPerBridge.toFixed(1)}`);
      console.log(`  Average Claims per Bridge: ${avgClaimsPerBridge.toFixed(1)}`);
      console.log(`  Events per Second: ${(results.stats.totalEvents / (duration / 1000)).toFixed(1)}`);
    }
    
    // Success assessment
    console.log('\n🎯 Success Assessment:');
    const allSuccessful = results.stats.successfulBridges === results.stats.totalBridges;
    const hasEvents = results.stats.totalEvents > 0;
    const hasMatches = results.stats.matchedPairs > 0;
    
    if (allSuccessful && hasEvents) {
      console.log('  ✅ ALL NETWORKS: SUCCESS - All bridges processed successfully with events found!');
      if (hasMatches) {
        console.log('  ✅ MATCHING: SUCCESS - Transfer-claim pairs successfully matched!');
      } else {
        console.log('  ⚠️ MATCHING: No transfer-claim pairs found (this may be normal)');
      }
    } else if (allSuccessful) {
      console.log('  ⚠️ PARTIAL: All bridges processed but no events found');
    } else {
      console.log('  ❌ FAILED: Some bridges failed to process');
    }
    
    console.log('\n🎯 Parallel discovery test completed!');
    
  } catch (error) {
    console.error('❌ Parallel discovery test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testParallelDiscovery();
