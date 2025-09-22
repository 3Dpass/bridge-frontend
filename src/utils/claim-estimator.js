import { NETWORKS } from '../config/networks';

/**
 * Claim estimation utilities for calculating the number of claims to fetch
 * based on timeframes and network-specific claim/block ratios
 */

/**
 * Get the claim/block ratio for a specific network
 * @param {string} networkKey - Network key (e.g., 'ETHEREUM', 'THREEDPASS')
 * @returns {number} Claims per block ratio
 */
export const getClaimBlockRatio = (networkKey) => {
  const network = NETWORKS[networkKey];
  if (!network) {
    console.warn(`Network ${networkKey} not found, using default claim/block ratio of 1`);
    return 1; // Default fallback
  }
  
  return network.claimBlockRatio || 1; // Default to 1 if not specified
};

/**
 * Estimate the number of claims to fetch based on timeframe and network
 * @param {number} timeframeHours - Timeframe in hours
 * @param {string} networkKey - Network key
 * @returns {number} Estimated number of claims to fetch
 */
export const estimateClaimsFromTimeframe = (timeframeHours, networkKey) => {
  const network = NETWORKS[networkKey];
  if (!network) {
    console.warn(`Network ${networkKey} not found, using default values`);
    return 100; // Default fallback
  }

  const blockTime = network.blockTime || 12; // Default to 12 seconds
  const claimBlockRatio = network.claimBlockRatio || 1; // Default to 1 claim per block

  // Calculate blocks in the timeframe
  const totalSeconds = timeframeHours * 3600;
  const blocksInTimeframe = Math.ceil(totalSeconds / blockTime);

  // Calculate estimated claims
  const estimatedClaims = Math.ceil(blocksInTimeframe * claimBlockRatio);

  // Apply reasonable limits
  const minClaims = 10; // Always fetch at least 10 claims
  const maxClaims = 1000; // Never fetch more than 1000 claims

  const finalEstimate = Math.max(minClaims, Math.min(maxClaims, estimatedClaims));

  console.log(`🔍 Claim estimation for ${networkKey}:`, {
    timeframeHours,
    blockTime,
    claimBlockRatio,
    blocksInTimeframe,
    estimatedClaims,
    finalEstimate
  });

  return finalEstimate;
};

/**
 * Get a human-readable description of the claim estimation
 * @param {number} claims - Number of claims
 * @param {string} networkKey - Network key
 * @param {number} timeframeHours - Timeframe in hours
 * @returns {string} Description of the estimation
 */
export const getClaimDescription = (claims, networkKey, timeframeHours) => {
  const network = NETWORKS[networkKey];
  const networkName = network?.name || networkKey;
  
  if (timeframeHours < 1) {
    const minutes = Math.round(timeframeHours * 60);
    return `${claims} claims (last ${minutes} minutes on ${networkName})`;
  } else if (timeframeHours < 24) {
    return `${claims} claims (last ${timeframeHours} hours on ${networkName})`;
  } else {
    const days = Math.round(timeframeHours / 24 * 10) / 10;
    return `${claims} claims (last ${days} days on ${networkName})`;
  }
};

/**
 * Estimate claims for all networks based on a timeframe
 * @param {number} timeframeHours - Timeframe in hours
 * @returns {Object} Object with network keys and their estimated claims
 */
export const estimateClaimsForAllNetworks = (timeframeHours) => {
  const estimates = {};
  
  Object.keys(NETWORKS).forEach(networkKey => {
    estimates[networkKey] = estimateClaimsFromTimeframe(timeframeHours, networkKey);
  });
  
  return estimates;
};
