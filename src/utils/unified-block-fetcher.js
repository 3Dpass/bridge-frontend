/**
 * Unified block number fetcher that works across all networks
 * Integrates 3DPass, Ethereum, and BSC network scanners
 * Handles both NewClaim events and transfer events (NewExpatriation, NewRepatriation)
 */

import { getAddressBlocks } from './3dpscan.js';
import { parseBSCScanBlockNumbers } from './bscscan-simple-parser.js';
import { parseEtherscanBlockNumbers } from './etherscan-simple-parser.js';

// Event topic signatures
const NEW_CLAIM_TOPIC = '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736';
const NEW_EXPATRIATION_TOPIC = '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d';
const NEW_REPATRIATION_TOPIC = '0x4769528a977394d0b1b9c3ad55e7701566261bb71bb5d57c1af58bcb84db30cc';

/**
 * Get block numbers using BSCScan simple parser as fallback
 * @param {string} bridgeAddress - Bridge contract address on BSC
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
async function getNewClaimBlockNumbersBSCFallback(bridgeAddress, options = {}) {
  console.log(`🔍 Getting block numbers using BSCScan parser fallback for BSC bridge ${bridgeAddress}`);
  
  try {
    // Use the simple BSCScan parser to get block numbers
    const result = await parseBSCScanBlockNumbers(bridgeAddress, {
      delay: 2000,
      retries: 2
    });
    
    if (result.success && result.blockNumbers.length > 0) {
      console.log(`   ✅ BSCScan parser found ${result.blockNumbers.length} block numbers`);
      
      return {
        blockNumbers: result.blockNumbers,
        eventCount: result.blockNumbers.length,
        network: 'BSC',
        source: 'bscscan.com',
        events: result.blockNumbers.map(blockNum => ({
          blockNumber: blockNum,
          transactionHash: null, // Not available from simple parser
          logIndex: null,
          topics: null
        }))
      };
    } else {
      throw new Error(`BSCScan parser failed: ${result.error || 'No block numbers found'}`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error with BSCScan parser fallback:`, error.message);
    throw error;
  }
}

/**
 * Get block numbers using Etherscan simple parser as fallback
 * @param {string} bridgeAddress - Bridge contract address on Ethereum
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
async function getNewClaimBlockNumbersEthereumFallback(bridgeAddress, options = {}) {
  console.log(`🔍 Getting block numbers using Etherscan parser fallback for Ethereum bridge ${bridgeAddress}`);
  
  try {
    // Use the simple Etherscan parser to get block numbers
    const result = await parseEtherscanBlockNumbers(bridgeAddress, {
      delay: 2000,
      retries: 2
    });
    
    if (result.success && result.blockNumbers.length > 0) {
      console.log(`   ✅ Etherscan parser found ${result.blockNumbers.length} block numbers`);
      
      return {
        blockNumbers: result.blockNumbers,
        eventCount: result.blockNumbers.length,
        network: 'ETHEREUM',
        source: 'etherscan.io',
        events: result.blockNumbers.map(blockNum => ({
          blockNumber: blockNum,
          transactionHash: null, // Not available from simple parser
          logIndex: null,
          topics: null
        }))
      };
    } else {
      throw new Error(`Etherscan parser failed: ${result.error || 'No block numbers found'}`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error with Etherscan parser fallback:`, error.message);
    throw error;
  }
}

/**
 * Get block numbers where NewClaim events occurred on 3DPass network
 * @param {string} bridgeAddress - Bridge contract address on 3DPass
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
async function getNewClaimBlockNumbers3DPassWrapper(bridgeAddress, options = {}) {
  console.log(`🔍 Getting NewClaim block numbers for 3DPass bridge ${bridgeAddress}`);
  
  try {
    // Use the fixed 3dpscan.js to get blocks with EVM events
    const blockNumbers = await getAddressBlocks({
      address: bridgeAddress,
      startblock: options.startblock || 0,
      endblock: options.endblock,
      count: options.count || 0
    });
    
    console.log(`   ✅ Found ${blockNumbers.length} blocks with EVM events for address ${bridgeAddress}`);
    
    return {
      blockNumbers,
      eventCount: blockNumbers.length,
      network: 'THREEDPASS',
      source: '3dpscan.xyz',
      events: blockNumbers.map(blockNum => ({
        blockNumber: blockNum,
        transactionHash: null, // Not available from 3dpscan
        logIndex: null,
        topics: null
      }))
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting 3DPass block numbers:`, error.message);
    throw error;
  }
}

/**
 * Get block numbers for specific event types using Etherscan-like APIs
 * @param {string} networkKey - Network key (ETHEREUM, BSC)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type ('NewClaim', 'NewExpatriation', 'NewRepatriation')
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
async function getEventBlockNumbersFromAPI(networkKey, bridgeAddress, eventType, options = {}) {
  console.log(`🔍 Getting ${eventType} block numbers from API for ${networkKey} bridge ${bridgeAddress}`);
  
  try {
    const { getEventLogs } = await import('./etherscan.js');
    
    // Determine the topic based on event type
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
    
    // Get event logs from the explorer API
    const logs = await getEventLogs(networkKey, bridgeAddress, {
      topic0,
      fromBlock: options.fromBlock || 0,
      toBlock: options.toBlock || 'latest',
      page: options.page || 1,
      offset: options.offset || 10000
    });
    
    // Extract unique block numbers
    const blockNumbers = [...new Set(logs.map(log => parseInt(log.blockNumber, 16)))].sort((a, b) => b - a);
    
    console.log(`   ✅ Found ${blockNumbers.length} blocks with ${eventType} events`);
    
    return {
      blockNumbers,
      eventCount: logs.length,
      network: networkKey,
      source: 'etherscan',
      eventType,
      events: logs.map(log => ({
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16),
        topics: log.topics
      }))
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting ${eventType} block numbers from API:`, error.message);
    throw error;
  }
}

/**
 * Get block numbers for ALL event types using Etherscan-like APIs in a single call
 * @param {string} networkKey - Network key (ETHEREUM, BSC)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data for all event types
 */
async function getAllEventBlockNumbersFromAPI(networkKey, bridgeAddress, options = {}) {
  console.log(`🔍 Getting ALL event types block numbers from API for ${networkKey} bridge ${bridgeAddress}`);
  
  try {
    const { getEventLogs } = await import('./etherscan.js');
    
    // Get event logs from the explorer API without topic0 filter to get ALL events
    const logs = await getEventLogs(networkKey, bridgeAddress, {
      fromBlock: options.fromBlock || 0,
      toBlock: options.toBlock || 'latest',
      page: options.page || 1,
      offset: options.offset || 10000
    });
    
    console.log(`   📊 Found ${logs.length} total events from API`);
    
    // Filter events by topic to categorize them
    const claimEvents = logs.filter(log => log.topics && log.topics[0] === NEW_CLAIM_TOPIC);
    const expatriationEvents = logs.filter(log => log.topics && log.topics[0] === NEW_EXPATRIATION_TOPIC);
    const repatriationEvents = logs.filter(log => log.topics && log.topics[0] === NEW_REPATRIATION_TOPIC);
    
    console.log(`   📋 Event breakdown:`);
    console.log(`     NewClaim: ${claimEvents.length}`);
    console.log(`     NewExpatriation: ${expatriationEvents.length}`);
    console.log(`     NewRepatriation: ${repatriationEvents.length}`);
    
    // Filter to only include events we care about (NewClaim, NewExpatriation, NewRepatriation)
    const relevantEvents = [...claimEvents, ...expatriationEvents, ...repatriationEvents];
    console.log(`   🎯 Relevant events (filtered): ${relevantEvents.length} out of ${logs.length} total`);
    
    // Extract unique block numbers only from relevant events
    const allBlockNumbers = [...new Set(relevantEvents.map(log => parseInt(log.blockNumber, 16)))].sort((a, b) => b - a);
    
    console.log(`   ✅ Found ${allBlockNumbers.length} unique blocks with events`);
    
    return {
      blockNumbers: allBlockNumbers,
      eventCount: relevantEvents.length, // Use filtered count instead of total
      network: networkKey,
      source: 'etherscan',
      eventType: 'AllEvents',
      events: relevantEvents.map(log => ({
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16),
        topics: log.topics,
        eventType: getEventTypeFromTopic(log.topics?.[0])
      })),
      eventBreakdown: {
        NewClaim: claimEvents.length,
        NewExpatriation: expatriationEvents.length,
        NewRepatriation: repatriationEvents.length
      }
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting all event block numbers from API:`, error.message);
    throw error;
  }
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
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type ('NewClaim', 'NewExpatriation', 'NewRepatriation')
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
export async function getEventBlockNumbersUnified(networkKey, bridgeAddress, eventType, options = {}) {
  console.log(`🌐 Getting ${eventType} block numbers for ${networkKey} bridge ${bridgeAddress}`);
  
  if (networkKey === 'THREEDPASS') {
    // Use 3dpscan.xyz for 3DPass network
    return await getNewClaimBlockNumbers3DPassWrapper(bridgeAddress, options);
  } else if (networkKey === 'ETHEREUM') {
    // Try API first, then fallback to Etherscan parser
    try {
      return await getEventBlockNumbersFromAPI(networkKey, bridgeAddress, eventType, options);
    } catch (apiError) {
      console.log(`⚠️ Ethereum API failed, trying Etherscan parser fallback: ${apiError.message}`);
      return await getNewClaimBlockNumbersEthereumFallback(bridgeAddress, options);
    }
  } else if (networkKey === 'BSC') {
    // Try API first, then fallback to BSCScan parser
    try {
      return await getEventBlockNumbersFromAPI(networkKey, bridgeAddress, eventType, options);
    } catch (apiError) {
      console.log(`⚠️ BSC API failed, trying BSCScan parser fallback: ${apiError.message}`);
      return await getNewClaimBlockNumbersBSCFallback(bridgeAddress, options);
    }
  } else {
    throw new Error(`Unsupported network: ${networkKey}`);
  }
}

/**
 * Get all event block numbers for 3DPass network
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Options object
 * @returns {Promise<Object>} Object with all event block numbers
 */
async function getAllEventBlockNumbers3DPass(bridgeAddress, options = {}) {
  console.log(`🔍 Getting ALL event types block numbers for 3DPass bridge ${bridgeAddress}`);
  
  try {
    const { getAddressBlocks } = await import('./3dpscan.js');
    
    // Get all EVM events for this bridge
    const blockNumbers = await getAddressBlocks({
      address: bridgeAddress,
      startblock: options.fromBlock || 0,
      endblock: options.toBlock
    });
    
    console.log(`   ✅ Found ${blockNumbers.length} blocks with EVM events`);
    
    return {
      blockNumbers: blockNumbers.sort((a, b) => b - a), // Sort descending
      eventCount: blockNumbers.length,
      network: 'THREEDPASS',
      source: '3dpscan.xyz',
      eventType: 'AllEvents',
      events: [], // 3DPass doesn't provide detailed event info in the block fetcher
      eventBreakdown: {
        NewClaim: 'unknown', // Would need to query individual blocks to determine
        NewExpatriation: 'unknown',
        NewRepatriation: 'unknown'
      }
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting all event block numbers for 3DPass:`, error.message);
    throw error;
  }
}

/**
 * Get ALL event types block numbers for any network in a single call
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with all event block numbers
 */
export async function getAllEventBlockNumbersUnified(networkKey, bridgeAddress, options = {}) {
  console.log(`🌐 Getting ALL event types block numbers for ${networkKey} bridge ${bridgeAddress}`);
  
  if (networkKey === 'THREEDPASS') {
    // Use 3dpscan.xyz for 3DPass network - get all EVM events and filter by topic
    return await getAllEventBlockNumbers3DPass(bridgeAddress, options);
  } else if (networkKey === 'ETHEREUM') {
    // Try API first, then fallback to Etherscan parser
    try {
      return await getAllEventBlockNumbersFromAPI(networkKey, bridgeAddress, options);
    } catch (apiError) {
      console.log(`⚠️ Ethereum API failed, trying Etherscan parser fallback: ${apiError.message}`);
      return await getNewClaimBlockNumbersEthereumFallback(bridgeAddress, options);
    }
  } else if (networkKey === 'BSC') {
    // Try API first, then fallback to BSCScan parser
    try {
      return await getAllEventBlockNumbersFromAPI(networkKey, bridgeAddress, options);
    } catch (apiError) {
      console.log(`⚠️ BSC API failed, trying BSCScan parser fallback: ${apiError.message}`);
      return await getNewClaimBlockNumbersBSCFallback(bridgeAddress, options);
    }
  } else {
    throw new Error(`Unsupported network: ${networkKey}`);
  }
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
 * Test connection for all supported networks
 * @param {string} networkKey - Network key to test
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testNetworkConnection(networkKey) {
  if (networkKey === 'THREEDPASS') {
    // Test 3DPass connection by trying to get blocks for a known address
    try {
      const testBlocks = await getAddressBlocks({
        address: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F', // P3D Export Bridge
        startblock: 0,
        endblock: 1000000
      });
      console.log(`✅ 3DPass connection successful (found ${testBlocks.length} test blocks)`);
      return true;
    } catch (error) {
      console.error(`❌ 3DPass connection failed:`, error.message);
      return false;
    }
  } else if (networkKey === 'ETHEREUM') {
    // Test Ethereum with API first, then fallback to parser
    try {
      const { testExplorerConnection } = await import('./etherscan.js');
      return await testExplorerConnection(networkKey);
    } catch (apiError) {
      console.log(`⚠️ Ethereum API test failed, trying Etherscan parser: ${apiError.message}`);
      try {
        const testAddress = '0x3a96AC42A28D5610Aca2A79AE782988110108eDe'; // Default test address
        const result = await parseEtherscanBlockNumbers(testAddress, { delay: 1000, retries: 1 });
        console.log(`✅ Etherscan parser connection successful (found ${result.blockNumbers.length} test blocks)`);
        return result.success;
      } catch (parserError) {
        console.error(`❌ Etherscan parser connection failed:`, parserError.message);
        return false;
      }
    }
  } else if (networkKey === 'BSC') {
    // Test BSC with API first, then fallback to parser
    try {
      const { testExplorerConnection } = await import('./etherscan.js');
      return await testExplorerConnection(networkKey);
    } catch (apiError) {
      console.log(`⚠️ BSC API test failed, trying BSCScan parser: ${apiError.message}`);
      try {
        const testAddress = '0x078E7A2037b63846836E9d721cf2dabC08b94281'; // Default test address
        const result = await parseBSCScanBlockNumbers(testAddress, { delay: 1000, retries: 1 });
        console.log(`✅ BSCScan parser connection successful (found ${result.blockNumbers.length} test blocks)`);
        return result.success;
      } catch (parserError) {
        console.error(`❌ BSCScan parser connection failed:`, parserError.message);
        return false;
      }
    }
  } else {
    throw new Error(`Unsupported network: ${networkKey}`);
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
