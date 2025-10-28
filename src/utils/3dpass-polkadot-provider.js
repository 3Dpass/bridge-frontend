import { ApiPromise, WsProvider } from '@polkadot/api';
import { request } from './request.js';

/**
 * 3DPass Polkadot.js Provider for fetching EVM logs
 * Uses eth.getLogs RPC method which is more reliable for Substrate-based chains
 */

let api = null;

/**
 * Initialize Polkadot.js API connection
 * @returns {Promise<ApiPromise>} Polkadot.js API instance
 */
async function getApi() {
  if (!api) {
    const provider = new WsProvider('wss://rpc.3dpass.org');
    api = await ApiPromise.create({ provider });
  }
  return api;
}

/**
 * Get EVM logs using Polkadot.js eth.getLogs method
 * @param {Object} params - Parameters object
 * @param {string} params.address - Contract address to query
 * @param {number} params.fromBlock - Starting block number
 * @param {number} params.toBlock - Ending block number
 * @param {Array} params.topics - Array of topic filters (optional)
 * @returns {Promise<Array>} Array of EVM logs
 */
async function getEvmLogs({ address, fromBlock, toBlock, topics = [] }) {
  try {
    const api = await getApi();
    
    // Convert block numbers to hex
    const fromBlockHex = `0x${fromBlock.toString(16)}`;
    const toBlockHex = `0x${toBlock.toString(16)}`;
    
    console.log(`🔍 Fetching EVM logs via Polkadot.js eth.getLogs:`);
    console.log(`  Address: ${address}`);
    console.log(`  From block: ${fromBlock} (${fromBlockHex})`);
    console.log(`  To block: ${toBlock} (${toBlockHex})`);
    console.log(`  Topics: ${topics.length > 0 ? topics.join(', ') : 'none'}`);
    
    // Call eth.getLogs RPC method - try without address filter first
    // Some Substrate chains have issues with address filtering in EthFilter
    const filter = {
      fromBlock: fromBlockHex,
      toBlock: toBlockHex
    };
    
    if (topics.length > 0) {
      filter.topics = topics;
    }
    
    console.log(`  Filter:`, filter);
    const logs = await api.rpc.eth.getLogs(filter);
    
    // Filter by address manually after getting logs
    const addressFilteredLogs = logs.filter(log => 
      log.address && log.address.toString().toLowerCase() === address.toLowerCase()
    );
    
    console.log(`  Raw logs: ${logs.length}, Address filtered: ${addressFilteredLogs.length}`);
    
    console.log(`  ✅ Found ${addressFilteredLogs.length} EVM logs for address ${address}`);
    
    // Convert logs to a more usable format
    const formattedLogs = addressFilteredLogs.map((log, index) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockHash: log.blockHash,
      blockNumber: parseInt(log.blockNumber.toString(), 10),
      transactionHash: log.transactionHash,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      transactionLogIndex: log.transactionLogIndex,
      removed: log.removed
    }));
    
    return formattedLogs;
    
  } catch (error) {
    console.error(`❌ Error fetching EVM logs via Polkadot.js:`, error.message);
    throw error;
  }
}

/**
 * Get events for a specific contract address using Polkadot.js
 * @param {Object} params - Parameters object
 * @param {string} params.address - Contract address to query
 * @param {number} params.fromBlock - Starting block number
 * @param {number} params.toBlock - Ending block number
 * @param {Array} params.eventTopics - Array of event topic signatures to filter by
 * @returns {Promise<Object>} Object with events and block numbers
 */
async function getContractEvents({ address, fromBlock, toBlock, eventTopics = [] }) {
  try {
    console.log(`🔍 Getting contract events via Polkadot.js for address ${address}`);
    
    // Get all EVM logs for the contract
    const allLogs = await getEvmLogs({
      address: address,
      fromBlock: fromBlock,
      toBlock: toBlock
    });
    
    // Filter logs by event topics if provided
    let filteredLogs = allLogs;
    if (eventTopics.length > 0) {
      filteredLogs = allLogs.filter(log => 
        log.topics && log.topics.length > 0 && eventTopics.includes(log.topics[0])
      );
    }
    
    // Extract unique block numbers
    const blockNumbers = [...new Set(filteredLogs.map(log => log.blockNumber))].sort((a, b) => b - a);
    
    console.log(`  📊 Event breakdown:`);
    console.log(`    Total logs: ${allLogs.length}`);
    console.log(`    Filtered logs: ${filteredLogs.length}`);
    console.log(`    Unique blocks: ${blockNumbers.length}`);
    
    // Categorize events by topic
    const eventBreakdown = {};
    filteredLogs.forEach(log => {
      if (log.topics && log.topics.length > 0) {
        const topic = log.topics[0];
        const eventType = getEventTypeFromTopic(topic);
        eventBreakdown[eventType] = (eventBreakdown[eventType] || 0) + 1;
      }
    });
    
    return {
      logs: filteredLogs,
      blockNumbers: blockNumbers,
      eventBreakdown: eventBreakdown,
      totalEvents: filteredLogs.length
    };
    
  } catch (error) {
    console.error(`❌ Error getting contract events via Polkadot.js:`, error.message);
    throw error;
  }
}

/**
 * Get event type from topic signature
 * @param {string} topic - Topic signature
 * @returns {string} Event type name
 */
function getEventTypeFromTopic(topic) {
  const topicMap = {
    '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736': 'NewClaim',
    '0xe7fa22cb6a93e7faaadf534496eb2c5401ff2468cbf95117e89ea148af253e0d': 'NewExpatriation',
    '0x4769528a977394d0b1b9c3ad55e7701566261bb71bb5d57c1af58bcb84db30cc': 'NewRepatriation'
  };
  
  return topicMap[topic] || 'Unknown';
}

/**
 * Decode event data using ABI
 * @param {Object} log - EVM log object
 * @param {string} eventType - Type of event (NewClaim, NewExpatriation, NewRepatriation)
 * @returns {Object} Decoded event data
 */
function decodeEventData(log, eventType) {
  // This would need to be implemented with proper ABI decoding
  // For now, return basic log info
  return {
    eventType: eventType,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    topics: log.topics,
    data: log.data,
    address: log.address
  };
}

/**
 * Close the API connection
 */
async function closeApi() {
  if (api) {
    await api.disconnect();
    api = null;
  }
}

export { 
  getEvmLogs, 
  getContractEvents, 
  getEventTypeFromTopic, 
  decodeEventData, 
  closeApi 
};
