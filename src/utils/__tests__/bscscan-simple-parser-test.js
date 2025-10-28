/**
 * Test BSCScan Simple Parser
 * Target: https://bscscan.com/txs?a=0x078E7A2037b63846836E9d721cf2dabC08b94281
 */

import { parseBSCScanBlockNumbers, testBSCScanSimpleParser } from '../bscscan-simple-parser.js';

async function runBSCScanSimpleParserTest() {
  console.log('🧪 ===== BSCScan Simple Parser Test =====');
  console.log('🎯 Target URL: https://bscscan.com/txs?a=0x078E7A2037b63846836E9d721cf2dabC08b94281');
  
  try {
    // Parse the transactions page for block numbers
    console.log('\n🔍 Parsing BSCScan transactions page for block numbers...');
    const bridgeAddress = '0x078E7A2037b63846836E9d721cf2dabC08b94281';
    const result = await parseBSCScanBlockNumbers(bridgeAddress, {
      delay: 2000,
      retries: 3
    });
    
    if (result.success) {
      console.log('\n✅ BSCScan simple parser completed successfully!');
      console.log(`Found ${result.blockNumbers.length} block numbers`);
      
      if (result.blockNumbers.length > 0) {
        console.log('\n📋 Block Numbers Found:');
        result.blockNumbers.forEach((block, index) => {
          console.log(`  ${index + 1}. Block ${block}`);
        });
      }
    } else {
      console.log('\n❌ BSCScan simple parser failed');
      console.log(`Error: ${result.error}`);
    }
    
    // Summary
    console.log('\n📊 ===== Test Summary =====');
    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    console.log(`Block Numbers: ${result.blockNumbers.length}`);
    console.log(`Error: ${result.error || 'None'}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error running BSCScan simple parser test:', error);
    return {
      success: false,
      blockNumbers: [],
      error: error.message
    };
  }
}

// Run the test
runBSCScanSimpleParserTest();
