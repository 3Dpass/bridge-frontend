/**
 * Unified block number fetcher that works across all networks
 * Integrates 3DPass, Ethereum, and BSC network scanners
 */

import { getAddressBlocks } from './3dpscan.js';
import { getTransferBlockNumbers, getAllTransferBlockNumbers } from './unified-transfer-fetcher.js';
import { parseBSCScanBlockNumbers } from './bscscan-simple-parser.js';

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
 * Unified block number fetcher that works across all networks
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object with block numbers and event data
 */
export async function getNewClaimBlockNumbersUnified(networkKey, bridgeAddress, options = {}) {
  console.log(`🌐 Getting NewClaim block numbers for ${networkKey} bridge ${bridgeAddress}`);
  
  if (networkKey === 'THREEDPASS') {
    // Use 3dpscan.xyz for 3DPass network
    return await getNewClaimBlockNumbers3DPassWrapper(bridgeAddress, options);
  } else if (networkKey === 'ETHEREUM') {
    // Use etherscan.js for Ethereum network
    const { getNewClaimBlockNumbers } = await import('./block-number-fetcher.js');
    return await getNewClaimBlockNumbers(networkKey, bridgeAddress, options);
  } else if (networkKey === 'BSC') {
    // Try API first, then fallback to BSCScan parser
    try {
      const { getNewClaimBlockNumbers } = await import('./block-number-fetcher.js');
      return await getNewClaimBlockNumbers(networkKey, bridgeAddress, options);
    } catch (apiError) {
      console.log(`⚠️ BSC API failed, trying BSCScan parser fallback: ${apiError.message}`);
      return await getNewClaimBlockNumbersBSCFallback(bridgeAddress, options);
    }
  } else {
    throw new Error(`Unsupported network: ${networkKey}`);
  }
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
  console.log(`🌐 Getting ${eventType} block numbers for ${networkKey} bridge ${bridgeAddress}`);
  return await getTransferBlockNumbers(networkKey, bridgeAddress, eventType, options);
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
  return await getAllTransferBlockNumbers(networkKey, bridgeAddress, options);
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
    const { testExplorerConnection } = await import('./etherscan.js');
    return await testExplorerConnection(networkKey);
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
  getNewClaimBlockNumbersUnified,
  getTransferBlockNumbersUnified,
  getAllTransferBlockNumbersUnified,
  testNetworkConnection
};

export default unifiedBlockFetcher;
