/**
 * Block number fetcher for NewClaim events
 * Replaces block scanning logic with single explorer API call
 */

import { getEventLogs } from './etherscan.js';

/**
 * Get block numbers where NewClaim events occurred for a bridge
 * This replaces the block scanning logic with a single explorer API call
 * @param {string} networkKey - Network key (ETHEREUM, BSC)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of block numbers where NewClaim events occurred
 */
export async function getNewClaimBlockNumbers(networkKey, bridgeAddress, options = {}) {
  // NewClaim event signature
  const NEW_CLAIM_TOPIC = '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736';
  
  try {
    // Get all NewClaim events from explorer API
    const events = await getEventLogs(networkKey, bridgeAddress, {
      topic0: NEW_CLAIM_TOPIC,
      ...options
    });

    // Extract unique block numbers
    const blockNumbers = [...new Set(events.map(event => parseInt(event.blockNumber, 16)))].sort((a, b) => a - b);
    
    return {
      blockNumbers,
      eventCount: events.length,
      events: events.map(event => ({
        blockNumber: parseInt(event.blockNumber, 16),
        transactionHash: event.transactionHash,
        logIndex: parseInt(event.logIndex, 16),
        topics: event.topics
      }))
    };

  } catch (error) {
    console.error(`Error getting NewClaim block numbers for ${bridgeAddress}:`, error.message);
    throw error;
  }
}

/**
 * Get block numbers for multiple bridges
 * @param {Array} bridges - Array of bridge objects with networkKey and address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with bridge addresses as keys and block numbers as values
 */
export async function getNewClaimBlockNumbersForBridges(bridges, options = {}) {
  const results = {};
  
  for (const bridge of bridges) {
    try {
      const result = await getNewClaimBlockNumbers(bridge.networkKey, bridge.address, options);
      results[bridge.address] = result.blockNumbers;
    } catch (error) {
      console.error(`Failed to get block numbers for bridge ${bridge.address}:`, error.message);
      results[bridge.address] = [];
    }
  }
  
  return results;
}

/**
 * Integration helper: Get block numbers for all configured bridges
 * @param {string} networkKey - Network key (ETHEREUM, BSC)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with bridge addresses as keys and block numbers as values
 */
export async function getNewClaimBlockNumbersForNetwork(networkKey, options = {}) {
  // This would integrate with the existing network configuration
  // For now, return the known bridge addresses
  const bridges = [];
  
  if (networkKey === 'BSC') {
    bridges.push({
      networkKey: 'BSC',
      address: '0x078E7A2037b63846836E9d721cf2dabC08b94281' // P3D_IMPORT_2
    });
  } else if (networkKey === 'ETHEREUM') {
    bridges.push({
      networkKey: 'ETHEREUM',
      address: '0x4f3a4e37701402C61146071309e45A15843025E1' // P3D_IMPORT
    });
  }
  
  return await getNewClaimBlockNumbersForBridges(bridges, options);
}

// Export for CommonJS compatibility
const blockNumberFetcher = {
  getNewClaimBlockNumbers,
  getNewClaimBlockNumbersForBridges,
  getNewClaimBlockNumbersForNetwork
};

export default blockNumberFetcher;
