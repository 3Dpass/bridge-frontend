import { ethers } from 'ethers';
import { IP3D_ABI, IPRECOMPILE_ERC20_ABI } from '../contracts/abi';
import { P3D_PRECOMPILE_ADDRESS } from '../config/networks';
import { getNetworkTokens } from './token-helpers';

// 3DPass specific utility functions for ERC20 precompile interactions

/**
 * Get the appropriate ABI for a 3DPass token
 * @param {string} tokenAddress - Token address
 * @returns {Array} Contract ABI
 */
export const get3DPassTokenABI = (tokenAddress) => {
  if (tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return IP3D_ABI;
  }
  return IPRECOMPILE_ERC20_ABI;
};

/**
 * Get 3DPass tokens from network configuration
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Object} Object with token addresses as keys and token configs as values
 */
export const get3DPassTokens = (settings = null) => {
  // Use token-helpers to get tokens (includes both config and settings)
  return getNetworkTokens('THREEDPASS', settings);
};

/**
 * Get token config by address from network configuration
 * @param {string} tokenAddress - Token address
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Object|null} Token config or null if not found
 */
export const get3DPassTokenByAddress = (tokenAddress, settings = null) => {
  if (!tokenAddress) return null;
  
  const tokens = get3DPassTokens(settings);
  const address = tokenAddress.toLowerCase();
  
  // tokens is already an object from getNetworkTokens, with address-based or descriptive keys
  // Search by address match (works with any key format)
  for (const [, token] of Object.entries(tokens)) {
    if (token.address && token.address.toLowerCase() === address) {
      return token;
    }
  }
  
  return null;
};

/**
 * Get token config by symbol from network configuration
 * @param {string} symbol - Token symbol
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Object|null} Token config or null if not found
 */
export const get3DPassTokenBySymbol = (symbol, settings = null) => {
  if (!symbol) return null;
  
  const tokens = get3DPassTokens(settings);
  // Search by symbol (works with any key format)
  for (const [, token] of Object.entries(tokens)) {
    if (token.symbol && token.symbol.toUpperCase() === symbol.toUpperCase()) {
      return token;
    }
  }
  
  return null;
};

/**
 * Get token metadata from 3DPass ERC20 precompile
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Promise<Object>} Token metadata
 */
export const get3DPassTokenMetadata = async (provider, tokenAddress, settings = null) => {
  try {
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    
    // Get token config from network configuration
    const tokenConfig = get3DPassTokenByAddress(tokenAddress, settings);
    
    let decimals;
    if (tokenConfig) {
      decimals = tokenConfig.decimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for metadata, using default:', error);
        decimals = 18; // fallback
      }
    }
    
    const [name, symbol, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.totalSupply()
    ]);

    return {
      name,
      symbol,
      decimals,
      totalSupply: ethers.utils.formatUnits(totalSupply, decimals),
      address: tokenAddress,
      isPrecompile: true,
      isNative: tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase(),
      assetId: tokenConfig ? tokenConfig.assetId : null
    };
  } catch (error) {
    console.error('Error getting 3DPass token metadata:', error);
    throw new Error(`Failed to get token metadata for ${tokenAddress}: ${error.message}`);
  }
};

/**
 * Get balance for any 3DPass token (including P3D)
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} account - Account address
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Promise<string>} Formatted balance
 */
export const get3DPassTokenBalance = async (provider, tokenAddress, account, settings = null) => {
  try {
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    const balance = await contract.balanceOf(account);
    
    // Get decimals from network configuration
    const tokenConfig = get3DPassTokenByAddress(tokenAddress, settings);
    let decimals;
    
    if (tokenConfig) {
      decimals = tokenConfig.decimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile, using default:', error);
        decimals = 18; // fallback
      }
    }
    
    return ethers.utils.formatUnits(balance, decimals);
  } catch (error) {
    console.error('Error getting 3DPass token balance:', error);
    return '0';
  }
};

/**
 * Transfer 3DPass tokens using ERC20 precompile
 * @param {ethers.Signer} signer - Web3 signer
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} to - Recipient address
 * @param {string} amount - Amount to transfer
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const transfer3DPassToken = async (signer, tokenAddress, to, amount, settings = null) => {
  try {
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, signer);
    
    // Get decimals from network configuration
    const tokenConfig = get3DPassTokenByAddress(tokenAddress, settings);
    let decimals;
    
    if (tokenConfig) {
      decimals = tokenConfig.decimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for transfer, using default:', error);
        decimals = 18; // fallback
      }
    }
    
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    
    const tx = await contract.transfer(to, amountWei);
    return await tx.wait();
  } catch (error) {
    console.error('Error transferring 3DPass token:', error);
    throw new Error(`Failed to transfer token: ${error.message}`);
  }
};

/**
 * Approve 3DPass tokens for spending
 * @param {ethers.Signer} signer - Web3 signer
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} spender - Spender address
 * @param {string} amount - Amount to approve
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const approve3DPassToken = async (signer, tokenAddress, spender, amount, settings = null) => {
  try {
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, signer);
    
    // Get decimals from network configuration
    const tokenConfig = get3DPassTokenByAddress(tokenAddress, settings);
    let decimals;
    
    if (tokenConfig) {
      decimals = tokenConfig.decimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for approve, using default:', error);
        decimals = 18; // fallback
      }
    }
    
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    
    const tx = await contract.approve(spender, amountWei);
    return await tx.wait();
  } catch (error) {
    console.error('Error approving 3DPass token:', error);
    throw new Error(`Failed to approve token: ${error.message}`);
  }
};

/**
 * Get allowance for 3DPass tokens
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} owner - Owner address
 * @param {string} spender - Spender address
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Promise<string>} Formatted allowance
 */
export const get3DPassTokenAllowance = async (provider, tokenAddress, owner, spender, settings = null) => {
  try {
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    const allowance = await contract.allowance(owner, spender);
    
    // Get decimals from network configuration
    const tokenConfig = get3DPassTokenByAddress(tokenAddress, settings);
    let decimals;
    
    if (tokenConfig) {
      decimals = tokenConfig.decimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for allowance, using default:', error);
        decimals = 18; // fallback
      }
    }
    
    return ethers.utils.formatUnits(allowance, decimals);
  } catch (error) {
    console.error('Error getting 3DPass token allowance:', error);
    return '0';
  }
};

/**
 * Check if address is a valid 3DPass ERC20 precompile
 * @param {string} address - Address to check
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {boolean} True if valid precompile
 */
export const is3DPassPrecompile = (address, settings = null) => {
  if (!address) return false;
  
  // P3D precompile
  if (address.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return true;
  }
  
  // Check if it's a known token from configuration
  const tokenConfig = get3DPassTokenByAddress(address, settings);
  if (tokenConfig) {
    return true;
  }
  
  // Other 3DPass ERC20 precompiles (start with 0xFBFBFBFA)
  return address.toLowerCase().startsWith('0xfbfbfbfa');
};

/**
 * Check if address is specifically the P3D precompile
 * @param {string} address - Address to check
 * @returns {boolean} True if P3D precompile
 */
export const isP3DPrecompile = (address) => {
  return address && address.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
};

/**
 * Get asset ID from precompile address (for substrate interactions)
 * @param {string} address - Precompile address
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {number|null} Asset ID or null if not found
 */
export const getAssetIdFromPrecompile = (address, settings = null) => {
  if (!address) return null;
  
  // Check if it's P3D
  if (address.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return null; // P3D (native, no asset ID)
  }
  
  // Get token config from network configuration
  const tokenConfig = get3DPassTokenByAddress(address, settings);
  return tokenConfig ? tokenConfig.assetId : null;
};

/**
 * Get precompile address from asset ID
 * @param {number} assetId - Asset ID
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {string|null} Precompile address or null if not found
 */
export const getPrecompileFromAssetId = (assetId, settings = null) => {
  if (!assetId) return null;
  
  const tokens = get3DPassTokens(settings);
  
  // Find token by asset ID
  for (const [, token] of Object.entries(tokens)) {
    if (token.assetId === assetId) {
      return token.address;
    }
  }
  
  return null;
};

/**
 * Validate 3DPass transaction parameters
 * @param {Object} params - Transaction parameters
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Object} Validation result
 */
export const validate3DPassTransaction = (params, settings = null) => {
  const { tokenAddress, amount, to } = params;
  const errors = [];

  if (!is3DPassPrecompile(tokenAddress, settings)) {
    errors.push('Invalid 3DPass precompile address');
  }

  if (!ethers.utils.isAddress(to)) {
    errors.push('Invalid recipient address');
  }

  if (!amount || parseFloat(amount) <= 0) {
    errors.push('Invalid amount');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get P3D precompile metadata using IP3D interface
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Promise<Object>} P3D token metadata
 */
export const getP3DPrecompileMetadata = async (provider, settings = null) => {
  try {
    const contract = new ethers.Contract(P3D_PRECOMPILE_ADDRESS, IP3D_ABI, provider);
    
    // Get P3D config from network configuration
    const p3dConfig = get3DPassTokenByAddress(P3D_PRECOMPILE_ADDRESS, settings);
    const decimals = p3dConfig ? p3dConfig.decimals : 18;
    
    const [name, symbol, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.totalSupply()
    ]);

    return {
      name,
      symbol,
      decimals,
      totalSupply: ethers.utils.formatUnits(totalSupply, decimals),
      address: P3D_PRECOMPILE_ADDRESS,
      isPrecompile: true,
      isNative: true,
      assetId: null // P3D is native, no asset ID
    };
  } catch (error) {
    console.error('Error getting P3D precompile metadata:', error);
    throw new Error(`Failed to get P3D metadata: ${error.message}`);
  }
};

/**
 * Get all available 3DPass tokens with metadata
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Promise<Array>} Array of token objects with metadata
 */
export const getAll3DPassTokens = async (provider, settings = null) => {
  const tokens = get3DPassTokens(settings);
  const tokenList = [];
  
  for (const [, tokenConfig] of Object.entries(tokens)) {
    try {
      const metadata = await get3DPassTokenMetadata(provider, tokenConfig.address, settings);
      tokenList.push(metadata);
    } catch (error) {
      console.warn(`Failed to get metadata for ${tokenConfig.address}:`, error.message);
    }
  }

  return tokenList;
};

/**
 * Get P3D precompile address constant
 * @returns {string} P3D precompile address
 */
export const getP3DPrecompileAddress = () => {
  return P3D_PRECOMPILE_ADDRESS;
};

/**
 * Check if a token is a 3DPass native token (P3D)
 * @param {string} tokenAddress - Token address
 * @returns {boolean} True if native token
 */
export const is3DPassNativeToken = (tokenAddress) => {
  return tokenAddress && tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
};

/**
 * Get token symbol from precompile address
 * @param {string} address - Precompile address
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {string|null} Token symbol or null if not found
 */
export const getTokenSymbolFromPrecompile = (address, settings = null) => {
  if (!address) return null;
  
  // Get token config from network configuration
  const tokenConfig = get3DPassTokenByAddress(address, settings);
  return tokenConfig ? tokenConfig.symbol : null;
};

/**
 * Get token decimals from network configuration
 * @param {string} tokenAddress - Token address
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {number|null} Token decimals or null if not found
 */
export const getTokenDecimalsFromConfig = (tokenAddress, settings = null) => {
  if (!tokenAddress) return null;
  
  const tokenConfig = get3DPassTokenByAddress(tokenAddress, settings);
  return tokenConfig ? tokenConfig.decimals : null;
};

/**
 * Get all 3DPass token addresses
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Array} Array of token addresses
 */
export const getAll3DPassTokenAddresses = (settings = null) => {
  const tokens = get3DPassTokens(settings);
  return Object.values(tokens).map(token => token.address);
};

/**
 * Get all 3DPass token symbols
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {Array} Array of token symbols
 */
export const getAll3DPassTokenSymbols = (settings = null) => {
  const tokens = get3DPassTokens(settings);
  // Return actual token symbols, not keys
  return Object.values(tokens)
    .map(token => token.symbol)
    .filter(symbol => symbol); // Filter out null/undefined
};

/**
 * Check if a token symbol exists in 3DPass configuration
 * @param {string} symbol - Token symbol
 * @param {Object} settings - Settings context (optional, for custom tokens)
 * @returns {boolean} True if token exists
 */
export const is3DPassTokenSymbol = (symbol, settings = null) => {
  if (!symbol) return false;
  
  const tokens = get3DPassTokens(settings);
  return symbol in tokens;
}; 