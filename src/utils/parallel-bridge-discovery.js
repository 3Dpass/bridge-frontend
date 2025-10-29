/**
 * Parallel Bridge Discovery System
 * 
 * This module implements the simplified discovery logic:
 * 1. One call per bridge using unified-block-fetcher to get all event types
 * 2. Direct event processing from unified fetcher results
 * 3. Event matching by txid for complete transfer pairs
 * 4. Real-time UI updates as data arrives
 */

import { ethers } from 'ethers';
import { getAllEventBlockNumbersUnified } from './unified-block-fetcher.js';
import { getNetworkWithSettings } from './settings.js';
import { COUNTERSTAKE_ABI, EXPORT_ABI, IMPORT_ABI } from '../contracts/abi.js';
import { getBlockTimestamp } from './bridge-contracts.js';
import { wait } from './utils.js';

// Rate limiting configuration
const RATE_LIMIT_MS = 1000; // 1 second between requests

/**
 * Get all events for a single bridge using unified-block-fetcher
 * @param {Object} bridgeConfig - Bridge configuration
 * @param {Object} options - Discovery options
 * @param {number} options.rangeHours - Hours of history to scan (default: 24)
 * @returns {Promise<Object>} Bridge events with matched transfers
 */
async function discoverBridgeEvents(bridgeConfig, options = {}) {
  const { bridgeAddress, networkKey, bridgeType, homeNetwork, foreignNetwork, homeTokenSymbol, foreignTokenSymbol } = bridgeConfig;
  const { rangeHours = 24 } = options;
  
  console.log(`🔍 Discovering events for ${networkKey} bridge ${bridgeAddress} (${bridgeType}) - ${rangeHours}h range`);
  
  try {
    // Get all event types in one call using unified fetcher
    const eventResult = await getAllEventBlockNumbersUnified(networkKey, bridgeAddress, { 
      rangeHours 
    });
    
    console.log(`✅ ${networkKey}: Found ${eventResult.eventCount} events in ${eventResult.blockNumbers.length} blocks`);
    
    if (eventResult.eventCount === 0) {
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
    
    // Decode events using ABI
    const decodedEvents = await decodeEventsWithABI(networkKey, bridgeAddress, eventResult.events || [], bridgeType, homeNetwork, foreignNetwork, homeTokenSymbol, foreignTokenSymbol);
    
    // Categorize events by type
    const expatriations = decodedEvents.filter(e => e.eventType === 'NewExpatriation');
    const repatriations = decodedEvents.filter(e => e.eventType === 'NewRepatriation');
    const claims = decodedEvents.filter(e => e.eventType === 'NewClaim');
    
    console.log(`📊 ${networkKey}: Event breakdown - Expatriations: ${expatriations.length}, Repatriations: ${repatriations.length}, Claims: ${claims.length}`);
    
    // Debug: Log the actual event data
    if (expatriations.length > 0) {
      console.log(`🔍 ${networkKey}: First expatriation data:`, {
        transactionHash: expatriations[0].transactionHash,
        txid: expatriations[0].txid,
        senderAddress: expatriations[0].senderAddress,
        recipientAddress: expatriations[0].recipientAddress,
        fromNetwork: expatriations[0].fromNetwork,
        toNetwork: expatriations[0].toNetwork,
        networkName: expatriations[0].networkName,
        tokenSymbol: expatriations[0].tokenSymbol
      });
    }
    
    if (claims.length > 0) {
      console.log(`🔍 ${networkKey}: First claim data:`, {
        transactionHash: claims[0].transactionHash,
        txid: claims[0].txid,
        claimNum: claims[0].claimNum,
        amount: claims[0].amount?.toString(),
        senderAddress: claims[0].senderAddress,
        recipientAddress: claims[0].recipientAddress
      });
    }
    
    // Return raw events - let aggregation utility handle the matching
    console.log(`📊 ${networkKey}: Found ${expatriations.length} expatriations, ${repatriations.length} repatriations, ${claims.length} claims`);
    
    return {
      bridgeAddress,
      networkKey,
      bridgeType,
      homeNetwork,
      foreignNetwork,
      events: decodedEvents,
      transfers: [...expatriations, ...repatriations],
      claims,
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
      error: error.message
    };
  }
}

// Export the main discovery function
export { discoverBridgeEvents };

/**
 * Decode events using ABI to get full event data
 * @param {string} networkKey - Network key
 * @param {string} bridgeAddress - Bridge address
 * @param {Array} events - Raw events from unified fetcher
 * @param {string} bridgeType - Bridge type (Export, Import)
 * @param {string} homeNetwork - Home network name
 * @param {string} foreignNetwork - Foreign network name
 * @param {string} homeTokenSymbol - Home token symbol
 * @param {string} foreignTokenSymbol - Foreign token symbol
 * @returns {Promise<Array>} Decoded events with full data
 */
async function decodeEventsWithABI(networkKey, bridgeAddress, events, bridgeType, homeNetwork, foreignNetwork, homeTokenSymbol, foreignTokenSymbol) {
  if (!events || events.length === 0) {
    return [];
  }

  console.log(`🔍 Decoding ${events.length} events using ABI for ${networkKey}`);

  // For 3dpass, we need to fetch block timestamps for transfer events
  let blockTimestamps = {};

  try {
  const networkConfig = getNetworkWithSettings(networkKey);
  if (!networkConfig?.rpcUrl) {
    throw new Error(`No RPC URL found for network ${networkKey}`);
  }
  
  if (networkKey === 'THREEDPASS') {
    const provider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
    const transferEvents = events.filter(e => e.eventType === 'NewExpatriation' || e.eventType === 'NewRepatriation');
    const uniqueBlockNumbers = [...new Set(transferEvents.map(event => event.blockNumber))];
    
    console.log(`🔍 Fetching block timestamps for ${uniqueBlockNumbers.length} unique blocks on 3dpass`);
    
    for (const blockNumber of uniqueBlockNumbers) {
      try {
        const timestamp = await getBlockTimestamp(provider, blockNumber);
        blockTimestamps[blockNumber] = timestamp;
      } catch (error) {
        console.warn(`⚠️ Could not get timestamp for 3dpass block ${blockNumber}:`, error.message);
        blockTimestamps[blockNumber] = undefined;
      }
    }
  }
  
    // Select the correct ABI based on bridge type
    let abiToUse;
    if (bridgeType === 'Export' || bridgeType === 'export' || bridgeType === 'export_wrapper') {
      abiToUse = EXPORT_ABI;
    } else if (bridgeType === 'Import' || bridgeType === 'import' || bridgeType === 'import_wrapper') {
      abiToUse = IMPORT_ABI;
    } else {
      abiToUse = COUNTERSTAKE_ABI; // Fallback
    }
    
    const contractInterface = new ethers.utils.Interface(abiToUse);

    // Convert raw logs to ethers format and decode
    const decodedEvents = [];
    for (const event of events) {
      try {
        // Use rawLog if available, otherwise reconstruct from event data
        const rawLog = event.rawLog || {
          address: event.address || bridgeAddress,
          topics: event.topics,
          data: event.data || '0x',
          blockNumber: `0x${event.blockNumber.toString(16)}`,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex || 0,
          logIndex: `0x${event.logIndex.toString(16)}`,
          blockHash: event.blockHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
          removed: event.removed || false
        };

        // Decode using ABI
        const decoded = contractInterface.parseLog(rawLog);
        if (decoded) {
          const decodedEvent = {
            eventType: event.eventType,
            event: decoded.name,
            args: decoded.args,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
            topics: event.topics,
          address: bridgeAddress,
            // Extract txid based on event type
            txid: extractTxidFromDecodedEvent(decoded, event.eventType, event.transactionHash),
            // Add essential metadata for UI
            networkKey: networkKey,
            bridgeType: bridgeType,
            bridgeAddress: bridgeAddress,
            // Add event-specific data based on event type
            ...(event.eventType === 'NewExpatriation' && {
              amount: decoded.args.amount,
              senderAddress: decoded.args.sender_address,
              recipientAddress: decoded.args.foreign_address, // NewExpatriation uses foreign_address
              reward: decoded.args.reward,
              data: decoded.args.data,
              timestamp: event.rawLog?.blockTimestamp ? parseInt(event.rawLog.blockTimestamp, 16) : (networkKey === 'THREEDPASS' ? blockTimestamps[event.blockNumber] : undefined), // Use rawLog for ETH/BSC, fetched timestamp for 3dpass
              fromNetwork: homeNetwork, // Use actual bridge configuration
              toNetwork: foreignNetwork, // Use actual bridge configuration
              homeNetwork: homeNetwork,
              foreignNetwork: foreignNetwork,
              networkName: networkConfig?.name || networkKey,
              tokenSymbol: homeTokenSymbol, // Use actual token symbol from bridge config
              homeTokenSymbol: homeTokenSymbol,
              foreignTokenSymbol: foreignTokenSymbol
            }),
            ...(event.eventType === 'NewRepatriation' && {
              amount: decoded.args.amount,
              senderAddress: decoded.args.sender_address,
              recipientAddress: decoded.args.home_address, // NewRepatriation uses home_address
              reward: decoded.args.reward,
              data: decoded.args.data,
              timestamp: event.rawLog?.blockTimestamp ? parseInt(event.rawLog.blockTimestamp, 16) : (networkKey === 'THREEDPASS' ? blockTimestamps[event.blockNumber] : undefined), // Use rawLog for ETH/BSC, fetched timestamp for 3dpass
              fromNetwork: foreignNetwork, // Use actual bridge configuration
              toNetwork: homeNetwork, // Use actual bridge configuration
              homeNetwork: homeNetwork,
              foreignNetwork: foreignNetwork,
              networkName: networkConfig?.name || networkKey,
              tokenSymbol: homeTokenSymbol, // Use actual token symbol from bridge config
              homeTokenSymbol: homeTokenSymbol,
              foreignTokenSymbol: foreignTokenSymbol
            }),
            ...(event.eventType === 'NewClaim' && {
              claimNum: decoded.args.claim_num,
              actualClaimNum: decoded.args.claim_num,
              amount: decoded.args.amount,
              recipientAddress: decoded.args.recipient_address,
              senderAddress: decoded.args.sender_address,
              claimant_address: decoded.args.author_address,
              reward: decoded.args.reward,
              data: decoded.args.data,
              txid: decoded.args.txid,
              txts: Number(decoded.args.txts),
              blockNumber: event.blockNumber,
              claimTransactionHash: event.transactionHash,
              networkName: networkConfig?.name || networkKey,
              tokenSymbol: homeTokenSymbol, // Use actual token symbol from bridge config
              homeTokenSymbol: homeTokenSymbol,
              foreignTokenSymbol: foreignTokenSymbol,
              // Add missing network fields for flow validation
              homeNetwork: homeNetwork,
              foreignNetwork: foreignNetwork
            })
          };

          decodedEvents.push(decodedEvent);
        }
      } catch (error) {
        console.warn(`⚠️ Could not decode event: ${error.message}`);
        // Include raw event as fallback with essential metadata
        decodedEvents.push({
          ...event,
          event: event.eventType,
          args: {},
          txid: event.transactionHash,
          // Remove raw data field to avoid conflicts
          data: undefined,
          // Add essential metadata for UI
          networkKey: networkKey,
          bridgeType: bridgeType,
          bridgeAddress: bridgeAddress,
          networkName: networkConfig?.name || networkKey,
          tokenSymbol: homeTokenSymbol, // Use actual token symbol from bridge config
          homeTokenSymbol: homeTokenSymbol,
          foreignTokenSymbol: foreignTokenSymbol,
          homeNetwork: homeNetwork,
          foreignNetwork: foreignNetwork,
          timestamp: event.rawLog?.blockTimestamp ? parseInt(event.rawLog.blockTimestamp, 16) : (networkKey === 'THREEDPASS' ? blockTimestamps[event.blockNumber] : undefined) // Use rawLog for ETH/BSC, fetched timestamp for 3dpass
        });
      }
    }

    console.log(`✅ Successfully decoded ${decodedEvents.length} events`);
    return decodedEvents;

      } catch (error) {
    console.error(`❌ Error decoding events:`, error.message);
    // Return raw events as fallback with essential metadata
    return events.map(event => ({
      ...event,
      event: event.eventType,
      args: {},
      txid: event.transactionHash,
      // Remove raw data field to avoid conflicts
      data: undefined,
      // Add essential metadata for UI
      networkKey: networkKey,
      bridgeType: bridgeType,
      bridgeAddress: bridgeAddress,
      networkName: homeNetwork,
      tokenSymbol: homeTokenSymbol, // Use actual token symbol from bridge config
      homeTokenSymbol: homeTokenSymbol,
      foreignTokenSymbol: foreignTokenSymbol,
      homeNetwork: homeNetwork,
      foreignNetwork: foreignNetwork,
      timestamp: event.rawLog?.blockTimestamp ? parseInt(event.rawLog.blockTimestamp, 16) : (networkKey === 'THREEDPASS' ? blockTimestamps[event.blockNumber] : undefined) // Use rawLog for ETH/BSC, fetched timestamp for 3dpass
    }));
  }
}

/**
 * Extract txid from decoded event based on event type
 * @param {Object} decoded - Decoded event from ethers.js
 * @param {string} eventType - Event type (NewClaim, NewExpatriation, NewRepatriation)
 * @param {string} transactionHash - Transaction hash as fallback
 * @returns {string} Extracted txid
 */
function extractTxidFromDecodedEvent(decoded, eventType, transactionHash) {
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
 * Discover all bridge events in parallel
 * @param {Array} bridgeConfigs - Array of bridge configurations
 * @param {Object} options - Discovery options
 * @param {number} options.rangeHours - Hours of history to scan (default: 24)
 * @returns {Promise<Object>} Discovery results
 */
export async function discoverAllBridgeEvents(bridgeConfigs, options = {}) {
  const { rangeHours = 24 } = options;
  console.log(`🚀 Starting parallel discovery for ${bridgeConfigs.length} bridges (${rangeHours}h range)`);
  
  // Step 1: Discover all bridge events with rate limiting
  const bridgeResults = [];
  for (let i = 0; i < bridgeConfigs.length; i++) {
    const bridgeConfig = bridgeConfigs[i];
    
    // Rate limiting between bridge discoveries
    if (i > 0) {
      console.log(`⏳ Waiting ${RATE_LIMIT_MS}ms before discovering next bridge...`);
      await wait(RATE_LIMIT_MS);
    }
    
    const result = await discoverBridgeEvents(bridgeConfig, options);
    bridgeResults.push(result);
  }
  
  // Step 2: Aggregate results
  const allEvents = bridgeResults.flatMap(result => result.events);
  const allTransfers = bridgeResults.flatMap(result => result.transfers);
  const allClaims = bridgeResults.flatMap(result => result.claims);
  
  console.log(`📊 Discovery complete: ${allEvents.length} events, ${allTransfers.length} transfers, ${allClaims.length} claims`);
  
  return {
    bridgeResults,
    allEvents,
    allTransfers,
    allClaims,
    stats: {
      totalBridges: bridgeConfigs.length,
      successfulBridges: bridgeResults.filter(r => !r.error).length,
      totalEvents: allEvents.length,
      totalTransfers: allTransfers.length,
      totalClaims: allClaims.length
    }
  };
}

