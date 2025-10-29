/**
 * Unified block number fetcher that works across all networks
 * Uses eth_getLogs as the only source for all networks
 * Tests RPC connectivity and event fetching capabilities
 * Handles both NewClaim events and transfer events (NewExpatriation, NewRepatriation)
 */

import { NETWORKS } from '../config/networks.js';
import { estimateBlocksFromHours, getBlockTime } from './block-estimator.js';

// Event topic signatures
const NEW_CLAIM_TOPIC = '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736';
const NEW_EXPATRIATION_TOPIC = '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d';
const NEW_REPATRIATION_TOPIC = '0x4769528a977394d0b1b9c3ad55e7701566261bb71bb5d57c1af58bcb84db30cc';

// Network-specific RPC limits (in blocks)
const RPC_LIMITS = {
  ETHEREUM: null, // No limit
  BSC: 100000, // 100k blocks (~83 hours)
  THREEDPASS: 10000 // 10k blocks (~167 hours due to 60s block time)
};

/**
 * Calculate optimal block range for a network based on RPC limits and block time
 * @param {string} networkKey - Network key
 * @param {number} latestBlock - Latest block number
 * @param {number} targetHours - Target hours of history (default: 72 hours)
 * @returns {Object} Block range configuration
 */
function calculateOptimalBlockRange(networkKey, latestBlock, targetHours = 72) {
  const blockTime = getBlockTime(networkKey);
  const rpcLimit = RPC_LIMITS[networkKey];
  
  // Calculate desired blocks for target hours
  const desiredBlocks = estimateBlocksFromHours(targetHours, networkKey);
  
  let startBlock;
  let actualHours;
  
  if (rpcLimit && desiredBlocks > rpcLimit) {
    // Use RPC limit if desired blocks exceed it
    startBlock = Math.max(0, latestBlock - rpcLimit);
    actualHours = (rpcLimit * blockTime) / 3600; // Convert to hours
    console.log(`   📊 ${networkKey}: Using RPC limit of ${rpcLimit} blocks (${actualHours.toFixed(1)} hours)`);
    } else {
    // Use desired blocks
    startBlock = Math.max(0, latestBlock - desiredBlocks);
    actualHours = targetHours;
    console.log(`   📊 ${networkKey}: Using ${desiredBlocks} blocks (${actualHours} hours)`);
  }
    
    return {
    fromBlock: `0x${startBlock.toString(16)}`,
    toBlock: 'latest',
    blockCount: latestBlock - startBlock,
    actualHours: actualHours,
    blockTime: blockTime
  };
}

/**
 * Calculate chunked block ranges for ranges wider than 48 hours
 * @param {string} networkKey - Network key
 * @param {number} latestBlock - Latest block number
 * @param {number} targetHours - Target hours of history
 * @returns {Array} Array of block range configurations
 */
function calculateChunkedBlockRanges(networkKey, latestBlock, targetHours) {
  const blockTime = getBlockTime(networkKey);
  const maxChunkHours = 48; // Maximum hours per chunk
  
  const ranges = [];
  let currentToBlock = latestBlock;
  let remainingHours = targetHours;
  
  console.log(`   📊 ${networkKey}: Splitting ${targetHours}h range into ${maxChunkHours}h chunks`);
  
  while (remainingHours > 0) {
    const chunkHours = Math.min(remainingHours, maxChunkHours);
    const chunkBlocks = estimateBlocksFromHours(chunkHours, networkKey);
    
    const fromBlock = Math.max(0, currentToBlock - chunkBlocks);
    const toBlock = currentToBlock;
    
    // Safety check to prevent invalid ranges
    if (fromBlock >= toBlock || fromBlock < 0) {
      console.log(`   ⚠️ ${networkKey}: Invalid chunk range (${fromBlock} to ${toBlock}), stopping chunking`);
      break;
    }
    
    ranges.push({
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      blockCount: toBlock - fromBlock,
      actualHours: chunkHours,
      blockTime: blockTime
    });
    
    console.log(`   📊 ${networkKey}: Chunk ${ranges.length} - ${chunkHours}h (${chunkBlocks} blocks) from ${fromBlock} to ${toBlock}`);
    
    // Move to next chunk (with 1 block overlap to avoid gaps)
    currentToBlock = fromBlock - 1;
    remainingHours -= chunkHours;
    
    // Safety check to prevent infinite loops
    if (fromBlock <= 0 || remainingHours <= 0) {
      break;
    }
  }
  
  return ranges.reverse(); // Return in chronological order (oldest first)
}

/**
 * Get event logs using eth_getLogs RPC method
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type ('NewClaim', 'NewExpatriation', 'NewRepatriation', 'AllEvents')
 * @param {Object} options - Additional options
 * @param {number} options.rangeHours - Hours of history to scan (default: 48)
 * @returns {Promise<Object>} Object with block numbers and event data
 */
async function getEventLogsViaRPC(networkKey, bridgeAddress, eventType, options = {}) {
  console.log(`🔍 Getting ${eventType} events via eth_getLogs for ${networkKey} bridge ${bridgeAddress}`);
  
  try {
    // Get network configuration
    const networkConfig = NETWORKS[networkKey];
    if (!networkConfig) {
      throw new Error(`Network configuration not found for ${networkKey}`);
    }

    // Determine topic filter based on event type
    let topics = [];
    if (eventType !== 'AllEvents') {
    let topic0;
    switch (eventType) {
      case 'NewClaim':
        topic0 = NEW_CLAIM_TOPIC;
        break;
      case 'NewExpatriation':
        topic0 = NEW_EXPATRIATION_TOPIC;
        break;
      case 'NewRepatriation':
        topic0 = NEW_REPATRIATION_TOPIC;
        break;
      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }
      topics = [topic0];
    }

    // Calculate optimal block range using block estimator
    let fromBlock = options.fromBlock || '0x0';
    let toBlock = options.toBlock || 'latest';
    let useChunking = false;
    let chunkRanges = [];
    
    if (fromBlock === '0x0') {
      // Get latest block number first
      const latestBlockResponse = await fetch(networkConfig.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1
        })
      });
      
      const latestBlockResult = await latestBlockResponse.json();
      const latestBlock = parseInt(latestBlockResult.result, 16);
      
      // Use rangeHours parameter (default: 24 hours)
      const rangeHours = options.rangeHours || 24;
      
      // Check if we need to use chunking for ranges wider than 48 hours
      if (rangeHours > 48) {
        useChunking = true;
        chunkRanges = calculateChunkedBlockRanges(networkKey, latestBlock, rangeHours);
        console.log(`   📊 ${networkKey}: Using chunking for ${rangeHours}h range (${chunkRanges.length} chunks)`);
      } else {
        const rangeConfig = calculateOptimalBlockRange(networkKey, latestBlock, rangeHours);
        fromBlock = rangeConfig.fromBlock;
        toBlock = rangeConfig.toBlock;
      }
    }

    let allLogs = [];
    
    if (useChunking) {
      // Process each chunk sequentially to avoid overwhelming the RPC
      console.log(`   🔄 Processing ${chunkRanges.length} chunks for ${networkKey}...`);
      
      for (let i = 0; i < chunkRanges.length; i++) {
        const chunk = chunkRanges[i];
        console.log(`   📦 Processing chunk ${i + 1}/${chunkRanges.length} (${chunk.actualHours}h, ${chunk.blockCount} blocks)`);
        
        const requestPayload = {
          jsonrpc: "2.0",
          method: "eth_getLogs",
          params: [
            {
              fromBlock: chunk.fromBlock,
              toBlock: chunk.toBlock,
              address: bridgeAddress,
              topics: topics
            }
          ],
          id: 1
        };

        try {
          const response = await fetch(networkConfig.rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestPayload)
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.error) {
            throw new Error(`RPC error: ${result.error.message} (code: ${result.error.code})`);
          }

          const chunkLogs = result.result || [];
          console.log(`   ✅ Chunk ${i + 1}: Found ${chunkLogs.length} events`);
          allLogs.push(...chunkLogs);
          
          // 1 second delay between chunks to avoid rate limiting
          if (i < chunkRanges.length - 1) {
            console.log(`   ⏳ Waiting 1 second before next chunk...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
    
  } catch (error) {
          console.warn(`   ⚠️ Chunk ${i + 1} failed: ${error.message}`);
          // Continue with other chunks even if one fails
        }
      }
      
      console.log(`   ✅ Found ${allLogs.length} total events across ${chunkRanges.length} chunks`);
    } else {
      // Single request for ranges <= 48 hours
      const requestPayload = {
        jsonrpc: "2.0",
        method: "eth_getLogs",
        params: [
          {
            fromBlock: fromBlock,
            toBlock: toBlock,
            address: bridgeAddress,
            topics: topics
          }
        ],
        id: 1
      };

      const response = await fetch(networkConfig.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(`RPC error: ${result.error.message} (code: ${result.error.code})`);
      }

      allLogs = result.result || [];
      console.log(`   ✅ Found ${allLogs.length} events via eth_getLogs`);
    }
    
    // Extract unique block numbers
    const blockNumbers = [...new Set(allLogs.map(log => parseInt(log.blockNumber, 16)))].sort((a, b) => b - a);
    
    // Categorize events by type
    const eventBreakdown = {
      NewClaim: 0,
      NewExpatriation: 0,
      NewRepatriation: 0,
      Other: 0
    };

    const categorizedEvents = allLogs.map(log => {
      const eventType = getEventTypeFromTopic(log.topics?.[0]);
      eventBreakdown[eventType]++;
    
    return {
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16),
        topics: log.topics,
        data: log.data,
        address: log.address,
        blockHash: log.blockHash,
        transactionIndex: log.transactionIndex,
        removed: log.removed,
        eventType: eventType,
        // Include raw log for full ABI decoding
        rawLog: log
      };
    });

    // Filter events if specific event type was requested
    let filteredEvents = categorizedEvents;
    if (eventType !== 'AllEvents') {
      filteredEvents = categorizedEvents.filter(event => event.eventType === eventType);
    }

    console.log(`   📋 Event breakdown:`, eventBreakdown);

    return {
      blockNumbers: blockNumbers,
      eventCount: filteredEvents.length,
      network: networkKey,
      source: 'eth_getLogs',
      eventType: eventType,
      events: filteredEvents,
      eventBreakdown: eventBreakdown
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting events via eth_getLogs:`, error.message);
    throw error;
  }
}

/**
 * Get all event types using eth_getLogs RPC method
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with all event block numbers
 */
async function getAllEventLogsViaRPC(networkKey, bridgeAddress, options = {}) {
  return await getEventLogsViaRPC(networkKey, bridgeAddress, 'AllEvents', options);
}


/**
 * Determine event type from topic signature
 * @param {string} topic - Topic signature
 * @returns {string} Event type
 */
function getEventTypeFromTopic(topic) {
  if (!topic) return 'Unknown';
  if (topic === NEW_CLAIM_TOPIC) return 'NewClaim';
  if (topic === NEW_EXPATRIATION_TOPIC) return 'NewExpatriation';
  if (topic === NEW_REPATRIATION_TOPIC) return 'NewRepatriation';
  return 'Other';
}

/**
 * Unified block number fetcher that works across all networks
 * Uses eth_getLogs as the only source for all networks
 * 
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type ('NewClaim', 'NewExpatriation', 'NewRepatriation')
 * @param {Object} options - Additional options
 * @param {number} options.rangeHours - Hours of history to scan (1-168, default: 24)
 * @returns {Promise<Object>} Object with block numbers and event data
 * 
 * @example
 * // Get events from the last 24 hours
 * const result = await getEventBlockNumbersUnified('ETHEREUM', bridgeAddress, 'NewClaim', { rangeHours: 24 });
 * 
 * @example
 * // Get events from the last 2 hours (default if no options provided)
 * const result = await getEventBlockNumbersUnified('BSC', bridgeAddress, 'AllEvents', { rangeHours: 2 });
 */
export async function getEventBlockNumbersUnified(networkKey, bridgeAddress, eventType, options = {}) {
  const rangeHours = options.rangeHours || 24;
  console.log(`🌐 Getting ${eventType} block numbers for ${networkKey} bridge ${bridgeAddress} via eth_getLogs (${rangeHours}h range)`);
  
  // Use eth_getLogs for all networks
  return await getEventLogsViaRPC(networkKey, bridgeAddress, eventType, options);
}


/**
 * Get ALL event types block numbers for any network in a single call
 * Uses eth_getLogs as the only source for all networks
 * 
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @param {number} options.rangeHours - Hours of history to scan (1-168, default: 24)
 * @returns {Promise<Object>} Object with all event block numbers
 * 
 * @example
 * // Get all events from the last 12 hours
 * const result = await getAllEventBlockNumbersUnified('BSC', bridgeAddress, { rangeHours: 12 });
 * 
 * @example
 * // Get all events from the last week
 * const result = await getAllEventBlockNumbersUnified('ETHEREUM', bridgeAddress, { rangeHours: 168 });
 */
export async function getAllEventBlockNumbersUnified(networkKey, bridgeAddress, options = {}) {
  const rangeHours = options.rangeHours || 24;
  console.log(`🌐 Getting ALL event types block numbers for ${networkKey} bridge ${bridgeAddress} via eth_getLogs (${rangeHours}h range)`);
  
  // Use eth_getLogs for all networks
  return await getAllEventLogsViaRPC(networkKey, bridgeAddress, options);
}

/**
 * Get block numbers where NewClaim events occurred (legacy function for backward compatibility)
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
export async function getNewClaimBlockNumbersUnified(networkKey, bridgeAddress, options = {}) {
  return await getEventBlockNumbersUnified(networkKey, bridgeAddress, 'NewClaim', options);
}

/**
 * Get transfer block numbers for any network
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - 'NewExpatriation' or 'NewRepatriation'
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
export async function getTransferBlockNumbersUnified(networkKey, bridgeAddress, eventType, options = {}) {
  if (eventType !== 'NewExpatriation' && eventType !== 'NewRepatriation') {
    throw new Error(`Invalid transfer event type: ${eventType}. Must be 'NewExpatriation' or 'NewRepatriation'`);
  }
  return await getEventBlockNumbersUnified(networkKey, bridgeAddress, eventType, options);
}

/**
 * Get all transfer block numbers for any network
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with all transfer block numbers
 */
export async function getAllTransferBlockNumbersUnified(networkKey, bridgeAddress, options = {}) {
  console.log(`🌐 Getting all transfer block numbers for ${networkKey} bridge ${bridgeAddress}`);
  
  try {
    // Get both NewExpatriation and NewRepatriation events
    const [expatriationResult, repatriationResult] = await Promise.all([
      getTransferBlockNumbersUnified(networkKey, bridgeAddress, 'NewExpatriation', options),
      getTransferBlockNumbersUnified(networkKey, bridgeAddress, 'NewRepatriation', options)
    ]);
    
    // Combine block numbers from both event types
    const allBlockNumbers = [...expatriationResult.blockNumbers, ...repatriationResult.blockNumbers];
    const uniqueBlockNumbers = [...new Set(allBlockNumbers)].sort((a, b) => b - a);
    
    // Combine events from both types
    const allEvents = [...expatriationResult.events, ...repatriationResult.events];
    
    return {
      blockNumbers: uniqueBlockNumbers,
      eventCount: allEvents.length,
      network: networkKey,
      source: expatriationResult.source,
      eventType: 'AllTransfers',
      events: allEvents
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting all transfer block numbers:`, error.message);
    throw error;
  }
}

/**
 * Test connection for all supported networks using eth_getLogs
 * @param {string} networkKey - Network key to test
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testNetworkConnection(networkKey) {
  console.log(`🧪 Testing ${networkKey} network connection using eth_getLogs`);
  
  // Test addresses for each network
  const testAddresses = {
    'ETHEREUM': '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Import Bridge
    'BSC': '0x078E7A2037b63846836E9d721cf2dabC08b94281', // P3D Import Bridge
    'THREEDPASS': '0x65101a5889F33E303b3753aa7311161F6C708F27' // P3D Export Bridge
  };
  
  const testAddress = testAddresses[networkKey];
  if (!testAddress) {
    throw new Error(`Unsupported network: ${networkKey}`);
  }
  
  try {
    // Test with a small block range to avoid timeouts
    const result = await getEventLogsViaRPC(networkKey, testAddress, 'AllEvents', {
      fromBlock: '0x0',
      toBlock: 'latest'
    });
    
    console.log(`✅ ${networkKey} connection successful via eth_getLogs (found ${result.eventCount} events)`);
    return true;
    
  } catch (rpcError) {
    console.error(`❌ ${networkKey} connection failed via eth_getLogs: ${rpcError.message}`);
    return false;
  }
}

// Export for CommonJS compatibility
const unifiedBlockFetcher = {
  getEventBlockNumbersUnified,
  getAllEventBlockNumbersUnified,
  getNewClaimBlockNumbersUnified,
  getTransferBlockNumbersUnified,
  getAllTransferBlockNumbersUnified,
  testNetworkConnection
};

export default unifiedBlockFetcher;
