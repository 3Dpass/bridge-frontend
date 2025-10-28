/**
 * Parallel Bridge Discovery System
 * 
 * This module implements the improved discovery logic:
 * 1. One call per bridge in parallel to get all event types
 * 2. Immediate event matching by txid for complete transfer pairs
 * 3. Parallel claim data loading with rate limiting
 * 4. Real-time UI updates as data arrives
 */

import { ethers } from 'ethers';
import { getAllEventBlockNumbersUnified } from './unified-block-fetcher.js';
import { getEvmLogs, getEventTypeFromTopic } from './3dpass-polkadot-provider.js';
import { getNetworkWithSettings } from './settings.js';
import { wait } from './utils.js';
import { aggregateClaimsAndTransfers } from './aggregate-claims-transfers.js';

// Rate limiting configuration
const RATE_LIMIT_MS = 300; // 300ms between requests

/**
 * Get all events for a single bridge in parallel
 * @param {Object} bridgeConfig - Bridge configuration
 * @param {Object} options - Discovery options
 * @returns {Promise<Object>} Bridge events with matched transfers
 */
async function discoverBridgeEvents(bridgeConfig, options = {}) {
  const { bridgeAddress, networkKey, bridgeType, homeNetwork, foreignNetwork } = bridgeConfig;
  const { limit = 100 } = options;
  
  console.log(`🔍 Discovering events for ${networkKey} bridge ${bridgeAddress} (${bridgeType})`);
  
  try {
    // Step 1: Get all event types in one call using unified fetcher
    const eventResult = await getAllEventBlockNumbersUnified(networkKey, bridgeAddress, { limit });
    
    console.log(`✅ ${networkKey}: Found ${eventResult.eventCount} events in ${eventResult.blockNumbers.length} blocks`);
    
    if (eventResult.blockNumbers.length === 0) {
      return {
        bridgeAddress,
        networkKey,
        bridgeType,
        homeNetwork,
        foreignNetwork,
        events: [],
        transfers: [],
        claims: [],
        matchedTransfers: [],
        error: null
      };
    }
    
    // Step 2: Fetch actual event details from provider
    // Only fetch from blocks that contain relevant events (already filtered by unified fetcher)
    const events = await fetchEventDetailsFromBlocks(
      networkKey, 
      bridgeAddress, 
      eventResult.blockNumbers.slice(0, 20), // Limit to first 20 blocks for performance
      bridgeType
    );
    
    console.log(`✅ ${networkKey}: Fetched ${events.length} event details`);
    
    // Step 3: Categorize events by type
    const expatriations = events.filter(e => e.eventType === 'NewExpatriation');
    const repatriations = events.filter(e => e.eventType === 'NewRepatriation');
    const claims = events.filter(e => e.eventType === 'NewClaim');
    
    console.log(`📊 ${networkKey}: Event breakdown - Expatriations: ${expatriations.length}, Repatriations: ${repatriations.length}, Claims: ${claims.length}`);
    
    // Step 4: Match transfers with claims by txid
    const matchedTransfers = matchTransfersWithClaims(expatriations, repatriations, claims);
    
    console.log(`🔗 ${networkKey}: Matched ${matchedTransfers.length} complete transfer pairs`);
    
    return {
      bridgeAddress,
      networkKey,
      bridgeType,
      homeNetwork,
      foreignNetwork,
      events,
      transfers: [...expatriations, ...repatriations],
      claims,
      matchedTransfers,
      error: null
    };
    
  } catch (error) {
    console.error(`❌ ${networkKey} bridge discovery failed:`, error);
    return {
      bridgeAddress,
      networkKey,
      bridgeType,
      homeNetwork,
      foreignNetwork,
      events: [],
      transfers: [],
      claims: [],
      matchedTransfers: [],
      error: error.message
    };
  }
}

/**
 * Fetch event details from specific blocks
 * @param {string} networkKey - Network key
 * @param {string} bridgeAddress - Bridge address
 * @param {Array} blockNumbers - Array of block numbers
 * @param {string} bridgeType - Bridge type
 * @returns {Promise<Array>} Array of event details
 */
async function fetchEventDetailsFromBlocks(networkKey, bridgeAddress, blockNumbers, bridgeType) {
  const networkConfig = getNetworkWithSettings(networkKey);
  if (!networkConfig?.rpcUrl) {
    throw new Error(`No RPC URL found for network ${networkKey}`);
  }
  
  const allEvents = [];
  
  if (networkKey === 'THREEDPASS') {
    // Use Polkadot.js provider for 3DPass
    console.log(`🔍 Using Polkadot.js provider for 3DPass bridge ${bridgeAddress}`);
    
    for (const blockNumber of blockNumbers) {
      try {
        console.log(`  Fetching events from block ${blockNumber}...`);
        
        const logs = await getEvmLogs({
          address: bridgeAddress,
          fromBlock: blockNumber,
          toBlock: blockNumber
        });
        
        console.log(`  Found ${logs.length} raw logs in block ${blockNumber}`);
        
        // Filter logs by topic before decoding to avoid unnecessary warnings
        const claimTopic = '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736';
        const expatriationTopic = '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d';
        const repatriationTopic = '0x4769528a977394d0b1b9c3ad55e7701566261bb71bb5d57c1af58bcb84db30cc';
        
        const relevantLogs = logs.filter(log => {
          const topic0 = log.topics[0]?.toString();
          return topic0 === claimTopic || topic0 === expatriationTopic || topic0 === repatriationTopic;
        });
        
        console.log(`  Found ${logs.length} total logs, ${relevantLogs.length} relevant logs for our events`);
        
        if (relevantLogs.length > 0) {
          // Decode only the relevant logs using the 3DPass Polkadot provider
          const events = await decodePolkadotLogs(relevantLogs, bridgeType);
          console.log(`  Decoded ${events.length} events from block ${blockNumber}`);
          allEvents.push(...events);
        } else {
          console.log(`  No relevant events in block ${blockNumber}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error fetching events from block ${blockNumber}:`, error.message);
      }
    }
  } else {
    // Use ethers.js provider for EVM chains
    const provider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl, {
      name: networkKey.toLowerCase(),
      chainId: networkConfig.id
    });
    
    const contract = new ethers.Contract(bridgeAddress, getContractABI(networkKey, bridgeType), provider);
    
    for (const blockNumber of blockNumbers) {
      try {
        // Query all three event types in parallel
        const [claimEvents, expatriationEvents, repatriationEvents] = await Promise.all([
          contract.queryFilter(contract.filters.NewClaim(), blockNumber, blockNumber),
          contract.queryFilter(contract.filters.NewExpatriation(), blockNumber, blockNumber),
          contract.queryFilter(contract.filters.NewRepatriation(), blockNumber, blockNumber)
        ]);
        
        // Convert to standardized format
        const events = [
          ...claimEvents.map(e => ({ ...e, eventType: 'NewClaim' })),
          ...expatriationEvents.map(e => ({ ...e, eventType: 'NewExpatriation' })),
          ...repatriationEvents.map(e => ({ ...e, eventType: 'NewRepatriation' }))
        ];
        
        allEvents.push(...events);
      } catch (error) {
        console.warn(`⚠️ Error fetching events from block ${blockNumber}:`, error.message);
      }
    }
  }
  
  return allEvents;
}

/**
 * Decode Polkadot.js logs to standardized event format
 * @param {Array} logs - Polkadot.js logs
 * @param {string} bridgeType - Bridge type
 * @returns {Promise<Array>} Decoded events
 */
async function decodePolkadotLogs(logs, bridgeType) {
  if (!logs || logs.length === 0) {
    return [];
  }
  
  console.log(`🔍 Decoding ${logs.length} Polkadot.js logs for 3DPass`);
  
  
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
  
  // Create a contract interface for decoding
  const contractInterface = new ethers.utils.Interface(getContractABI('THREEDPASS', bridgeType));
  
  // Decode events using ethers.js
  const decodedEvents = [];
  for (const log of ethersLogs) {
    try {
      const decoded = contractInterface.parseLog(log);
      if (decoded) {
        const eventType = getEventTypeFromTopic(log.topics[0]);
        
        // Create standardized event object
        const event = {
          eventType: eventType,
          event: decoded.name,
          args: decoded.args,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          topics: log.topics,
          data: log.data,
          address: log.address,
          // Extract txid based on event type
          txid: extractTxidFromEvent(decoded, eventType, log.transactionHash)
        };
        
        decodedEvents.push(event);
        
        console.log(`    Decoded ${eventType} event: txid=${event.txid}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not decode log: ${error.message}`);
    }
  }
  
  console.log(`✅ Decoded ${decodedEvents.length} events from ${logs.length} logs`);
  return decodedEvents;
}

/**
 * Extract txid from decoded event based on event type
 * @param {Object} decoded - Decoded event from ethers.js
 * @param {string} eventType - Event type (NewClaim, NewExpatriation, NewRepatriation)
 * @param {string} transactionHash - Transaction hash as fallback
 * @returns {string} Extracted txid
 */
function extractTxidFromEvent(decoded, eventType, transactionHash) {
  if (eventType === 'NewClaim' && decoded.args.txid) {
    return decoded.args.txid;
  } else if (eventType === 'NewExpatriation') {
    // NewExpatriation doesn't have txid field, use transaction hash
    return transactionHash;
  } else if (eventType === 'NewRepatriation') {
    // NewRepatriation doesn't have txid field, use transaction hash
    return transactionHash;
  } else {
    // Fallback to transaction hash
    return transactionHash;
  }
}

/**
 * Match transfers with claims by txid
 * @param {Array} expatriations - NewExpatriation events
 * @param {Array} repatriations - NewRepatriation events
 * @param {Array} claims - NewClaim events
 * @returns {Array} Matched transfer pairs
 */
function matchTransfersWithClaims(expatriations, repatriations, claims) {
  const matchedTransfers = [];
  
  // Match expatriations with claims
  for (const expat of expatriations) {
    const matchingClaim = claims.find(claim => 
      claim.txid === expat.transactionHash || 
      claim.txid === expat.txid
    );
    
    matchedTransfers.push({
      transfer: expat,
      claim: matchingClaim || null,
      isComplete: !!matchingClaim,
      transferType: 'NewExpatriation'
    });
  }
  
  // Match repatriations with claims
  for (const repatriation of repatriations) {
    const matchingClaim = claims.find(claim => 
      claim.txid === repatriation.transactionHash || 
      claim.txid === repatriation.txid
    );
    
    matchedTransfers.push({
      transfer: repatriation,
      claim: matchingClaim || null,
      isComplete: !!matchingClaim,
      transferType: 'NewRepatriation'
    });
  }
  
  return matchedTransfers;
}

/**
 * Load claim data in parallel with rate limiting
 * @param {Array} matchedTransfers - Array of matched transfers
 * @param {Function} onUpdate - Callback for UI updates
 * @returns {Promise<Array>} Updated transfers with claim data
 */
async function loadClaimDataInParallel(matchedTransfers, onUpdate) {
  const updatedTransfers = [...matchedTransfers];
  
  // Filter transfers that need claim data
  const incompleteTransfers = matchedTransfers.filter(t => !t.isComplete);
  
  console.log(`🔄 Loading claim data for ${incompleteTransfers.length} incomplete transfers`);
  
  // Process transfers in parallel with rate limiting
  const promises = incompleteTransfers.map(async (transfer, index) => {
    // Rate limiting
    const delay = index * RATE_LIMIT_MS;
    if (delay > 0) {
      await wait(delay);
    }
    
    try {
      // Load claim data for this transfer
      const claimData = await loadClaimDataForTransfer(transfer);
      
      // Apply aggregation logic immediately after loading claim data
      const validatedTransfer = applyAggregationLogic(transfer, claimData);
      
      // Update the array
      const transferIndex = updatedTransfers.findIndex(t => 
        t.transfer.transactionHash === transfer.transfer.transactionHash
      );
      
      if (transferIndex !== -1) {
        updatedTransfers[transferIndex] = validatedTransfer;
        
        // Notify UI of update
        if (onUpdate) {
          onUpdate(updatedTransfers);
        }
      }
      
      console.log(`✅ Loaded and validated claim data for transfer ${transfer.transfer.transactionHash}`);
      
    } catch (error) {
      console.error(`❌ Failed to load claim data for transfer ${transfer.transfer.transactionHash}:`, error);
    }
  });
  
  await Promise.all(promises);
  
  return updatedTransfers;
}

/**
 * Apply aggregation logic to a single transfer-claim pair
 * @param {Object} transfer - Transfer object
 * @param {Object|null} claimData - Claim data or null
 * @returns {Object} Validated transfer with fraud detection
 */
function applyAggregationLogic(transfer, claimData) {
  if (!claimData) {
    // No claim data - this is a pending transfer
    return {
      ...transfer,
      claim: null,
      isComplete: false,
      status: 'pending',
      isFraudulent: false,
      reason: 'no_matching_claim'
    };
  }

  // Create a single-item array for the aggregation function
  const claims = [claimData];
  const transfers = [transfer.transfer];
  
  // Apply the sophisticated aggregation logic
  const aggregated = aggregateClaimsAndTransfers(claims, transfers);
  
  // Extract the result for this specific transfer
  const completedTransfer = aggregated.completedTransfers.find(ct => 
    ct.transfer?.transactionHash === transfer.transfer.transactionHash
  );
  
  const suspiciousClaim = aggregated.suspiciousClaims.find(sc => 
    sc.txid === claimData.txid
  );
  
  if (completedTransfer) {
    // This is a valid completed transfer
    return {
      ...transfer,
      claim: completedTransfer.claim,
      isComplete: true,
      status: 'completed',
      isFraudulent: false,
      transfer: completedTransfer.transfer
    };
  } else if (suspiciousClaim) {
    // This is a suspicious claim
    return {
      ...transfer,
      claim: claimData,
      isComplete: false,
      status: 'suspicious',
      isFraudulent: true,
      reason: suspiciousClaim.reason,
      parameterMismatches: suspiciousClaim.parameterMismatches
    };
  } else {
    // Fallback - should not happen with proper aggregation
    return {
      ...transfer,
      claim: claimData,
      isComplete: false,
      status: 'unknown',
      isFraudulent: false,
      reason: 'aggregation_error'
    };
  }
}

/**
 * Load claim data for a specific transfer
 * @param {Object} transfer - Transfer object
 * @returns {Promise<Object|null>} Claim data or null
 */
async function loadClaimDataForTransfer(transfer) {
  // This would implement the claim data loading logic
  // For now, return null as placeholder
  return null;
}

/**
 * Get contract ABI for a network and bridge type
 * @param {string} networkKey - Network key
 * @param {string} bridgeType - Bridge type
 * @returns {Array} Contract ABI
 */
function getContractABI(networkKey, bridgeType) {
  // Import the ABI based on network and bridge type
  // For now, return a basic ABI with the required events
  return [
    "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
    "event NewExpatriation(address sender_address, uint amount, int reward, string foreign_address, string data)",
    "event NewRepatriation(address sender_address, uint amount, uint reward, string home_address, string data)",
    "function last_claim_num() view returns (uint64)"
  ];
}

/**
 * Discover all bridge events in parallel
 * @param {Array} bridgeConfigs - Array of bridge configurations
 * @param {Object} options - Discovery options
 * @returns {Promise<Object>} Discovery results
 */
export async function discoverAllBridgeEvents(bridgeConfigs, options = {}) {
  console.log(`🚀 Starting parallel discovery for ${bridgeConfigs.length} bridges`);
  
  // Step 1: Discover all bridge events in parallel
  const bridgeResults = await Promise.all(
    bridgeConfigs.map(bridgeConfig => 
      discoverBridgeEvents(bridgeConfig, options)
    )
  );
  
  // Step 2: Aggregate results
  const allEvents = bridgeResults.flatMap(result => result.events);
  const allTransfers = bridgeResults.flatMap(result => result.transfers);
  const allClaims = bridgeResults.flatMap(result => result.claims);
  const allMatchedTransfers = bridgeResults.flatMap(result => result.matchedTransfers);
  
  console.log(`📊 Discovery complete: ${allEvents.length} events, ${allTransfers.length} transfers, ${allClaims.length} claims, ${allMatchedTransfers.length} matched pairs`);
  
  return {
    bridgeResults,
    allEvents,
    allTransfers,
    allClaims,
    allMatchedTransfers,
    stats: {
      totalBridges: bridgeConfigs.length,
      successfulBridges: bridgeResults.filter(r => !r.error).length,
      totalEvents: allEvents.length,
      totalTransfers: allTransfers.length,
      totalClaims: allClaims.length,
      matchedPairs: allMatchedTransfers.length
    }
  };
}

/**
 * Load claim data for all incomplete transfers with real-time updates
 * @param {Array} matchedTransfers - Array of matched transfers
 * @param {Function} onUpdate - Callback for UI updates
 * @returns {Promise<Array>} Updated transfers with claim data
 */
export async function loadClaimDataWithUpdates(matchedTransfers, onUpdate) {
  return await loadClaimDataInParallel(matchedTransfers, onUpdate);
}
