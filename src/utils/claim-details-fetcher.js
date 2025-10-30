/**
 * Centralized Claim Details Fetcher
 * 
 * Robust utility for fetching claim details from bridge contracts.
 * Handles edge cases, provider fallbacks, and data normalization.
 */

import { ethers } from 'ethers';
import { getBridgeABI, getCounterstakeABI, createContract } from './contract-factory.js';
import { normalizeAmount } from './data-normalizer.js';

/**
 * Get the appropriate ABI for a bridge type (with fallback to COUNTERSTAKE_ABI)
 * @param {string} bridgeType - Bridge type ('Export', 'Import', 'export', 'import', 'import_wrapper', etc.)
 * @returns {Array} ABI array
 */
function getABIForBridgeType(bridgeType) {
  if (!bridgeType) {
    return getCounterstakeABI();
  }
  
  const typeLower = bridgeType.toLowerCase();
  // Handle import_wrapper type
  if (typeLower === 'import_wrapper') {
    try {
      return getBridgeABI('import_wrapper');
    } catch {
      return getCounterstakeABI();
    }
  }
  
  try {
    return getBridgeABI(typeLower);
  } catch {
    return getCounterstakeABI();
  }
}

/**
 * Fetch claim details from a bridge contract
 * 
 * @param {Object} params - Parameters object
 * @param {ethers.Contract} [params.contract] - Contract instance (if provided, other params optional)
 * @param {ethers.providers.Provider} [params.provider] - Provider instance (required if contract not provided)
 * @param {string} [params.contractAddress] - Contract address (required if contract not provided)
 * @param {string} [params.bridgeType] - Bridge type for ABI selection (optional)
 * @param {Array} [params.abi] - Custom ABI (optional, will use bridgeType if not provided)
 * @param {number|string|ethers.BigNumber} params.claimNum - Claim number to fetch
 * @param {string} [params.rpcUrl] - Optional RPC URL for creating a direct provider (for fallback)
 * @param {boolean} [params.useDirectProvider=false] - Force use of direct provider from rpcUrl
 * @returns {Promise<Object|null>} Claim details object or null if claim doesn't exist
 */
export async function fetchClaimDetails({
  contract,
  provider,
  contractAddress,
  bridgeType,
  abi,
  claimNum,
  rpcUrl,
  useDirectProvider = false
}) {
  try {
    // Validate claimNum
    if (claimNum === null || claimNum === undefined) {
      throw new Error('Claim number is required');
    }
    
    // Convert claimNum to BigNumber if needed
    const claimNumBigNumber = ethers.BigNumber.isBigNumber(claimNum) 
      ? claimNum 
      : ethers.BigNumber.from(claimNum);
    
    // Determine provider and contract
    let contractInstance = contract;
    let providerInstance = provider;
    
    if (!contractInstance) {
      if (!providerInstance && !rpcUrl) {
        throw new Error('Either contract, provider, or rpcUrl must be provided');
      }
      
      // Create provider if needed
      if (!providerInstance && rpcUrl) {
        providerInstance = new ethers.providers.JsonRpcProvider(rpcUrl);
      }
      
      // Determine ABI
      const contractABI = abi || getABIForBridgeType(bridgeType);
      
      // Create contract instance
      if (!contractAddress) {
        throw new Error('Contract address is required when contract instance is not provided');
      }
      
      contractInstance = createContract(contractAddress, contractABI, providerInstance);
    } else {
      providerInstance = contractInstance.provider || providerInstance;
    }
    
    // Use direct provider if requested (for fallback scenarios)
    if (useDirectProvider && rpcUrl && contractInstance.address) {
      const directProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const contractABI = abi || getABIForBridgeType(bridgeType) || getCounterstakeABI();
      contractInstance = createContract(contractInstance.address, contractABI, directProvider);
      providerInstance = directProvider;
    }
    
    console.log('🔍 fetchClaimDetails: Fetching claim', claimNumBigNumber.toString(), 'from contract:', contractInstance.address);
    
    // Encode function call
    const encodedData = contractInstance.interface.encodeFunctionData('getClaim(uint256)', [claimNumBigNumber]);
    
    // Make the call
    const result = await providerInstance.call({
      to: contractInstance.address,
      data: encodedData
    });
    
    // Check if result is empty (claim doesn't exist)
    if (!result || result === '0x') {
      console.log('🔍 fetchClaimDetails: Claim', claimNumBigNumber.toString(), 'does not exist (empty result)');
      return null;
    }
    
    // Decode the result
    const decodedResult = contractInstance.interface.decodeFunctionResult('getClaim(uint256)', result);
    
    if (!decodedResult || decodedResult.length === 0) {
      console.log('🔍 fetchClaimDetails: Claim', claimNumBigNumber.toString(), 'does not exist (no decoded result)');
      return null;
    }
    
    // Extract claim data (getClaim returns a tuple)
    const claimData = decodedResult[0];
    
    console.log('🔍 fetchClaimDetails: Successfully fetched claim', claimNumBigNumber.toString());
    
    // Return normalized claim data
    return claimData;
    
  } catch (error) {
    console.log('🔍 fetchClaimDetails: Error fetching claim', claimNum, ':', error.message);
    
    // Handle revert errors (claim doesn't exist)
    if (error.message && (
      error.message.includes('call revert exception') ||
      error.message.includes('execution reverted') ||
      error.message.includes('invalid opcode')
    )) {
      // Check if error.data contains valid claim data (some providers return data in error.data)
      if (error.data && error.data !== '0x' && contract) {
        try {
          const decodedResult = contract.interface.decodeFunctionResult('getClaim(uint256)', error.data);
          if (decodedResult && decodedResult.length > 0) {
            console.log('🔍 fetchClaimDetails: Successfully decoded claim from error.data');
            return decodedResult[0];
          }
        } catch (decodeError) {
          // Failed to decode error.data, claim likely doesn't exist
        }
      }
      
      console.log('🔍 fetchClaimDetails: Claim', claimNum, 'does not exist (revert)');
      return null;
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Fetch claim details with normalized amounts
 * Wraps fetchClaimDetails and normalizes amount, reward, and stake fields
 * 
 * @param {Object} params - Same parameters as fetchClaimDetails
 * @returns {Promise<Object|null>} Claim details with normalized amounts or null
 */
export async function fetchClaimDetailsNormalized(params) {
  const claimData = await fetchClaimDetails(params);
  
  if (!claimData) {
    return null;
  }
  
  // Normalize amount fields
  return {
    ...claimData,
    amount: normalizeAmount(claimData.amount),
    reward: claimData.reward ? normalizeAmount(claimData.reward) : null,
    yes_stake: normalizeAmount(claimData.yes_stake),
    no_stake: normalizeAmount(claimData.no_stake)
  };
}

/**
 * Fetch multiple claims efficiently
 * 
 * @param {Object} params - Parameters object
 * @param {ethers.Contract} [params.contract] - Contract instance
 * @param {ethers.providers.Provider} [params.provider] - Provider instance
 * @param {string} [params.contractAddress] - Contract address
 * @param {string} [params.bridgeType] - Bridge type
 * @param {number[]} params.claimNums - Array of claim numbers to fetch
 * @param {boolean} [params.normalize=false] - Whether to normalize amounts
 * @returns {Promise<Array>} Array of claim details (null for non-existent claims)
 */
export async function fetchMultipleClaimDetails({
  contract,
  provider,
  contractAddress,
  bridgeType,
  claimNums,
  normalize = false
}) {
  if (!Array.isArray(claimNums) || claimNums.length === 0) {
    return [];
  }
  
  const fetchFn = normalize ? fetchClaimDetailsNormalized : fetchClaimDetails;
  
  // Fetch all claims (can be parallelized if needed)
  const results = await Promise.all(
    claimNums.map(claimNum => 
      fetchFn({
        contract,
        provider,
        contractAddress,
        bridgeType,
        claimNum
      }).catch(error => {
        console.error(`Error fetching claim ${claimNum}:`, error.message);
        return null;
      })
    )
  );
  
  return results;
}

