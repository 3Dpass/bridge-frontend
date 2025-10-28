/**
 * Main Flow Test - Tests the complete txid fetching flow with BSCScan parser fallback
 * Tests: Unified fetcher -> Block extraction -> Contract query -> txid extraction
 */

import { ethers } from 'ethers';
import { NETWORKS } from '../../config/networks.js';
import { getNewClaimBlockNumbersUnified } from '../unified-block-fetcher.js';

// Test configurations for different networks
const TEST_CONFIGS = [
  {
    name: 'BSC',
    bridgeAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge on BSC
    networkKey: 'BSC',
    rpcUrl: 'https://bsc.drpc.org',
    chainId: 56
  },
  {
    name: 'Ethereum',
    bridgeAddress: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F', // P3D Export Bridge on Ethereum
    networkKey: 'ETHEREUM',
    rpcUrl: NETWORKS.ETHEREUM.rpcUrl,
    chainId: NETWORKS.ETHEREUM.id
  }
];

// Counterstake ABI
const COUNTERSTAKE_ABI = [
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  "function last_claim_num() view returns (uint64)"
];

/**
 * Test the complete flow for a specific network
 * @param {Object} config - Network configuration
 * @returns {Promise<Object>} Test results
 */
async function testNetworkFlow(config) {
  console.log(`\n🧪 ===== TESTING ${config.name} NETWORK FLOW =====`);
  console.log(`Bridge: ${config.bridgeAddress}`);
  console.log(`RPC: ${config.rpcUrl}`);
  
  const results = {
    network: config.name,
    bridgeAddress: config.bridgeAddress,
    unifiedFetcherSuccess: false,
    blockNumbersFound: 0,
    contractQuerySuccess: false,
    eventsFound: 0,
    eventsWithTxid: 0,
    eventsWithoutTxid: 0,
    errors: []
  };
  
  try {
    // Step 1: Test unified block fetcher
    console.log('\n🔍 Step 1: Testing unified block fetcher...');
    const blockResult = await getNewClaimBlockNumbersUnified(
      config.networkKey,
      config.bridgeAddress,
      { limit: 20 }
    );
    
    console.log(`✅ Unified fetcher result:`, {
      blockNumbers: blockResult.blockNumbers?.length || 0,
      eventCount: blockResult.eventCount || 0,
      network: blockResult.network,
      source: blockResult.source
    });
    
    results.unifiedFetcherSuccess = true;
    results.blockNumbersFound = blockResult.blockNumbers?.length || 0;
    
    if (blockResult.blockNumbers && blockResult.blockNumbers.length > 0) {
      console.log(`📋 Block numbers found: ${blockResult.blockNumbers.slice(0, 5).join(', ')}`);
    }
    
    // Step 2: Test contract query with found blocks
    if (blockResult.blockNumbers && blockResult.blockNumbers.length > 0) {
      console.log('\n🔍 Step 2: Testing contract query with found blocks...');
      
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl, {
        name: config.name.toLowerCase(),
        chainId: config.chainId
      });
      
      const contract = new ethers.Contract(config.bridgeAddress, COUNTERSTAKE_ABI, provider);
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      console.log(`  Current ${config.name} block: ${currentBlock}`);
      
      // Query events from the found blocks (query each block individually to avoid range limits)
      const blocksToQuery = blockResult.blockNumbers.slice(0, 5); // Test first 5 blocks
      
      console.log(`  Querying NewClaim events in ${blocksToQuery.length} individual blocks: ${blocksToQuery.join(', ')}`);
      
      try {
        const filter = contract.filters.NewClaim();
        let allEvents = [];
        
        // Query each block individually to avoid range limits
        for (const blockNumber of blocksToQuery) {
          try {
            console.log(`    Querying block ${blockNumber}...`);
            const blockEvents = await contract.queryFilter(filter, blockNumber, blockNumber);
            console.log(`    Found ${blockEvents.length} events in block ${blockNumber}`);
            allEvents.push(...blockEvents);
          } catch (blockError) {
            console.log(`    Error querying block ${blockNumber}: ${blockError.message}`);
          }
        }
        
        const events = allEvents;
        
        console.log(`  ✅ Found ${events.length} NewClaim events in contract query`);
        
        results.contractQuerySuccess = true;
        results.eventsFound = events.length;
        
        if (events.length > 0) {
          console.log('\n🔍 NewClaim events details:');
          events.forEach((event, index) => {
            const hasTxid = !!event.args.txid;
            console.log(`\n    Event ${index + 1}:`);
            console.log(`      claim_num: ${event.args.claim_num?.toString()}`);
            console.log(`      txid: "${event.args.txid}"`);
            console.log(`      hasTxid: ${hasTxid}`);
            console.log(`      txidType: ${typeof event.args.txid}`);
            console.log(`      txidLength: ${event.args.txid?.length}`);
            console.log(`      sender_address: "${event.args.sender_address}"`);
            console.log(`      recipient_address: ${event.args.recipient_address}`);
            console.log(`      amount: ${event.args.amount?.toString()}`);
            console.log(`      reward: ${event.args.reward?.toString()}`);
            console.log(`      blockNumber: ${event.blockNumber}`);
            console.log(`      transactionHash: ${event.transactionHash}`);
            
            if (hasTxid) {
              results.eventsWithTxid++;
            } else {
              results.eventsWithoutTxid++;
            }
          });
        }
        
      } catch (contractError) {
        console.log(`  ❌ Contract query error: ${contractError.message}`);
        results.errors.push(`Contract query: ${contractError.message}`);
      }
    } else {
      console.log('  ⚠️ No block numbers found, skipping contract query');
    }
    
    // Step 3: Test last claim number
    console.log('\n🔍 Step 3: Testing last claim number...');
    try {
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl, {
        name: config.name.toLowerCase(),
        chainId: config.chainId
      });
      const contract = new ethers.Contract(config.bridgeAddress, COUNTERSTAKE_ABI, provider);
      const lastClaimNum = await contract.last_claim_num();
      console.log(`  ${config.name} last claim number: ${lastClaimNum.toString()}`);
    } catch (error) {
      console.log(`  ❌ Error getting last claim number: ${error.message}`);
      results.errors.push(`Last claim number: ${error.message}`);
    }
    
  } catch (error) {
    console.error(`❌ Error testing ${config.name} flow:`, error);
    results.errors.push(`Main flow: ${error.message}`);
  }
  
  return results;
}

/**
 * Run the main flow test for all networks
 */
async function runMainFlowTest() {
  console.log('🧪 ===== MAIN FLOW TEST - TXID FETCHING =====');
  console.log('Testing unified fetcher -> block extraction -> contract query -> txid extraction');
  
  const allResults = [];
  
  for (const config of TEST_CONFIGS) {
    try {
      const result = await testNetworkFlow(config);
      allResults.push(result);
    } catch (error) {
      console.error(`❌ Failed to test ${config.name}:`, error);
      allResults.push({
        network: config.name,
        bridgeAddress: config.bridgeAddress,
        unifiedFetcherSuccess: false,
        blockNumbersFound: 0,
        contractQuerySuccess: false,
        eventsFound: 0,
        eventsWithTxid: 0,
        eventsWithoutTxid: 0,
        errors: [`Test failed: ${error.message}`]
      });
    }
  }
  
  // Summary
  console.log('\n📊 ===== MAIN FLOW TEST SUMMARY =====');
  allResults.forEach(result => {
    console.log(`\n🌐 ${result.network} Results:`);
    console.log(`  Unified Fetcher: ${result.unifiedFetcherSuccess ? '✅' : '❌'}`);
    console.log(`  Block Numbers Found: ${result.blockNumbersFound}`);
    console.log(`  Contract Query: ${result.contractQuerySuccess ? '✅' : '❌'}`);
    console.log(`  Events Found: ${result.eventsFound}`);
    console.log(`  Events with txid: ${result.eventsWithTxid}`);
    console.log(`  Events without txid: ${result.eventsWithoutTxid}`);
    console.log(`  Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log(`  Error Details:`);
      result.errors.forEach(error => console.log(`    - ${error}`));
    }
    
    // Overall success assessment
    const hasBlocks = result.blockNumbersFound > 0;
    const hasEvents = result.eventsFound > 0;
    const hasTxids = result.eventsWithTxid > 0;
    
    if (hasBlocks && hasEvents && hasTxids) {
      console.log(`  🎉 ${result.network}: COMPLETE SUCCESS - txid extraction working!`);
    } else if (hasBlocks && hasEvents) {
      console.log(`  ⚠️ ${result.network}: PARTIAL SUCCESS - events found but no txids`);
    } else if (hasBlocks) {
      console.log(`  ⚠️ ${result.network}: BLOCKS FOUND - but no events in contract query`);
    } else {
      console.log(`  ❌ ${result.network}: NO BLOCKS FOUND - unified fetcher failed`);
    }
  });
  
  // Overall assessment
  const successfulNetworks = allResults.filter(r => 
    r.unifiedFetcherSuccess && r.blockNumbersFound > 0 && r.eventsFound > 0 && r.eventsWithTxid > 0
  );
  
  console.log(`\n🎯 OVERALL ASSESSMENT:`);
  console.log(`  Successful networks: ${successfulNetworks.length}/${allResults.length}`);
  console.log(`  Networks with txid extraction: ${successfulNetworks.map(r => r.network).join(', ')}`);
  
  if (successfulNetworks.length > 0) {
    console.log(`  ✅ MAIN FLOW TEST: SUCCESS - txid extraction is working!`);
  } else {
    console.log(`  ❌ MAIN FLOW TEST: FAILED - no networks with successful txid extraction`);
  }
  
  return allResults;
}

// Run the test
runMainFlowTest();
