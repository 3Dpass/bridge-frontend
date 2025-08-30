import { ethers } from 'ethers';
import { IP3D_ABI, IPRECOMPILE_ERC20_ABI, IERC20_BASE_ABI, IERC20_WITH_SYMBOL_ABI } from '../contracts/abi';
import { P3D_PRECOMPILE_ADDRESS, ADDRESS_ZERO, NETWORKS } from '../config/networks';

/**
 * Detect if a token address is a 3DPass precompile
 * @param {string} address - Token address
 * @returns {boolean} True if it's a 3DPass precompile
 */
export const is3DPassPrecompile = (address) => {
  if (!address) return false;
  
  // P3D precompile
  if (address.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return true;
  }
  
  // Other 3DPass ERC20 precompiles (start with 0xFBFBFBFA)
  return address.toLowerCase().startsWith('0xfbfbfbfa');
};

/**
 * Detect if a token address is specifically the P3D precompile
 * @param {string} address - Token address
 * @returns {boolean} True if it's the P3D precompile
 */
export const isP3DPrecompile = (address) => {
  return address && address.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
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
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} address - Token address
 * @param {string} networkSymbol - Network symbol (e.g., 'THREEDPASS', 'ETHEREUM')
 * @returns {Promise<Object>} Token information object
 */
export const fetchTokenInfo = async (provider, address, networkSymbol) => {
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
        } else if (is3DPassPrecompile(address)) {
          isPrecompile = true;
          standard = 'ERC20';
          // For 3DPass precompiles, we can try to extract asset ID from the address
          // The asset ID is encoded in all bytes after the 0xfBFBfbFA prefix
          // Format: 0xfBFBfbFA + [Asset ID in hex]
          try {
            // Extract all bytes after the 0xfBFBfbFA prefix (8 characters)
            const assetIdHex = address.slice(10); // Remove "0xfBFBfbFA" (10 chars)
            // Convert to decimal, handling leading zeros
            assetId = parseInt(assetIdHex, 16);
          } catch (error) {
            console.warn('Could not extract asset ID from precompile address:', error);
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
 * @param {string} address - Precompile address
 * @returns {number|null} Asset ID or null if not found
 */
export const getAssetIdFromPrecompile = (address) => {
  if (!is3DPassPrecompile(address) || isP3DPrecompile(address)) {
    return null;
  }
  
  try {
    // Extract all bytes after the 0xfBFBfbFA prefix
    // Format: 0xfBFBfbFA + [Asset ID in hex]
    const assetIdHex = address.slice(10); // Remove "0xfBFBfbFA" (10 chars)
    return parseInt(assetIdHex, 16);
  } catch (error) {
    console.warn('Could not extract asset ID from precompile address:', error);
    return null;
  }
};

/**
 * Auto-detect token type and fetch information
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} address - Token address
 * @param {string} networkSymbol - Network symbol
 * @returns {Promise<Object>} Auto-detected token configuration
 */
export const autoDetectToken = async (provider, address, networkSymbol) => {
  try {
    // Validate address format
    if (!validateTokenAddress(address)) {
      throw new Error('Invalid token address format');
    }

    // Fetch token information from blockchain
    const tokenInfo = await fetchTokenInfo(provider, address, networkSymbol);

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
