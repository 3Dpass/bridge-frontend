/**
 * Test BSC fallback integration in unified-block-fetcher
 */

import { getNewClaimBlockNumbersUnified, testNetworkConnection } from '../unified-block-fetcher.js';

async function runBSCFallbackTest() {
  console.log('🧪 ===== BSC Fallback Integration Test =====');
  
  const bridgeAddress = '0x078E7A2037b63846836E9d721cf2dabC08b94281';
  
  try {
    // Test network connection with BSC fallback
    console.log('\n🔍 Testing BSC network connection with fallback...');
    const connectionTest = await testNetworkConnection('BSC');
    console.log(`BSC Connection Test: ${connectionTest ? '✅ Success' : '❌ Failed'}`);
    
    // Test getting block numbers with BSC fallback
    console.log('\n🔍 Testing BSC block number fetching with fallback...');
    const result = await getNewClaimBlockNumbersUnified('BSC', bridgeAddress, {
      delay: 2000,
      retries: 2
    });
    
    if (result.blockNumbers && result.blockNumbers.length > 0) {
      console.log('\n✅ BSC fallback integration successful!');
      console.log(`Found ${result.blockNumbers.length} block numbers`);
      console.log(`Network: ${result.network}`);
      console.log(`Source: ${result.source}`);
      
      console.log('\n📋 Block Numbers Found:');
      result.blockNumbers.slice(0, 10).forEach((block, index) => {
        console.log(`  ${index + 1}. Block ${block}`);
      });
      
      if (result.blockNumbers.length > 10) {
        console.log(`  ... and ${result.blockNumbers.length - 10} more blocks`);
      }
    } else {
      console.log('\n❌ BSC fallback integration failed');
      console.log(`No block numbers found`);
    }
    
    // Summary
    console.log('\n📊 ===== Test Summary =====');
    console.log(`Connection Test: ${connectionTest ? '✅' : '❌'}`);
    console.log(`Block Numbers: ${result.blockNumbers ? result.blockNumbers.length : 0}`);
    console.log(`Network: ${result.network || 'Unknown'}`);
    console.log(`Source: ${result.source || 'Unknown'}`);
    
    return {
      success: connectionTest && result.blockNumbers && result.blockNumbers.length > 0,
      connectionTest,
      blockCount: result.blockNumbers ? result.blockNumbers.length : 0,
      network: result.network,
      source: result.source
    };
    
  } catch (error) {
    console.error('❌ Error running BSC fallback test:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
runBSCFallbackTest();
