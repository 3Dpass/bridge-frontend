/**
 * Debug test for txid fetching from NewClaim events
 * This test traces through the entire flow to identify where txid is lost
 */

import { ethers } from 'ethers';
import { getNewClaimEvents } from '../bridge-contracts.js';
import { getNewClaimBlockNumbersUnified } from '../unified-block-fetcher.js';
import { NETWORKS } from '../../config/networks.js';

// Test configuration
const TEST_CONFIG = {
  // Use a known bridge address that has NewClaim events
  bridgeAddress: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F', // P3D Export Bridge on 3DPass
  networkKey: 'THREEDPASS',
  rpcUrl: 'https://rpc.3dpass.org',
  limit: 10
};

/**
 * Test the complete flow: block fetching -> event parsing -> txid extraction
 */
async function testTxidFetchingFlow() {
  console.log('🧪 ===== TXID FETCHING DEBUG TEST =====');
  console.log('🧪 Testing with:', TEST_CONFIG);
  
  try {
    // Step 1: Test unified block fetcher
    console.log('\n🔍 Step 1: Testing unified block fetcher...');
    const blockResult = await getNewClaimBlockNumbersUnified(
      TEST_CONFIG.networkKey,
      TEST_CONFIG.bridgeAddress,
      { limit: TEST_CONFIG.limit }
    );
    
    console.log('✅ Block fetcher result:', {
      blockNumbers: blockResult.blockNumbers?.length || 0,
      eventCount: blockResult.eventCount || 0,
      events: blockResult.events?.length || 0,
      network: blockResult.network,
      source: blockResult.source
    });
    
    if (blockResult.events && blockResult.events.length > 0) {
      console.log('🔍 First few events from block fetcher:', blockResult.events.slice(0, 3));
    }
    
    // Step 2: Test direct contract query with provider
    console.log('\n🔍 Step 2: Testing direct contract query...');
    const provider = new ethers.providers.JsonRpcProvider(TEST_CONFIG.rpcUrl);
    
    // Create contract instance
    const COUNTERSTAKE_ABI = [
      "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)"
    ];
    
    const contract = new ethers.Contract(TEST_CONFIG.bridgeAddress, COUNTERSTAKE_ABI, provider);
    
    // Query recent blocks for NewClaim events
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10000 blocks
    const toBlock = currentBlock;
    
    console.log(`🔍 Querying NewClaim events from block ${fromBlock} to ${toBlock}`);
    
    const filter = contract.filters.NewClaim();
    const events = await contract.queryFilter(filter, fromBlock, toBlock);
    
    console.log(`✅ Found ${events.length} NewClaim events in recent blocks`);
    
    if (events.length > 0) {
      console.log('🔍 First few events from direct query:');
      events.slice(0, 3).forEach((event, index) => {
        console.log(`  Event ${index + 1}:`, {
          claim_num: event.args.claim_num?.toString(),
          txid: event.args.txid,
          hasTxid: !!event.args.txid,
          txidType: typeof event.args.txid,
          txidLength: event.args.txid?.length,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex
        });
      });
    }
    
    // Step 3: Test getNewClaimEvents function
    console.log('\n🔍 Step 3: Testing getNewClaimEvents function...');
    const newClaimEvents = await getNewClaimEvents(contract, TEST_CONFIG.limit, TEST_CONFIG.networkKey);
    
    console.log(`✅ getNewClaimEvents returned ${newClaimEvents.length} events`);
    
    if (newClaimEvents.length > 0) {
      console.log('🔍 First few events from getNewClaimEvents:');
      newClaimEvents.slice(0, 3).forEach((event, index) => {
        console.log(`  Event ${index + 1}:`, {
          claim_num: event.claim_num?.toString(),
          txid: event.txid,
          hasTxid: !!event.txid,
          txidType: typeof event.txid,
          txidLength: event.txid?.length,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          amount: event.amount?.toString(),
          reward: event.reward?.toString(),
          sender_address: event.sender_address,
          recipient_address: event.recipient_address
        });
      });
    }
    
    // Step 4: Test event parsing and txid extraction
    console.log('\n🔍 Step 4: Testing event parsing and txid extraction...');
    
    if (events.length > 0) {
      const firstEvent = events[0];
      console.log('🔍 Raw event data:', {
        args: firstEvent.args,
        blockNumber: firstEvent.blockNumber,
        transactionHash: firstEvent.transactionHash,
        logIndex: firstEvent.logIndex
      });
      
      // Test manual parsing
      const manualParsed = {
        claim_num: firstEvent.args.claim_num,
        author_address: firstEvent.args.author_address,
        sender_address: firstEvent.args.sender_address,
        recipient_address: firstEvent.args.recipient_address,
        txid: firstEvent.args.txid,
        txts: firstEvent.args.txts,
        amount: firstEvent.args.amount,
        reward: firstEvent.args.reward,
        stake: firstEvent.args.stake,
        data: firstEvent.args.data,
        expiry_ts: firstEvent.args.expiry_ts,
        blockNumber: firstEvent.blockNumber,
        transactionHash: firstEvent.transactionHash,
        logIndex: firstEvent.logIndex
      };
      
      console.log('🔍 Manually parsed event:', {
        claim_num: manualParsed.claim_num?.toString(),
        txid: manualParsed.txid,
        hasTxid: !!manualParsed.txid,
        txidType: typeof manualParsed.txid,
        txidLength: manualParsed.txid?.length,
        sender_address: manualParsed.sender_address,
        recipient_address: manualParsed.recipient_address,
        amount: manualParsed.amount?.toString(),
        reward: manualParsed.reward?.toString()
      });
    }
    
    // Step 5: Test with different network configurations
    console.log('\n🔍 Step 5: Testing with different network configurations...');
    
    const networks = ['ETHEREUM', 'BSC', 'THREEDPASS'];
    for (const networkKey of networks) {
      try {
        console.log(`🔍 Testing ${networkKey}...`);
        const networkConfig = NETWORKS[networkKey];
        if (networkConfig && networkConfig.rpcUrl) {
          const testProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
          const testContract = new ethers.Contract(TEST_CONFIG.bridgeAddress, COUNTERSTAKE_ABI, testProvider);
          
          // Try to get a few recent events
          const testEvents = await testContract.queryFilter(filter, fromBlock, toBlock);
          console.log(`  ${networkKey}: Found ${testEvents.length} events`);
          
          if (testEvents.length > 0) {
            const testEvent = testEvents[0];
            console.log(`  ${networkKey} first event txid:`, {
              txid: testEvent.args.txid,
              hasTxid: !!testEvent.args.txid,
              txidType: typeof testEvent.args.txid
            });
          }
        } else {
          console.log(`  ${networkKey}: No RPC URL configured`);
        }
      } catch (error) {
        console.log(`  ${networkKey}: Error - ${error.message}`);
      }
    }
    
    console.log('\n✅ ===== TXID FETCHING DEBUG TEST COMPLETED =====');
    
  } catch (error) {
    console.error('❌ Error in txid fetching debug test:', error);
    console.error('Stack trace:', error.stack);
  }
}

/**
 * Test specific bridge addresses that are known to have NewClaim events
 */
async function testKnownBridges() {
  console.log('\n🧪 ===== TESTING KNOWN BRIDGES =====');
  
  const knownBridges = [
    {
      address: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F',
      network: 'THREEDPASS',
      rpcUrl: 'https://rpc.3dpass.org',
      name: 'P3D Export Bridge'
    },
    // Add more known bridges here
  ];
  
  for (const bridge of knownBridges) {
    console.log(`\n🔍 Testing ${bridge.name} (${bridge.address}) on ${bridge.network}`);
    
    try {
      const provider = new ethers.providers.JsonRpcProvider(bridge.rpcUrl);
      const COUNTERSTAKE_ABI = [
        "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)"
      ];
      
      const contract = new ethers.Contract(bridge.address, COUNTERSTAKE_ABI, provider);
      
      // Get recent events
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000); // Last ~50000 blocks
      const toBlock = currentBlock;
      
      const filter = contract.filters.NewClaim();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      
      console.log(`  Found ${events.length} NewClaim events`);
      
      if (events.length > 0) {
        console.log('  Recent events:');
        events.slice(0, 5).forEach((event, index) => {
          console.log(`    Event ${index + 1}:`, {
            claim_num: event.args.claim_num?.toString(),
            txid: event.args.txid,
            hasTxid: !!event.args.txid,
            txidType: typeof event.args.txid,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash
          });
        });
      }
      
    } catch (error) {
      console.error(`  Error testing ${bridge.name}:`, error.message);
    }
  }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testTxidFetchingFlow()
    .then(() => testKnownBridges())
    .then(() => {
      console.log('\n🎉 All tests completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

export { testTxidFetchingFlow, testKnownBridges };
