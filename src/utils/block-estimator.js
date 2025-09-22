import { NETWORKS, TESTNET_NETWORKS } from '../config/networks';

/**
 * Block estimation utility for calculating blocks based on timeframes
 */

// Timeframe options for history search depth
export const TIMEFRAME_OPTIONS = [
  { value: 0.25, label: '15 minutes', hours: 0.25 },
  { value: 0.5, label: '30 minutes', hours: 0.5 },
  { value: 1, label: '1 hour', hours: 1 },
  { value: 2, label: '2 hours', hours: 2 },
  { value: 6, label: '6 hours', hours: 6 },
  { value: 12, label: '12 hours', hours: 12 },
  { value: 24, label: '1 day', hours: 24 },
  { value: 48, label: '2 days', hours: 48 },
  { value: 72, label: '3 days', hours: 72 },
  { value: 168, label: '1 week', hours: 168 },
  { value: 720, label: '1 month', hours: 720 },
];

/**
 * Get block time for a specific network
 * @param {string} networkSymbol - Network symbol (ETH, 3DPass, BSC)
 * @returns {number} Block time in seconds
 */
export const getBlockTime = (networkSymbol) => {
  const allNetworks = { ...NETWORKS, ...TESTNET_NETWORKS };
  const network = allNetworks[networkSymbol];
  
  if (!network) {
    console.warn(`Network ${networkSymbol} not found, using default block time of 12 seconds`);
    return 12; // Default to Ethereum block time
  }
  
  return network.blockTime || 12; // Default to 12 seconds if not specified
};

/**
 * Estimate number of blocks for a given timeframe
 * @param {number} hours - Number of hours
 * @param {string} networkSymbol - Network symbol (ETH, 3DPass, BSC)
 * @returns {number} Estimated number of blocks
 */
export const estimateBlocksFromHours = (hours, networkSymbol) => {
  const blockTime = getBlockTime(networkSymbol);
  const seconds = hours * 3600; // Convert hours to seconds
  const blocks = Math.ceil(seconds / blockTime); // Round up to ensure we don't miss any blocks
  
  console.log(`🔍 Block estimation for ${networkSymbol}:`, {
    hours,
    blockTime,
    seconds,
    estimatedBlocks: blocks
  });
  
  return blocks;
};

/**
 * Estimate number of blocks for a given timeframe (using timeframe value)
 * @param {number} timeframeValue - Timeframe value (e.g., 1 for 1 hour, 24 for 1 day)
 * @param {string} networkSymbol - Network symbol (ETH, 3DPass, BSC)
 * @returns {number} Estimated number of blocks
 */
export const estimateBlocksFromTimeframe = (timeframeValue, networkSymbol) => {
  return estimateBlocksFromHours(timeframeValue, networkSymbol);
};

/**
 * Get human-readable description of blocks for a timeframe
 * @param {number} timeframeValue - Timeframe value
 * @param {string} networkSymbol - Network symbol
 * @returns {string} Human-readable description
 */
export const getBlockDescription = (timeframeValue, networkSymbol) => {
  const blocks = estimateBlocksFromTimeframe(timeframeValue, networkSymbol);
  const timeframe = TIMEFRAME_OPTIONS.find(opt => opt.value === timeframeValue);
  const timeframeLabel = timeframe ? timeframe.label : `${timeframeValue} hours`;
  
  return `${blocks} blocks (${timeframeLabel})`;
};

/**
 * Get block estimation for all supported networks
 * @param {number} timeframeValue - Timeframe value
 * @returns {Object} Block estimations for each network
 */
export const getAllNetworkBlockEstimations = (timeframeValue) => {
  const estimations = {};
  
  Object.keys(NETWORKS).forEach(networkSymbol => {
    estimations[networkSymbol] = {
      networkName: NETWORKS[networkSymbol].name,
      blockTime: getBlockTime(networkSymbol),
      estimatedBlocks: estimateBlocksFromTimeframe(timeframeValue, networkSymbol),
      description: getBlockDescription(timeframeValue, networkSymbol)
    };
  });
  
  return estimations;
};

/**
 * Get the default timeframe value (1 hour)
 * @returns {number} Default timeframe value
 */
export const getDefaultTimeframe = () => {
  return 1; // 1 hour default
};

/**
 * Get timeframe option by value
 * @param {number} value - Timeframe value
 * @returns {Object|null} Timeframe option object
 */
export const getTimeframeOption = (value) => {
  return TIMEFRAME_OPTIONS.find(opt => opt.value === value) || null;
};

/**
 * Validate timeframe value
 * @param {number} value - Timeframe value to validate
 * @returns {boolean} Whether the value is valid
 */
export const isValidTimeframe = (value) => {
  return TIMEFRAME_OPTIONS.some(opt => opt.value === value);
};

/**
 * Get the closest valid timeframe value
 * @param {number} value - Input value
 * @returns {number} Closest valid timeframe value
 */
export const getClosestTimeframe = (value) => {
  if (isValidTimeframe(value)) {
    return value;
  }
  
  // Find the closest valid timeframe
  const sortedOptions = TIMEFRAME_OPTIONS.sort((a, b) => a.value - b.value);
  
  for (let i = 0; i < sortedOptions.length - 1; i++) {
    const current = sortedOptions[i];
    const next = sortedOptions[i + 1];
    
    if (value >= current.value && value <= next.value) {
      // Return the closer one
      const currentDiff = Math.abs(value - current.value);
      const nextDiff = Math.abs(value - next.value);
      return currentDiff <= nextDiff ? current.value : next.value;
    }
  }
  
  // If value is outside range, return the closest endpoint
  if (value < sortedOptions[0].value) {
    return sortedOptions[0].value;
  } else {
    return sortedOptions[sortedOptions.length - 1].value;
  }
};
