/**
 * Etherscan API utility for fetching event logs from multiple networks
 * Uses unified Etherscan API with chainid parameter for Ethereum, BSC, Polygon, etc.
 */

import { NETWORKS } from '../config/networks.js';

// Unified Etherscan API endpoint (V2)
const ETHERSCAN_API = 'https://api.etherscan.io/v2/api';

// API key
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'E38NWXAGWBUSJIX8DHJNDU3HQZX2ZRKRAT';

/**
 * Get the appropriate API configuration for a network
 */
function getApiConfig(networkKey) {
  const network = NETWORKS[networkKey];
  if (!network) {
    throw new Error(`Network ${networkKey} not found`);
  }

  // Get chain ID from network configuration
  const chainId = network.id;
  if (!chainId) {
    throw new Error(`Network ${networkKey} does not have a chain ID configured`);
  }

  return {
    baseUrl: ETHERSCAN_API,
    apiKey: ETHERSCAN_API_KEY,
    chainId: chainId,
    explorer: getExplorerUrl(networkKey)
  };
}

/**
 * Get explorer URL for a network
 */
function getExplorerUrl(networkKey) {
  const network = NETWORKS[networkKey];
  return network?.explorer || 'etherscan.io';
}

/**
 * Make HTTP request to explorer API
 */
async function makeApiRequest(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.keys(params).forEach(key => {
    url.searchParams.append(key, params[key]);
  });

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === '0' && data.message === 'NOTOK') {
      throw new Error(`API error: ${data.result}`);
    }
    
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Get event logs from explorer API
 * @param {string} networkKey - Network key (ETHEREUM, BSC)
 * @param {string} address - Contract address
 * @param {string} topic0 - Event signature hash (optional)
 * @param {number} fromBlock - Start block (optional)
 * @param {number} toBlock - End block (optional)
 * @param {number} page - Page number (default: 1)
 * @param {number} offset - Results per page (default: 1000, max: 10000)
 * @returns {Promise<Array>} Array of event logs
 */
async function getEventLogs(networkKey, address, options = {}) {
  const {
    topic0 = null,
    fromBlock = null,
    toBlock = null,
    page = 1,
    offset = 1000
  } = options;

  const apiConfig = getApiConfig(networkKey);
  
  const params = {
    module: 'logs',
    action: 'getLogs',
    chainid: apiConfig.chainId,
    address: address,
    apikey: apiConfig.apiKey,
    page: page,
    offset: Math.min(offset, 10000) // API limit is 10000
  };

  if (topic0) {
    params.topic0 = topic0;
  }
  if (fromBlock) {
    params.fromBlock = fromBlock;
  }
  if (toBlock) {
    params.toBlock = toBlock;
  }

  console.log(`🔍 Fetching event logs from ${apiConfig.explorer} (Chain ID: ${apiConfig.chainId}) for address ${address}`);
  console.log(`   Topic0: ${topic0 || 'all'}`);
  console.log(`   Block range: ${fromBlock || 'latest'} to ${toBlock || 'latest'}`);
  console.log(`   Page: ${page}, Offset: ${offset}`);

  try {
    const data = await makeApiRequest(apiConfig.baseUrl, params);
    
    if (data.result && Array.isArray(data.result)) {
      console.log(`   ✅ Found ${data.result.length} events`);
      return data.result;
    } else {
      console.log(`   ⚠️  No events found or unexpected response format`);
      return [];
    }
  } catch (error) {
    console.error(`   ❌ Error fetching events:`, error.message);
    throw error;
  }
}

/**
 * Get NewClaim events for a bridge contract
 * @param {string} networkKey - Network key
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of NewClaim events
 */
async function getNewClaimEvents(networkKey, bridgeAddress, options = {}) {
  // NewClaim event signature: NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)
  const NEW_CLAIM_TOPIC = '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736';
  
  const apiConfig = getApiConfig(networkKey);
  console.log(`🎯 Fetching NewClaim events for bridge ${bridgeAddress} on ${networkKey} (Chain ID: ${apiConfig.chainId})`);
  
  try {
    const events = await getEventLogs(networkKey, bridgeAddress, {
      topic0: NEW_CLAIM_TOPIC,
      ...options
    });

    // Parse the events to extract relevant data
    const parsedEvents = events.map(event => {
      try {
        // Decode the event data
        const topics = event.topics || [];
        
        // Extract indexed parameters from topics
        const claimNum = topics[1] ? parseInt(topics[1], 16) : null;
        const authorAddress = topics[2] ? `0x${topics[2].slice(26)}` : null;
        const recipientAddress = topics[3] ? `0x${topics[3].slice(26)}` : null;
        
        // For now, return simplified data without full ABI decoding
        return {
          // Event metadata
          blockNumber: parseInt(event.blockNumber, 16),
          transactionHash: event.transactionHash,
          logIndex: parseInt(event.logIndex, 16),
          address: event.address,
          
          // Decoded event data
          claim_num: claimNum,
          author_address: authorAddress,
          recipient_address: recipientAddress,
          sender_address: '0x0000000000000000000000000000000000000000', // Would need ABI decoding
          txid: '0x0000000000000000000000000000000000000000000000000000000000000000', // Would need ABI decoding
          txts: '0', // Would need ABI decoding
          amount: '0', // Would need ABI decoding
          reward: '0', // Would need ABI decoding
          stake: '0', // Would need ABI decoding
          data: '0x', // Would need ABI decoding
          expiry_ts: '0', // Would need ABI decoding
          
          // Raw event data
          raw: event
        };
      } catch (error) {
        console.error('Error parsing event:', error);
        return null;
      }
    }).filter(event => event !== null);

    console.log(`   ✅ Successfully parsed ${parsedEvents.length} NewClaim events`);
    return parsedEvents;

  } catch (error) {
    console.error(`   ❌ Error fetching NewClaim events:`, error.message);
    throw error;
  }
}

/**
 * Test the explorer API connection
 * @param {string} networkKey - Network key
 * @returns {Promise<boolean>} True if connection successful
 */
async function testExplorerConnection(networkKey) {
  try {
    const apiConfig = getApiConfig(networkKey);
    
    // Test with a simple API call
    const params = {
      module: 'proxy',
      action: 'eth_blockNumber',
      chainid: apiConfig.chainId,
      apikey: apiConfig.apiKey
    };
    
    const data = await makeApiRequest(apiConfig.baseUrl, params);
    const blockNumber = parseInt(data.result, 16);
    
    console.log(`✅ ${apiConfig.explorer} connection successful (Chain ID: ${apiConfig.chainId})`);
    console.log(`   Current block: ${blockNumber}`);
    return true;
    
  } catch (error) {
    console.error(`❌ ${networkKey} explorer connection failed:`, error.message);
    return false;
  }
}

// Export for ES modules
export {
  getEventLogs,
  getNewClaimEvents,
  testExplorerConnection,
  getApiConfig
};
