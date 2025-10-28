/**
 * Simple test for txid fetching from NewClaim events
 */

import { ethers } from 'ethers';
import { NETWORKS } from '../../config/networks.js';

// Test configurations for different networks
const TEST_CONFIGS = [
  {
    name: '3DPass',
    bridgeAddress: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F', // P3D Export Bridge
    networkKey: 'THREEDPASS',
    rpcUrl: NETWORKS.THREEDPASS.rpcUrl,
    chainId: NETWORKS.THREEDPASS.id
  },
  {
    name: 'Ethereum',
    bridgeAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Import Bridge
    networkKey: 'ETHEREUM',
    rpcUrl: NETWORKS.ETHEREUM.rpcUrl,
    chainId: NETWORKS.ETHEREUM.id
  },
  {
    name: 'BSC',
    bridgeAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge
    networkKey: 'BSC',
    rpcUrl: NETWORKS.BSC.rpcUrl,
    chainId: NETWORKS.BSC.id
  }
];

// Counterstake ABI with NewClaim event
const COUNTERSTAKE_ABI = [
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)"
];

async function testTxidFetching() {
  console.log('🧪 ===== SIMPLE TXID FETCHING TEST =====');
  
  for (const config of TEST_CONFIGS) {
    console.log(`\n🔍 Testing ${config.name} network...`);
    console.log(`  Bridge: ${config.bridgeAddress}`);
    console.log(`  RPC: ${config.rpcUrl}`);
    
    try {
      // Create provider with explicit network configuration
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl, {
        name: config.name.toLowerCase(),
        chainId: config.chainId
      });
      
      const contract = new ethers.Contract(config.bridgeAddress, COUNTERSTAKE_ABI, provider);
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      console.log(`  Current block number: ${currentBlock}`);
      
      // Query recent blocks for NewClaim events
      const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10000 blocks
      const toBlock = currentBlock;
      
      console.log(`  Querying NewClaim events from block ${fromBlock} to ${toBlock}`);
      
      const filter = contract.filters.NewClaim();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      
      console.log(`  ✅ Found ${events.length} NewClaim events in recent blocks`);
      
      if (events.length > 0) {
        console.log(`\n  🔍 Event details for ${config.name}:`);
        events.slice(0, 3).forEach((event, index) => {
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
          console.log(`      logIndex: ${event.logIndex}`);
          
          // Test manual parsing
          const parsedEvent = {
            claim_num: event.args.claim_num,
            author_address: event.args.author_address,
            sender_address: event.args.sender_address,
            recipient_address: event.args.recipient_address,
            txid: event.args.txid,
            txts: event.args.txts,
            amount: event.args.amount,
            reward: event.args.reward,
            stake: event.args.stake,
            data: event.args.data,
            expiry_ts: event.args.expiry_ts,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex
          };
          
          console.log(`      Parsed txid: "${parsedEvent.txid}"`);
          console.log(`      Parsed hasTxid: ${!!parsedEvent.txid}`);
        });
      } else {
        console.log(`  ❌ No NewClaim events found in recent blocks for ${config.name}`);
        
        // Try a wider range
        console.log(`  🔍 Trying wider block range for ${config.name}...`);
        const widerFromBlock = Math.max(0, currentBlock - 100000);
        const widerEvents = await contract.queryFilter(filter, widerFromBlock, toBlock);
        console.log(`  Found ${widerEvents.length} NewClaim events in wider range`);
        
        if (widerEvents.length > 0) {
          console.log(`  🔍 First event from wider range for ${config.name}:`);
          const firstEvent = widerEvents[0];
          console.log(`    txid: "${firstEvent.args.txid}"`);
          console.log(`    hasTxid: ${!!firstEvent.args.txid}`);
          console.log(`    txidType: ${typeof firstEvent.args.txid}`);
        }
      }
      
    } catch (error) {
      console.error(`  ❌ Error testing ${config.name}:`, error.message);
    }
  }
  
  console.log('\n✅ ===== ALL TESTS COMPLETED =====');
}

// Run the test
testTxidFetching();