/**
 * Unified transfer block fetcher for NewExpatriation and NewRepatriation events
 * Replaces block scanning logic with single explorer API call
 */

import { getEventLogs } from './etherscan.js';
import { getAddressBlocks } from './3dpscan.js';

// Event signatures
const NEW_EXPATRIATION_TOPIC = '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d';
const NEW_REPATRIATION_TOPIC = '0xb29fe5d66641f291db1657da090dd1ebad21e549868d3514b7a7c57c99a68671';

/**
 * Get block numbers where transfer events occurred for a bridge
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - 'NewExpatriation' or 'NewRepatriation'
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
export async function getTransferBlockNumbers(networkKey, bridgeAddress, eventType, options = {}) {
  console.log(`🔍 Getting ${eventType} block numbers for ${bridgeAddress} on ${networkKey}`);
  
  if (networkKey === 'THREEDPASS') {
    // Use 3dpscan.js for 3DPass network
    return await getTransferBlockNumbers3DPass(bridgeAddress, eventType, options);
  } else if (networkKey === 'ETHEREUM' || networkKey === 'BSC') {
    // Use etherscan.js for Ethereum/BSC networks
    return await getTransferBlockNumbersEVM(networkKey, bridgeAddress, eventType, options);
  } else {
    throw new Error(`Unsupported network: ${networkKey}`);
  }
}

/**
 * Get transfer block numbers for 3DPass network
 * @param {string} bridgeAddress - Bridge contract address on 3DPass
 * @param {string} eventType - 'NewExpatriation' or 'NewRepatriation'
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
async function getTransferBlockNumbers3DPass(bridgeAddress, eventType, options = {}) {
  try {
    // Use 3dpscan.js to get blocks with EVM events
    const blockNumbers = await getAddressBlocks({
      address: bridgeAddress,
      startblock: options.startblock || 0,
      endblock: options.endblock,
      count: options.count || 0
    });
    
    console.log(`   ✅ Found ${blockNumbers.length} blocks with EVM events for ${eventType} on 3DPass`);
    
    return {
      blockNumbers,
      eventCount: blockNumbers.length,
      network: 'THREEDPASS',
      source: '3dpscan.xyz',
      eventType,
      events: blockNumbers.map(blockNum => ({
        blockNumber: blockNum,
        transactionHash: null, // Not available from 3dpscan
        logIndex: null,
        topics: null
      }))
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting 3DPass ${eventType} block numbers:`, error.message);
    throw error;
  }
}

/**
 * Get transfer block numbers for Ethereum/BSC networks
 * @param {string} networkKey - Network key (ETHEREUM, BSC)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - 'NewExpatriation' or 'NewRepatriation'
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
async function getTransferBlockNumbersEVM(networkKey, bridgeAddress, eventType, options = {}) {
  try {
    // Select the correct topic based on event type
    const topic0 = eventType === 'NewExpatriation' ? NEW_EXPATRIATION_TOPIC : NEW_REPATRIATION_TOPIC;
    
    // Get events from explorer API
    const events = await getEventLogs(networkKey, bridgeAddress, {
      topic0: topic0,
      ...options
    });

    // Extract unique block numbers
    const blockNumbers = [...new Set(events.map(event => parseInt(event.blockNumber, 16)))].sort((a, b) => a - b);
    
    console.log(`   ✅ Found ${events.length} ${eventType} events in ${blockNumbers.length} unique blocks`);
    
    return {
      blockNumbers,
      eventCount: events.length,
      network: networkKey,
      source: 'etherscan',
      eventType,
      events: events.map(event => ({
        blockNumber: parseInt(event.blockNumber, 16),
        transactionHash: event.transactionHash,
        logIndex: parseInt(event.logIndex, 16),
        topics: event.topics
      }))
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting ${eventType} block numbers:`, error.message);
    throw error;
  }
}

/**
 * Get both NewExpatriation and NewRepatriation block numbers for a bridge
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with both event types
 */
export async function getAllTransferBlockNumbers(networkKey, bridgeAddress, options = {}) {
  console.log(`🔍 Getting all transfer block numbers for ${bridgeAddress} on ${networkKey}`);
  
  try {
    const [expatriationResult, repatriationResult] = await Promise.all([
      getTransferBlockNumbers(networkKey, bridgeAddress, 'NewExpatriation', options),
      getTransferBlockNumbers(networkKey, bridgeAddress, 'NewRepatriation', options)
    ]);
    
    // Combine block numbers from both event types
    const allBlockNumbers = [...new Set([
      ...expatriationResult.blockNumbers,
      ...repatriationResult.blockNumbers
    ])].sort((a, b) => a - b);
    
    console.log(`   ✅ Found ${allBlockNumbers.length} total blocks with transfer events`);
    
    return {
      blockNumbers: allBlockNumbers,
      expatriationEvents: expatriationResult,
      repatriationEvents: repatriationResult,
      totalEventCount: expatriationResult.eventCount + repatriationResult.eventCount,
      network: networkKey,
      source: networkKey === 'THREEDPASS' ? '3dpscan.xyz' : 'etherscan'
    };
    
  } catch (error) {
    console.error(`   ❌ Error getting all transfer block numbers:`, error.message);
    throw error;
  }
}

const unifiedTransferFetcher = {
  getTransferBlockNumbers,
  getAllTransferBlockNumbers
};

export default unifiedTransferFetcher;
