import { ethers } from 'ethers';
import { IP3D_ABI, IPRECOMPILE_ERC20_ABI, IERC20_BASE_ABI, IERC20_WITH_SYMBOL_ABI } from '../contracts/abi';
import { ADDRESS_ZERO, NETWORKS } from '../config/networks';
import { 
  is3DPassPrecompile as is3DPassPrecompileFromThreedpass,
  isP3DPrecompile as isP3DPrecompileFromThreedpass,
  getAssetIdFromPrecompile as getAssetIdFromPrecompileFromThreedpass
} from './threedpass';

/**
 * Detect if a token address is a 3DPass precompile
 * Uses threedpass.js as source of truth
 * @param {string} address - Token address
 * @param {Object} settings - Optional settings for custom token lookup
 * @returns {boolean} True if it's a 3DPass precompile
 */
export const is3DPassPrecompile = (address, settings = null) => {
  return is3DPassPrecompileFromThreedpass(address, settings);
};

/**
 * Detect if a token address is specifically the P3D precompile
 * Uses threedpass.js as source of truth
 * @param {string} address - Token address
 * @returns {boolean} True if it's the P3D precompile
 */
export const isP3DPrecompile = (address) => {
  return isP3DPrecompileFromThreedpass(address);
};

/**
 * Detect if a token address is a native token
 * @param {string} address - Token address
 * @param {string} networkSymbol - Network symbol
 * @returns {boolean} True if it's a native token
 */
export const isNativeToken = (address, networkSymbol) => {
  if (!address) return false;
  
  // Zero address is native for most chains
  if (address.toLowerCase() === ADDRESS_ZERO.toLowerCase()) {
    return true;
  }
  
  // P3D precompile is native for 3DPass
  if (networkSymbol === 'THREEDPASS' && isP3DPrecompile(address)) {
    return true;
  }
  
  return false;
};

/**
 * Get the appropriate ABI for a token based on its address
 * Uses threedpass.js for 3DPass tokens
 * @param {string} address - Token address
 * @returns {Array} Contract ABI
 */
export const getTokenABI = (address) => {
  if (isP3DPrecompile(address)) {
    return IP3D_ABI;
  }
  if (is3DPassPrecompile(address)) {
    return IPRECOMPILE_ERC20_ABI;
  }
  return IERC20_WITH_SYMBOL_ABI; // Use the one with name/symbol functions
};

/**
 * Fetch token information from the blockchain
 * Uses threedpass.js for 3DPass precompile detection
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} address - Token address
 * @param {string} networkSymbol - Network symbol (e.g., 'THREEDPASS', 'ETHEREUM')
 * @param {Object} settings - Optional settings for custom token lookup
 * @returns {Promise<Object>} Token information object
 */
export const fetchTokenInfo = async (provider, address, networkSymbol, settings = null) => {
  try {
    if (!provider || !address) {
      throw new Error('Provider and address are required');
    }

    // Validate address format before proceeding
    if (!ethers.utils.isAddress(address)) {
      throw new Error(`Invalid address format: ${address}`);
    }

    const abi = getTokenABI(address);
    const contract = new ethers.Contract(address, abi, provider);

    // Fetch basic token information
    let name, symbol, decimals;
    
    try {
      [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals()
      ]);
    } catch (error) {
      // If name/symbol functions fail, try with basic ERC20 ABI
      console.warn('Name/symbol functions failed, trying basic ERC20:', error);
      const basicContract = new ethers.Contract(address, IERC20_BASE_ABI, provider);
      decimals = await basicContract.decimals();
      name = `Token ${address.slice(0, 8)}...`;
      symbol = `TKN${address.slice(2, 6)}`;
    }

    // Determine token type and standard
    let isPrecompile = false;
    let isNative = false;
    let standard = 'ERC20';
    let assetId = null;

    // Only apply precompile detection for networks that support it
    if (NETWORKS[networkSymbol]?.erc20Precompile) {
      if (networkSymbol === 'THREEDPASS') {
        if (isP3DPrecompile(address)) {
          isPrecompile = true;
          isNative = true;
          standard = 'Native';
        } else if (is3DPassPrecompile(address, settings)) {
          isPrecompile = true;
          standard = 'ERC20';
          // For 3DPass precompiles, use threedpass.js to get asset ID (checks config first)
          assetId = getAssetIdFromPrecompileFromThreedpass(address, settings);
          
          // Fallback: if config doesn't have asset ID, try to extract from address hex
          if (!assetId && address.toLowerCase().startsWith('0xfbfbfbfa')) {
            try {
              const assetIdHex = address.slice(10); // Remove "0xfBFBfbFA" (10 chars)
              assetId = parseInt(assetIdHex, 16);
            } catch (error) {
              console.warn('Could not extract asset ID from precompile address:', error);
            }
          }
        }
      } else {
        // For other networks with precompile support, check if it's a native token (zero address)
        isNative = isNativeToken(address, networkSymbol);
        if (isNative) {
          standard = 'Native';
        }
      }
    } else {
      // For networks without precompile support, only check for native tokens
      isNative = isNativeToken(address, networkSymbol);
      if (isNative) {
        standard = 'Native';
      }
    }

    return {
      address,
      name,
      symbol,
      decimals: decimals.toString(),
      standard,
      isPrecompile,
      isNative,
      ...(NETWORKS[networkSymbol]?.erc20Precompile && { assetId: assetId ? assetId.toString() : null }),
      isTestToken: false, // Default to false, user can change if needed
    };
  } catch (error) {
    console.error('Error fetching token info:', error);
    throw new Error(`Failed to fetch token information: ${error.message}`);
  }
};

/**
 * Validate token address format
 * @param {string} address - Token address
 * @returns {boolean} True if valid address format
 */
export const validateTokenAddress = (address) => {
  if (!address) return false;
  
  // Check if it's a valid Ethereum-style address
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return false;
  }
  
  return true;
};

/**
 * Get asset ID from 3DPass precompile address
 * Uses threedpass.js as source of truth (checks config first, falls back to hex extraction)
 * @param {string} address - Precompile address
 * @param {Object} settings - Optional settings for custom token lookup
 * @returns {number|null} Asset ID or null if not found
 */
export const getAssetIdFromPrecompile = (address, settings = null) => {
  // Use threedpass.js function first (checks config)
  let assetId = getAssetIdFromPrecompileFromThreedpass(address, settings);
  
  // Fallback: if config doesn't have it and it's a precompile, try to extract from hex
  if (!assetId && is3DPassPrecompile(address, settings) && !isP3DPrecompile(address)) {
    if (address.toLowerCase().startsWith('0xfbfbfbfa')) {
      try {
        const assetIdHex = address.slice(10); // Remove "0xfBFBfbFA" (10 chars)
        assetId = parseInt(assetIdHex, 16);
      } catch (error) {
        console.warn('Could not extract asset ID from precompile address:', error);
      }
    }
  }
  
  return assetId;
};

/**
 * Auto-detect token type and fetch information
 * Uses threedpass.js for 3DPass precompile detection
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} address - Token address
 * @param {string} networkSymbol - Network symbol
 * @param {Object} settings - Optional settings for custom token lookup
 * @returns {Promise<Object>} Auto-detected token configuration
 */
export const autoDetectToken = async (provider, address, networkSymbol, settings = null) => {
  try {
    // Validate address format
    if (!validateTokenAddress(address)) {
      throw new Error('Invalid token address format');
    }

    // Fetch token information from blockchain
    const tokenInfo = await fetchTokenInfo(provider, address, networkSymbol, settings);

    return {
      success: true,
      tokenInfo,
      message: `Successfully detected ${tokenInfo.symbol} token`
    };
  } catch (error) {
    console.error('Auto-detection failed:', error);
    return {
      success: false,
      tokenInfo: null,
      message: error.message
    };
  }
};
