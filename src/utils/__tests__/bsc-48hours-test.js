/**
 * Simple BSC txid test with single 48-hour range request
 */

import { ethers } from 'ethers';

// Test configuration for BSC using drpc.org
const TEST_CONFIG = {
  name: 'BSC',
  bridgeAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge on BSC
  rpcUrl: 'https://bsc.drpc.org',
  chainId: 56
};

// Counterstake ABI
const COUNTERSTAKE_ABI = [
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)"
];

async function testBSC48Hours() {
  console.log('🧪 ===== BSC TXID TEST - 1K BLOCKS RANGE =====');
  console.log(`Testing ${TEST_CONFIG.name} network with bridge ${TEST_CONFIG.bridgeAddress}`);
  console.log(`RPC URL: ${TEST_CONFIG.rpcUrl}`);
  
  try {
    // Create provider using drpc.org
    const provider = new ethers.providers.JsonRpcProvider(TEST_CONFIG.rpcUrl, {
      name: TEST_CONFIG.name.toLowerCase(),
      chainId: TEST_CONFIG.chainId
    });
    
    const contract = new ethers.Contract(TEST_CONFIG.bridgeAddress, COUNTERSTAKE_ABI, provider);
    
    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    console.log(`  Current BSC block: ${currentBlock}`);
    
    // Calculate 1,000 blocks ago (about 50 minutes at 3 seconds per block)
    const blocks1000Ago = currentBlock - 1000;
    const fromBlock = Math.max(0, blocks1000Ago);
    
    console.log(`  Querying BSC NewClaim events from block ${fromBlock} to ${currentBlock}`);
    console.log(`  Range: ${currentBlock - fromBlock} blocks (about 50 minutes)`);
    
    // Single request for 48 hours
    const filter = contract.filters.NewClaim();
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`  ✅ Found ${events.length} NewClaim events in 1,000 blocks`);
    
    if (events.length > 0) {
      console.log('\n🔍 BSC NewClaim events details:');
      events.forEach((event, index) => {
        console.log(`\n    Event ${index + 1}:`);
        console.log(`      claim_num: ${event.args.claim_num?.toString()}`);
        console.log(`      txid: "${event.args.txid}"`);
        console.log(`      hasTxid: ${!!event.args.txid}`);
        console.log(`      txidType: ${typeof event.args.txid}`);
        console.log(`      txidLength: ${event.args.txid?.length}`);
        console.log(`      sender_address: "${event.args.sender_address}"`);
        console.log(`      recipient_address: ${event.args.recipient_address}`);
        console.log(`      amount: ${event.args.amount?.toString()}`);
        console.log(`      reward: ${event.args.reward?.toString()}`);
        console.log(`      blockNumber: ${event.blockNumber}`);
        console.log(`      transactionHash: ${event.transactionHash}`);
      });
      
      // Summary
      console.log('\n📊 BSC 1K-BLOCKS SUMMARY:');
      console.log(`  Total events: ${events.length}`);
      console.log(`  Events with txid: ${events.filter(e => !!e.args.txid).length}`);
      console.log(`  Events without txid: ${events.filter(e => !e.args.txid).length}`);
      console.log(`  ✅ BSC txid extraction: SUCCESS`);
    } else {
      console.log('  ❌ No NewClaim events found in 1,000 blocks');
      console.log(`  ❌ BSC txid extraction: NO EVENTS FOUND`);
    }
    
  } catch (error) {
    console.error('❌ Error in BSC txid test:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testBSC48Hours();
