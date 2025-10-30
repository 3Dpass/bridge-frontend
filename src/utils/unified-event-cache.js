/**
 * Unified Event Cache Management
 * 
 * Provides browser storage caching for bridge events using the same format
 * as the parallel discovery system. This ensures consistency across all data sources.
 */

import { normalizeAmount } from './data-normalizer.js';

// Storage keys matching ClaimList.js pattern
const STORAGE_KEYS = {
  CLAIMS: 'bridge_claims_cache',
  TRANSFERS: 'bridge_transfers_cache',
  AGGREGATED: 'bridge_aggregated_cache', // Only completed transfers should ever be cached here
  SETTINGS: 'bridge_cache_settings',
  TIMESTAMP: 'bridge_cache_timestamp'
};

/**
 * Get cached data from localStorage
 * @param {string} key - Storage key
 * @returns {Array|null} Cached data or null if not found
 */
const getCachedData = (key) => {
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Failed to parse cached data:', error);
    return null;
  }
};

/**
 * Set cached data to localStorage
 * @param {string} key - Storage key
 * @param {Array} data - Data to cache
 */
const setCachedData = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEYS.TIMESTAMP, Date.now().toString());
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
};

/**
 * Add transfer event to storage (NewExpatriation/NewRepatriation)
 * Uses the exact same format as parallel discovery system
 * @param {Object} eventData - Transfer event data in discovery format
 */
export const addTransferEventToStorage = (eventData) => {
  try {
    console.log('💾 Adding transfer event to browser storage:', eventData);
    
    // Get existing transfers from storage
    const existingTransfers = getCachedData(STORAGE_KEYS.TRANSFERS) || [];
    
    // Check if this transfer already exists (by transaction hash)
    const existingIndex = existingTransfers.findIndex(t => t.transactionHash === eventData.transactionHash);
    
    if (existingIndex >= 0) {
      // Update existing transfer
      existingTransfers[existingIndex] = { ...existingTransfers[existingIndex], ...eventData };
      console.log('🔄 Updated existing transfer in storage');
    } else {
      // Add new transfer at the beginning (most recent first)
      existingTransfers.unshift(eventData);
      console.log('➕ Added new transfer to storage');
    }
    
    // Save back to storage
    setCachedData(STORAGE_KEYS.TRANSFERS, existingTransfers);
    
    console.log('✅ Transfer event successfully added to browser storage');
    return true;
  } catch (error) {
    console.error('❌ Failed to add transfer event to storage:', error);
    return false;
  }
};

/**
 * Add claim event to storage (NewClaim)
 * Uses the exact same format as parallel discovery system
 * @param {Object} eventData - Claim event data in discovery format
 */
export const addClaimEventToStorage = (eventData) => {
  try {
    console.log('💾 Adding claim event to browser storage:', eventData);
    
    // Get existing claims from storage
    const existingClaims = getCachedData(STORAGE_KEYS.CLAIMS) || [];
    
    // Check if this claim already exists (by transaction hash)
    const existingIndex = existingClaims.findIndex(c => c.transactionHash === eventData.transactionHash);
    
    if (existingIndex >= 0) {
      // Update existing claim
      existingClaims[existingIndex] = { ...existingClaims[existingIndex], ...eventData };
      console.log('🔄 Updated existing claim in storage');
    } else {
      // Add new claim at the beginning (most recent first)
      existingClaims.unshift(eventData);
      console.log('➕ Added new claim to storage');
    }
    
    // Save back to storage
    setCachedData(STORAGE_KEYS.CLAIMS, existingClaims);
    
    console.log('✅ Claim event successfully added to browser storage');
    return true;
  } catch (error) {
    console.error('❌ Failed to add claim event to storage:', error);
    return false;
  }
};

/**
 * Get all cached transfer events
 * @returns {Array} Cached transfer events
 */
export const getCachedTransfers = () => {
  return getCachedData(STORAGE_KEYS.TRANSFERS) || [];
};

/**
 * Get all cached claim events
 * @returns {Array} Cached claim events
 */
export const getCachedClaims = () => {
  return getCachedData(STORAGE_KEYS.CLAIMS) || [];
};

/**
 * Get cached aggregated data (completed-only snapshot)
 * @returns {Object|null} Aggregated data or null
 */
export const getCachedAggregated = () => {
  return getCachedData(STORAGE_KEYS.AGGREGATED);
};

/**
 * Get cached settings
 * @returns {Object|null} Settings or null
 */
export const getCachedSettings = () => {
  return getCachedData(STORAGE_KEYS.SETTINGS);
};

/**
 * Clear all cached events
 */
export const clearAllCachedEvents = () => {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('🗑️ Cleared all cached events');
  } catch (error) {
    console.warn('Failed to clear cached data:', error);
  }
};

/**
 * Get cache timestamp
 * @returns {number|null} Cache timestamp or null if not found
 */
export const getCacheTimestamp = () => {
  try {
    const timestamp = localStorage.getItem(STORAGE_KEYS.TIMESTAMP);
    return timestamp ? parseInt(timestamp) : null;
  } catch (error) {
    console.warn('Failed to get cache timestamp:', error);
    return null;
  }
};

/**
 * Load a unified snapshot of cached data in one call
 * Returns claims, transfers, aggregated (completed-only), settings, and timestamp
 * @returns {{claims:Array, transfers:Array, aggregated:Object|null, settings:Object|null, timestamp:number|null}}
 */
export const loadCachedBridgeData = () => {
  const claims = getCachedClaims();
  const transfers = getCachedTransfers();
  const aggregated = getCachedAggregated();
  const settings = getCachedSettings();
  const timestamp = getCacheTimestamp();
  return { claims, transfers, aggregated, settings, timestamp };
};

/**
 * Create transfer event data in discovery format
 * This ensures all components create events with the same structure
 * @param {Object} params - Event parameters
 * @returns {Object} Transfer event in discovery format
 */
export const createTransferEventData = (params) => {
  const {
    eventType, // 'NewExpatriation' or 'NewRepatriation'
    senderAddress,
    amount,
    reward,
    recipientAddress,
    data,
    blockNumber,
    transactionHash,
    logIndex,
    timestamp,
    bridgeAddress,
    bridgeType,
    homeNetwork,
    foreignNetwork,
    homeTokenSymbol,
    foreignTokenSymbol,
    networkKey,
    networkName
  } = params;

  return {
    // Core event data
    eventType,
    event: eventType,
    args: {
      sender_address: senderAddress,
      amount: amount,
      reward: reward,
      data: data,
      ...(eventType === 'NewExpatriation' && { foreign_address: recipientAddress }),
      ...(eventType === 'NewRepatriation' && { home_address: recipientAddress })
    },
    
    // Event metadata
    blockNumber,
    transactionHash,
    logIndex,
    timestamp,
    
    // Bridge information
    bridgeAddress,
    bridgeType,
    homeNetwork,
    foreignNetwork,
    homeTokenSymbol,
    foreignTokenSymbol,
    
    // Network information
    networkKey,
    networkName: networkName || homeNetwork,
    networkId: networkKey,
    
    // Transfer direction
    fromNetwork: eventType === 'NewExpatriation' ? homeNetwork : foreignNetwork,
    toNetwork: eventType === 'NewExpatriation' ? foreignNetwork : homeNetwork,
    fromTokenSymbol: eventType === 'NewExpatriation' ? homeTokenSymbol : foreignTokenSymbol,
    toTokenSymbol: eventType === 'NewExpatriation' ? foreignTokenSymbol : homeTokenSymbol,
    
    // Token information
    tokenSymbol: homeTokenSymbol,
    
    // UI fields
    senderAddress,
    recipientAddress,
    amount: normalizeAmount(amount),
    reward: normalizeAmount(reward),
    
    // Extract txid based on event type
    txid: transactionHash, // For transfers, txid is the transaction hash
    
    // Status
    status: 'pending'
  };
};

/**
 * Create claim event data in discovery format
 * This ensures all components create events with the same structure
 * @param {Object} params - Event parameters
 * @returns {Object} Claim event in discovery format
 */
export const createClaimEventData = (params) => {
  const {
    claimNum,
    authorAddress,
    senderAddress,
    recipientAddress,
    txid,
    txts,
    amount,
    reward,
    stake,
    data,
    expiryTs,
    blockNumber,
    transactionHash,
    logIndex,
    timestamp,
    bridgeAddress,
    bridgeType,
    homeNetwork,
    foreignNetwork,
    homeTokenSymbol,
    foreignTokenSymbol,
    networkKey,
    networkName
  } = params;

  return {
    // Core event data
    eventType: 'NewClaim',
    event: 'NewClaim',
    args: {
      claim_num: claimNum,
      author_address: authorAddress,
      sender_address: senderAddress,
      recipient_address: recipientAddress,
      txid: txid,
      txts: txts,
      amount: amount,
      reward: reward,
      stake: stake,
      data: data,
      expiry_ts: expiryTs
    },
    
    // Event metadata
    blockNumber,
    transactionHash,
    claimTransactionHash: transactionHash,
    logIndex,
    timestamp,
    
    // Bridge information
    bridgeAddress,
    bridgeType,
    homeNetwork,
    foreignNetwork,
    homeTokenSymbol,
    foreignTokenSymbol,
    
    // Network information
    networkKey,
    networkName: networkName || homeNetwork,
    networkId: networkKey,
    
    // Transfer direction (claim is always inbound)
    fromNetwork: bridgeType === 'export' ? foreignNetwork : homeNetwork,
    toNetwork: networkName || 'Current Network',
    fromTokenSymbol: bridgeType === 'export' ? foreignTokenSymbol : homeTokenSymbol,
    toTokenSymbol: bridgeType === 'export' ? homeTokenSymbol : foreignTokenSymbol,
    
    // Token information
    tokenSymbol: homeTokenSymbol,
    
    // UI fields
    claimNum,
    actualClaimNum: claimNum,
    senderAddress,
    recipientAddress,
    claimant_address: authorAddress,
    amount: normalizeAmount(amount),
    reward: normalizeAmount(reward),
    txid,
    txts: Number(txts),
    expiryTs,
    
    // Status
    status: 'active'
  };
};

// Export storage keys and utility functions for consistency
export { STORAGE_KEYS, setCachedData };
