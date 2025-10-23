import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

/**
 * Centralized utility for safe reward handling across all bridge operations
 * Ensures consistency between expatriation, repatriation, and claim operations
 */

// Get the maximum safe reward value for a given token
export const getMaxSafeReward = (tokenSymbol = 'tokens', decimals = 18) => {
  const MAX_SAFE_INTEGER = new BigNumber(Number.MAX_SAFE_INTEGER);
  return MAX_SAFE_INTEGER.dividedBy(new BigNumber(10).pow(decimals)).toFixed(6);
};

// Safely convert ethers BigNumber to JavaScript number for int parameters (Expatriation)
export const safeBigNumberToInt = (ethersBigNumber, tokenSymbol = 'tokens', decimals = 18) => {
  // Convert ethers BigNumber to bignumber.js for safe operations
  const bn = new BigNumber(ethersBigNumber.toString());
  
  // Check if the number exceeds JavaScript's MAX_SAFE_INTEGER
  const MAX_SAFE_INTEGER = new BigNumber(Number.MAX_SAFE_INTEGER);
  
  if (bn.gt(MAX_SAFE_INTEGER)) {
    // Instead of throwing an error, cap to the maximum safe value
    console.warn(
      `⚠️ Reward amount ${ethers.utils.formatUnits(ethersBigNumber, decimals)} ${tokenSymbol} exceeds safe limit. ` +
      `Capping to maximum safe value: ${MAX_SAFE_INTEGER.dividedBy(new BigNumber(10).pow(decimals))} ${tokenSymbol}`
    );
    return MAX_SAFE_INTEGER.toNumber();
  }
  
  // Convert to JavaScript number
  return bn.toNumber();
};

// Safely convert ethers BigNumber to ethers BigNumber for uint parameters (Repatriation)
// This ensures the reward can still be claimed later using safeBigNumberToInt
export const safeBigNumberToUint = (ethersBigNumber, tokenSymbol = 'tokens', decimals = 18) => {
  // Convert ethers BigNumber to bignumber.js for safe operations
  const bn = new BigNumber(ethersBigNumber.toString());
  
  // Check if the number exceeds JavaScript's MAX_SAFE_INTEGER
  const MAX_SAFE_INTEGER = new BigNumber(Number.MAX_SAFE_INTEGER);
  
  if (bn.gt(MAX_SAFE_INTEGER)) {
    // Cap to the maximum safe value and convert back to ethers BigNumber
    console.warn(
      `⚠️ Reward amount ${ethers.utils.formatUnits(ethersBigNumber, decimals)} ${tokenSymbol} exceeds safe limit. ` +
      `Capping to maximum safe value: ${MAX_SAFE_INTEGER.dividedBy(new BigNumber(10).pow(decimals))} ${tokenSymbol}`
    );
    return ethers.BigNumber.from(MAX_SAFE_INTEGER.toString());
  }
  
  // Return the original ethers BigNumber (it's already safe)
  return ethersBigNumber;
};

// Check if a reward amount exceeds the safe limit
export const isRewardExceedingSafeLimit = (ethersBigNumber, decimals = 18) => {
  const bn = new BigNumber(ethersBigNumber.toString());
  const MAX_SAFE_INTEGER = new BigNumber(Number.MAX_SAFE_INTEGER);
  return bn.gt(MAX_SAFE_INTEGER);
};

// Format reward for display (handles both int and uint cases)
export const formatRewardForDisplay = (rewardValue, decimals = 18, isInt = false) => {
  if (isInt && typeof rewardValue === 'number') {
    // For int values (JavaScript numbers), use direct division
    return (rewardValue / Math.pow(10, decimals)).toFixed(6);
  } else {
    // For uint values (ethers BigNumber), use ethers formatting
    return ethers.utils.formatUnits(rewardValue, decimals);
  }
};

// Parse and validate reward input with automatic capping
export const parseAndValidateReward = (rewardInput, decimals = 18, tokenSymbol = 'tokens', isInt = false) => {
  const rewardBigNumber = ethers.utils.parseUnits(rewardInput, decimals);
  const maxSafeReward = getMaxSafeReward(tokenSymbol, decimals);
  const originalRewardFormatted = ethers.utils.formatUnits(rewardBigNumber, decimals);
  const wasCapped = parseFloat(originalRewardFormatted) > parseFloat(maxSafeReward);
  
  let processedReward;
  if (isInt) {
    processedReward = safeBigNumberToInt(rewardBigNumber, tokenSymbol, decimals);
  } else {
    processedReward = safeBigNumberToUint(rewardBigNumber, tokenSymbol, decimals);
  }
  
  return {
    reward: processedReward,
    wasCapped,
    originalValue: originalRewardFormatted,
    maxSafeValue: maxSafeReward,
    displayValue: formatRewardForDisplay(processedReward, decimals, isInt)
  };
};
