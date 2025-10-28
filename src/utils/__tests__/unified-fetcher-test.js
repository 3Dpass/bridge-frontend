/**
 * Test the unified fetcher to see if it now captures all NewClaim events
 */

import { ethers } from 'ethers';
import { NETWORKS } from '../../config/networks.js';
import { getNewClaimBlockNumbersUnified } from '../unified-block-fetcher.js';

// Test configuration
const TEST_CONFIG = {
  name: 'Ethereum',
  bridgeAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Import Bridge
  networkKey: 'ETHEREUM',
  rpcUrl: NETWORKS.ETHEREUM.rpcUrl,
  chainId: NETWORKS.ETHEREUM.id
};

// Counterstake ABI
const COUNTERSTAKE_ABI = [
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  "function last_claim_num() view returns (uint64)"
];

async function testUnifiedFetcher() {
  console.log('🧪 ===== UNIFIED FETCHER TEST =====');
  console.log(`Testing ${TEST_CONFIG.name} network with bridge ${TEST_CONFIG.bridgeAddress}`);
  
  try {
    // Step 1: Test unified block fetcher
    console.log('\n🔍 Step 1: Testing unified block fetcher...');
    const blockResult = await getNewClaimBlockNumbersUnified(
      TEST_CONFIG.networkKey,
      TEST_CONFIG.bridgeAddress,
      { limit: 50 } // Increased limit
    );
    
    console.log('✅ Block fetcher result:', {
      blockNumbers: blockResult.blockNumbers?.length || 0,
      eventCount: blockResult.eventCount || 0,
      events: blockResult.events?.length || 0,
      network: blockResult.network,
      source: blockResult.source
    });
    
    if (blockResult.events && blockResult.events.length > 0) {
      console.log('\n🔍 Events from unified fetcher:');
      blockResult.events.slice(0, 10).forEach((event, index) => {
        console.log(`  Event ${index + 1}: Block ${event.blockNumber}, Tx ${event.transactionHash}`);
      });
    }
    
    // Step 2: Test direct contract query with the block numbers from unified fetcher
    console.log('\n🔍 Step 2: Testing contract query with unified fetcher blocks...');
    
    const provider = new ethers.providers.JsonRpcProvider(TEST_CONFIG.rpcUrl, {
      name: TEST_CONFIG.name.toLowerCase(),
      chainId: TEST_CONFIG.chainId
    });
    
    const contract = new ethers.Contract(TEST_CONFIG.bridgeAddress, COUNTERSTAKE_ABI, provider);
    
    if (blockResult.blockNumbers && blockResult.blockNumbers.length > 0) {
      const fromBlock = blockResult.blockNumbers[0];
      const toBlock = blockResult.blockNumbers[blockResult.blockNumbers.length - 1];
      
      console.log(`Querying NewClaim events from block ${fromBlock} to ${toBlock}`);
      
      const filter = contract.filters.NewClaim();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      
      console.log(`✅ Found ${events.length} NewClaim events using unified fetcher blocks`);
      
      if (events.length > 0) {
        console.log('\n🔍 NewClaim events details:');
        events.forEach((event, index) => {
          console.log(`\n  Event ${index + 1}:`);
          console.log(`    claim_num: ${event.args.claim_num?.toString()}`);
          console.log(`    txid: "${event.args.txid}"`);
          console.log(`    hasTxid: ${!!event.args.txid}`);
          console.log(`    txidType: ${typeof event.args.txid}`);
          console.log(`    txidLength: ${event.args.txid?.length}`);
          console.log(`    sender_address: "${event.args.sender_address}"`);
          console.log(`    recipient_address: ${event.args.recipient_address}`);
          console.log(`    amount: ${event.args.amount?.toString()}`);
          console.log(`    reward: ${event.args.reward?.toString()}`);
          console.log(`    blockNumber: ${event.blockNumber}`);
          console.log(`    transactionHash: ${event.transactionHash}`);
        });
      }
    }
    
    // Step 3: Compare with direct query (without unified fetcher)
    console.log('\n🔍 Step 3: Comparing with direct query...');
    
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // Last 10k blocks
    const toBlock = currentBlock;
    
    console.log(`Direct query from block ${fromBlock} to ${toBlock}`);
    
    const directFilter = contract.filters.NewClaim();
    const directEvents = await contract.queryFilter(directFilter, fromBlock, toBlock);
    console.log(`Direct query found ${directEvents.length} NewClaim events`);
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`  Unified fetcher events: ${blockResult.eventCount || 0}`);
    console.log(`  Contract query with unified blocks: ${events?.length || 0}`);
    console.log(`  Direct query (last 10k blocks): ${directEvents.length}`);
    
    if (events && events.length > 0) {
      console.log(`  Events with txid: ${events.filter(e => !!e.args.txid).length}`);
      console.log(`  Events without txid: ${events.filter(e => !e.args.txid).length}`);
    }
    
  } catch (error) {
    console.error('❌ Error in unified fetcher test:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testUnifiedFetcher();
