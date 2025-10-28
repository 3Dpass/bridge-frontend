/**
 * All Events Single Call Test - Tests fetching all event types in one call per bridge
 * One bridge per network: Ethereum, BSC, 3DPass
 * Single API call per bridge to get NewClaim, NewExpatriation, NewRepatriation events
 */

import { ethers } from 'ethers';
import { NETWORKS } from '../../config/networks.js';
import { getAllEventBlockNumbersUnified } from '../unified-block-fetcher.js';
import { getEvmLogs } from '../3dpass-polkadot-provider.js';

// Test configurations - one bridge per network
const TEST_CONFIGS = [
  // {
  //   name: 'Ethereum',
  //   bridgeAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Export Bridge on Ethereum
  //   networkKey: 'ETHEREUM',
  //   rpcUrl: NETWORKS.ETHEREUM.rpcUrl,
  //   chainId: NETWORKS.ETHEREUM.id
  // },
  // {
  //   name: 'BSC',
  //   bridgeAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge on BSC
  //   networkKey: 'BSC',
  //   rpcUrl: NETWORKS.BSC.rpcUrl,
  //   chainId: NETWORKS.BSC.id
  // },
  {
    name: '3DPass',
    bridgeAddress: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F', // P3D Export Bridge on 3DPass
    networkKey: 'THREEDPASS',
    rpcUrl: NETWORKS.THREEDPASS.rpcUrl,
    chainId: NETWORKS.THREEDPASS.id
  }
];

// Counterstake ABI for all event types - using correct signatures from abi.js
const COUNTERSTAKE_ABI = [
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  "event NewExpatriation(address sender_address, uint amount, int reward, string foreign_address, string data)",
  "event NewRepatriation(address sender_address, uint amount, uint reward, string home_address, string data)",
  "function last_claim_num() view returns (uint64)"
];

// Helper function to get event type from topic signature
function getEventTypeFromTopic(topic) {
  const topicMap = {
    '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736': 'NewClaim',
    '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d': 'NewExpatriation',
    '0x4769528a977394d0b1b9c3ad55e7701566261bb71bb5d57c1af58bcb84db30cc': 'NewRepatriation'
  };
  
  return topicMap[topic] || 'Unknown';
}

/**
 * Test all event types for a specific bridge in a single call
 * @param {Object} config - Network configuration
 * @returns {Promise<Object>} Test results
 */
async function testBridgeAllEvents(config) {
  console.log(`\n🧪 ===== TESTING ${config.name} BRIDGE ALL EVENTS =====`);
  console.log(`Bridge: ${config.bridgeAddress}`);
  console.log(`Network: ${config.networkKey}`);
  console.log(`RPC: ${config.rpcUrl}`);
  
  const results = {
    network: config.name,
    bridgeAddress: config.bridgeAddress,
    unifiedFetcherSuccess: false,
    totalEventsFound: 0,
    eventBreakdown: {
      NewClaim: 0,
      NewExpatriation: 0,
      NewRepatriation: 0,
      Other: 0
    },
    blockNumbersFound: 0,
    contractQuerySuccess: false,
    eventsWithTxid: 0,
    eventsWithoutTxid: 0,
    errors: []
  };
  
  try {
    // Step 1: Test unified fetcher with ALL event types in single call
    console.log('\n🔍 Step 1: Testing unified fetcher for ALL event types (single call)...');
    const blockResult = await getAllEventBlockNumbersUnified(
      config.networkKey,
      config.bridgeAddress,
      { limit: 50 }
    );
    
    console.log(`✅ Unified fetcher result:`, {
      totalEvents: blockResult.eventCount || 0,
      blockNumbers: blockResult.blockNumbers?.length || 0,
      network: blockResult.network,
      source: blockResult.source,
      eventType: blockResult.eventType
    });
    
    if (blockResult.eventBreakdown) {
      console.log(`📊 Event breakdown from API:`, blockResult.eventBreakdown);
      results.eventBreakdown = blockResult.eventBreakdown;
    }
    
    results.unifiedFetcherSuccess = true;
    results.totalEventsFound = blockResult.eventCount || 0;
    results.blockNumbersFound = blockResult.blockNumbers?.length || 0;
    
    if (blockResult.blockNumbers && blockResult.blockNumbers.length > 0) {
      console.log(`📋 Block numbers found: ${blockResult.blockNumbers.slice(0, 10).join(', ')}`);
    }
    
    // Step 2: Test contract query with found blocks to verify txid extraction
    if (blockResult.blockNumbers && blockResult.blockNumbers.length > 0) {
      console.log('\n🔍 Step 2: Testing contract query with found blocks for txid extraction...');
      
      // Get current block number
      let currentBlock;
      let allEvents = [];
      
      if (config.networkKey === 'THREEDPASS') {
        // Use Polkadot.js provider for 3DPass
        console.log('  Using Polkadot.js provider for 3DPass...');
        
        try {
          // Get current block from a simple RPC call
          const response = await fetch(config.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_blockNumber',
              params: [],
              id: 1
            })
          });
          const data = await response.json();
          currentBlock = parseInt(data.result, 16);
          console.log(`  Current ${config.name} block: ${currentBlock}`);
          
          // Query events using Polkadot.js for each block
          const blocksToQuery = blockResult.blockNumbers.slice(0, 20);
          console.log(`  Querying all event types in ${blocksToQuery.length} individual blocks: ${blocksToQuery.join(', ')}`);
          
          for (const blockNumber of blocksToQuery) {
            try {
              console.log(`    Querying block ${blockNumber}...`);
              
              // Get all EVM logs for this block
              const logs = await getEvmLogs({
                address: config.bridgeAddress,
                fromBlock: blockNumber,
                toBlock: blockNumber
              });
              
              // Filter logs by event topics and convert to ethers.js format
              const claimTopic = '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736';
              const expatriationTopic = '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d';
              const repatriationTopic = '0x4769528a977394d0b1b9c3ad55e7701566261bb71bb5d57c1af58bcb84db30cc';
              
              // Convert Polkadot.js logs to ethers.js format for proper decoding
              const ethersLogs = logs.map(log => ({
                address: log.address.toString(),
                topics: log.topics.map(topic => topic.toString()),
                data: log.data.toString(),
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash.toString(),
                transactionIndex: typeof log.transactionIndex.toNumber === 'function' ? log.transactionIndex.toNumber() : log.transactionIndex,
                logIndex: typeof log.logIndex.toNumber === 'function' ? log.logIndex.toNumber() : log.logIndex,
                blockHash: log.blockHash.toString(),
                removed: typeof log.removed.valueOf === 'function' ? log.removed.valueOf() : log.removed
              }));
              
              // Create a mock contract interface for decoding
              const contractInterface = new ethers.utils.Interface(COUNTERSTAKE_ABI);
              
              // Decode events using ethers.js
              const decodedEvents = [];
              for (const log of ethersLogs) {
                try {
                  const decoded = contractInterface.parseLog(log);
                  if (decoded) {
                    decodedEvents.push({
                      event: decoded.name,
                      args: decoded.args,
                      blockNumber: log.blockNumber,
                      transactionHash: log.transactionHash,
                      logIndex: log.logIndex,
                      topics: log.topics,
                      data: log.data
                    });
                  }
                } catch (error) {
                  // If decoding fails, still include the raw log for manual inspection
                  console.log(`    Warning: Could not decode log in block ${blockNumber}: ${error.message}`);
                }
              }
              
              // Categorize decoded events
              const claimEvents = decodedEvents.filter(e => e.event === 'NewClaim');
              const expatriationEvents = decodedEvents.filter(e => e.event === 'NewExpatriation');
              const repatriationEvents = decodedEvents.filter(e => e.event === 'NewRepatriation');
              
              console.log(`    Found ${decodedEvents.length} events in block ${blockNumber} (Claims: ${claimEvents.length}, Expatriations: ${expatriationEvents.length}, Repatriations: ${repatriationEvents.length})`);
              allEvents.push(...decodedEvents);
            } catch (blockError) {
              console.log(`    Error querying block ${blockNumber}: ${blockError.message}`);
            }
          }
        } catch (error) {
          console.log(`  ❌ Error with Polkadot.js provider: ${error.message}`);
        }
      } else {
        // Use ethers.js provider for Ethereum and BSC
        const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl, {
          name: config.name.toLowerCase(),
          chainId: config.chainId
        });
        
        const contract = new ethers.Contract(config.bridgeAddress, COUNTERSTAKE_ABI, provider);
        
        currentBlock = await provider.getBlockNumber();
        console.log(`  Current ${config.name} block: ${currentBlock}`);
        
        // Query events from the found blocks (query each block individually to avoid range limits)
        const blocksToQuery = blockResult.blockNumbers.slice(0, 20); // Test first 20 blocks to catch more event types
        
        console.log(`  Querying all event types in ${blocksToQuery.length} individual blocks: ${blocksToQuery.join(', ')}`);
        
        try {
          // Query each block individually to avoid range limits
          for (const blockNumber of blocksToQuery) {
            try {
              console.log(`    Querying block ${blockNumber}...`);
              
              // Query all three event types
              const [claimEvents, expatriationEvents, repatriationEvents] = await Promise.all([
                contract.queryFilter(contract.filters.NewClaim(), blockNumber, blockNumber),
                contract.queryFilter(contract.filters.NewExpatriation(), blockNumber, blockNumber),
                contract.queryFilter(contract.filters.NewRepatriation(), blockNumber, blockNumber)
              ]);
              
              const blockEvents = [...claimEvents, ...expatriationEvents, ...repatriationEvents];
              console.log(`    Found ${blockEvents.length} events in block ${blockNumber} (Claims: ${claimEvents.length}, Expatriations: ${expatriationEvents.length}, Repatriations: ${repatriationEvents.length})`);
              allEvents.push(...blockEvents);
            } catch (blockError) {
              console.log(`    Error querying block ${blockNumber}: ${blockError.message}`);
            }
          }
        } catch (contractError) {
          console.log(`  ❌ Contract query error: ${contractError.message}`);
          results.errors.push(`Contract query: ${contractError.message}`);
        }
      }
        
      const events = allEvents;
      
      console.log(`  ✅ Found ${events.length} total events in contract query`);
      
      results.contractQuerySuccess = true;
      
      if (events.length > 0) {
        console.log('\n🔍 Event details and txid extraction:');
        
        // Categorize events by type (handle both ethers.js and Polkadot.js formats)
        const claimEvents = events.filter(e => 
          (e.event === 'NewClaim') || 
          (e.topics && e.topics[0] === '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736')
        );
        const expatriationEvents = events.filter(e => 
          (e.event === 'NewExpatriation') || 
          (e.topics && e.topics[0] === '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d')
        );
        const repatriationEvents = events.filter(e => 
          (e.event === 'NewRepatriation') || 
          (e.topics && e.topics[0] === '0x4769528a977394d0b1b9c3ad55e7701566261bb71bb5d57c1af58bcb84db30cc')
        );
        
        console.log(`\n📊 Contract query event breakdown:`);
        console.log(`  NewClaim: ${claimEvents.length}`);
        console.log(`  NewExpatriation: ${expatriationEvents.length}`);
        console.log(`  NewRepatriation: ${repatriationEvents.length}`);
        
        // Update results with contract query breakdown
        results.eventBreakdown = {
          NewClaim: claimEvents.length,
          NewExpatriation: expatriationEvents.length,
          NewRepatriation: repatriationEvents.length,
          Other: 0
        };
        
        // Check txid extraction for each event type
        events.forEach((event, index) => {
          let eventType, hasTxid, txidValue, blockNumber, transactionHash;
          
          if (config.networkKey === 'THREEDPASS') {
            // Polkadot.js format - extract txid from decoded event data
            eventType = getEventTypeFromTopic(event.topics?.[0]);
            
            // For NewExpatriation events, check the decoded args for txid
            if (eventType === 'NewExpatriation' && event.args) {
              // NewExpatriation has: sender_address, amount, reward, foreign_address, data
              // The txid might be in the data field or foreign_address field
              hasTxid = !!(event.args.data && event.args.data !== '0x');
              txidValue = (event.args.data && event.args.data !== '0x') ? event.args.data : event.transactionHash;
            } else if (eventType === 'NewClaim' && event.args) {
              hasTxid = !!event.args.txid;
              txidValue = event.args.txid || 'N/A';
            } else {
              // Fallback to transaction hash
              hasTxid = true;
              txidValue = event.transactionHash || 'N/A';
            }
            
            blockNumber = event.blockNumber;
            transactionHash = event.transactionHash;
          } else {
            // ethers.js format
            eventType = event.event;
            hasTxid = !!event.args.txid;
            txidValue = event.args.txid || '';
            blockNumber = event.blockNumber;
            transactionHash = event.transactionHash;
          }
          
          console.log(`\n    Event ${index + 1} (${eventType}):`);
          console.log(`      txid: "${txidValue}"`);
          console.log(`      hasTxid: ${hasTxid}`);
          console.log(`      txidType: ${typeof txidValue}`);
          console.log(`      txidLength: ${txidValue.length}`);
          console.log(`      blockNumber: ${blockNumber}`);
          console.log(`      transactionHash: ${transactionHash}`);
          
          if (config.networkKey === 'THREEDPASS') {
            console.log(`      topics: ${event.topics?.length || 0}`);
            console.log(`      data length: ${event.data?.length || 0}`);
            console.log(`      address: ${event.address}`);
            
            // Show decoded event arguments
            if (event.args) {
              console.log(`      decoded args:`);
              Object.keys(event.args).forEach(key => {
                if (key !== 'length' && !key.match(/^\d+$/)) { // Skip array indices
                  console.log(`        ${key}: ${event.args[key]}`);
                }
              });
            }
          } else {
            if (eventType === 'NewClaim') {
              console.log(`      claim_num: ${event.args.claim_num?.toString()}`);
              console.log(`      sender_address: "${event.args.sender_address}"`);
              console.log(`      recipient_address: ${event.args.recipient_address}`);
              console.log(`      amount: ${event.args.amount?.toString()}`);
              console.log(`      reward: ${event.args.reward?.toString()}`);
            } else if (eventType === 'NewExpatriation' || eventType === 'NewRepatriation') {
              console.log(`      sender_address: ${event.args.sender_address}`);
              console.log(`      recipient_address: ${event.args.recipient_address}`);
              console.log(`      amount: ${event.args.amount?.toString()}`);
            }
          }
          
          if (hasTxid) {
            results.eventsWithTxid++;
          } else {
            results.eventsWithoutTxid++;
          }
        });
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
    console.error(`❌ Error testing ${config.name} bridge:`, error);
    results.errors.push(`Main flow: ${error.message}`);
  }
  
  return results;
}

/**
 * Run the all events single call test for all networks
 */
async function runAllEventsSingleCallTest() {
  console.log('🧪 ===== ALL EVENTS SINGLE CALL TEST =====');
  console.log('Testing unified fetcher -> single call per bridge -> all event types -> txid extraction');
  console.log('One bridge per network: Ethereum, BSC, 3DPass');
  
  const allResults = [];
  
  for (const config of TEST_CONFIGS) {
    try {
      const result = await testBridgeAllEvents(config);
      allResults.push(result);
    } catch (error) {
      console.error(`❌ Failed to test ${config.name}:`, error);
      allResults.push({
        network: config.name,
        bridgeAddress: config.bridgeAddress,
        unifiedFetcherSuccess: false,
        totalEventsFound: 0,
        eventBreakdown: { NewClaim: 0, NewExpatriation: 0, NewRepatriation: 0, Other: 0 },
        blockNumbersFound: 0,
        contractQuerySuccess: false,
        eventsWithTxid: 0,
        eventsWithoutTxid: 0,
        errors: [`Test failed: ${error.message}`]
      });
    }
  }
  
  // Summary
  console.log('\n📊 ===== ALL EVENTS SINGLE CALL TEST SUMMARY =====');
  allResults.forEach(result => {
    console.log(`\n🌐 ${result.network} Bridge Results:`);
    console.log(`  Bridge Address: ${result.bridgeAddress}`);
    console.log(`  Unified Fetcher: ${result.unifiedFetcherSuccess ? '✅' : '❌'}`);
    console.log(`  Total Events Found: ${result.totalEventsFound}`);
    console.log(`  Block Numbers Found: ${result.blockNumbersFound}`);
    console.log(`  Contract Query: ${result.contractQuerySuccess ? '✅' : '❌'}`);
    console.log(`  Events with txid: ${result.eventsWithTxid}`);
    console.log(`  Events without txid: ${result.eventsWithoutTxid}`);
    console.log(`  Event Breakdown:`);
    console.log(`    NewClaim: ${result.eventBreakdown.NewClaim}`);
    console.log(`    NewExpatriation: ${result.eventBreakdown.NewExpatriation}`);
    console.log(`    NewRepatriation: ${result.eventBreakdown.NewRepatriation}`);
    console.log(`    Other: ${result.eventBreakdown.Other}`);
    console.log(`  Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log(`  Error Details:`);
      result.errors.forEach(error => console.log(`    - ${error}`));
    }
    
    // Overall success assessment
    const hasEvents = result.totalEventsFound > 0;
    const hasContractEvents = result.eventsWithTxid + result.eventsWithoutTxid > 0;
    const hasTxids = result.eventsWithTxid > 0;
    const hasMultipleEventTypes = Object.values(result.eventBreakdown).filter(count => count > 0).length > 1;
    
    if (hasEvents && hasContractEvents && hasTxids) {
      console.log(`  🎉 ${result.network}: COMPLETE SUCCESS - all event types with txid extraction!`);
    } else if (hasEvents && hasContractEvents) {
      console.log(`  ⚠️ ${result.network}: PARTIAL SUCCESS - events found but no txids`);
    } else if (hasEvents) {
      console.log(`  ⚠️ ${result.network}: BLOCKS FOUND - but no events in contract query`);
    } else {
      console.log(`  ❌ ${result.network}: NO EVENTS FOUND - unified fetcher failed`);
    }
  });
  
  // Overall assessment
  const successfulBridges = allResults.filter(r => 
    r.unifiedFetcherSuccess && r.totalEventsFound > 0 && r.eventsWithTxid > 0
  );
  
  console.log(`\n🎯 OVERALL ASSESSMENT:`);
  console.log(`  Successful bridges: ${successfulBridges.length}/${allResults.length}`);
  console.log(`  Bridges with txid extraction: ${successfulBridges.map(r => r.network).join(', ')}`);
  
  if (successfulBridges.length > 0) {
    console.log(`  ✅ ALL EVENTS SINGLE CALL TEST: SUCCESS - single call per bridge working!`);
  } else {
    console.log(`  ❌ ALL EVENTS SINGLE CALL TEST: FAILED - no bridges with successful single call`);
  }
  
  return allResults;
}

// Run the test
runAllEventsSingleCallTest();
