/**
 * Token Helper Functions
 * 
 * Provides consistent token lookup methods that work with address-based keys.
 * This allows duplicate symbols while maintaining unique keys.
 */

import { NETWORKS, P3D_PRECOMPILE_ADDRESS, ADDRESS_ZERO } from '../config/networks';

/**
 * Get all tokens for a network (with optional settings override)
 * @param {string} networkKey - Network key (e.g., 'ETHEREUM', 'BSC', 'THREEDPASS')
 * @param {Object} settings - Optional settings object for custom tokens
 * @returns {Object} Object with address keys and token configs as values
 * 
 * Note: This function maintains backward compatibility with symbol-based keys
 * but will prioritize address-based keys when searching.
 */
export const getNetworkTokens = (networkKey, settings = null) => {
  const network = NETWORKS[networkKey];
  if (!network) {
    return {};
  }

  // Start with base tokens from network config
  let tokens = {};
  if (network.tokens) {
    tokens = { ...network.tokens };
  }

  // Also include nativeCurrency as a token if it exists
  if (network.nativeCurrency) {
    const nativeAddress = network.nativeCurrency.symbol === 'P3D' 
      ? P3D_PRECOMPILE_ADDRESS
      : ADDRESS_ZERO;
    
    const nativeKey = nativeAddress.toLowerCase();
    if (!tokens[nativeKey]) {
      // Don't override if already exists, but add if missing
      tokens[nativeKey] = {
        address: nativeAddress,
        symbol: network.nativeCurrency.symbol,
        name: network.nativeCurrency.name,
        decimals: network.nativeCurrency.decimals,
        isNative: true,
        ...network.nativeCurrency // Include any additional properties
      };
    }
  }

  // Merge custom tokens from settings if provided
  if (settings && settings[networkKey] && settings[networkKey].tokens) {
    tokens = {
      ...tokens,
      ...settings[networkKey].tokens
    };
  }

  return tokens;
};

/**
 * Get token by address (primary lookup method)
 * @param {string} networkKey - Network key
 * @param {string} address - Token address
 * @param {Object} settings - Optional settings object
 * @returns {Object|null} Token configuration or null if not found
 * 
 * Special handling for native tokens (ADDRESS_ZERO or P3D_PRECOMPILE_ADDRESS):
 * - Looks up by the network's nativeCurrency.symbol instead of address
 * - This ensures we find the correct token key (e.g., "ETH", "BNB", "P3D")
 * 
 * For other tokens, searches by matching the token's address property.
 */
export const getTokenByAddress = (networkKey, address, settings = null) => {
  if (!address) return null;

  const normalizedAddress = address.toLowerCase();
  const network = NETWORKS[networkKey];
  
  // Special case: Native tokens have constant addresses
  // ADDRESS_ZERO for most networks (ETH, BNB, etc.)
  // P3D_PRECOMPILE_ADDRESS for 3DPass network
  if (normalizedAddress === ADDRESS_ZERO.toLowerCase() || 
      normalizedAddress === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    // Look up by native currency symbol instead
    if (network && network.nativeCurrency) {
      const nativeSymbol = network.nativeCurrency.symbol;
      const tokens = getNetworkTokens(networkKey, settings);
      
      // Try to find token with matching symbol (could be keyed by symbol or descriptive key)
      for (const [, tokenConfig] of Object.entries(tokens)) {
        if (tokenConfig.symbol === nativeSymbol && 
            tokenConfig.isNative &&
            (tokenConfig.address.toLowerCase() === normalizedAddress)) {
          return tokenConfig;
        }
      }
    }
  }

  const tokens = getNetworkTokens(networkKey, settings);

  // First, try direct key lookup if address is used as key (address-based keys)
  const token = tokens[normalizedAddress] || tokens[address];
  if (token && token.address && token.address.toLowerCase() === normalizedAddress) {
    return token;
  }

  // Search by address match (works with any key format: address-based, descriptive, or symbol-based)
  for (const [, tokenConfig] of Object.entries(tokens)) {
    if (tokenConfig.address && tokenConfig.address.toLowerCase() === normalizedAddress) {
      return tokenConfig;
    }
  }

  return null;
};

/**
 * Get token(s) by symbol (can return multiple if symbols are duplicated)
 * @param {string} networkKey - Network key
 * @param {string} symbol - Token symbol
 * @param {Object} settings - Optional settings object
 * @returns {Array} Array of token configurations matching the symbol
 */
export const getTokensBySymbol = (networkKey, symbol, settings = null) => {
  if (!symbol) return [];

  const tokens = getNetworkTokens(networkKey, settings);
  const normalizedSymbol = symbol.toUpperCase();

  return Object.values(tokens).filter(token => 
    token.symbol && token.symbol.toUpperCase() === normalizedSymbol
  );
};

/**
 * Get first token by symbol (backward compatibility)
 * @param {string} networkKey - Network key
 * @param {string} symbol - Token symbol
 * @param {Object} settings - Optional settings object
 * @returns {Object|null} First token configuration matching the symbol or null
 */
export const getTokenBySymbol = (networkKey, symbol, settings = null) => {
  const tokens = getTokensBySymbol(networkKey, symbol, settings);
  return tokens.length > 0 ? tokens[0] : null;
};

/**
 * Get token by key (direct key access - for backward compatibility)
 * @param {string} networkKey - Network key
 * @param {string} key - Token key (address or legacy symbol key)
 * @param {Object} settings - Optional settings object
 * @returns {Object|null} Token configuration or null if not found
 */
export const getTokenByKey = (networkKey, key, settings = null) => {
  if (!key) return null;

  const tokens = getNetworkTokens(networkKey, settings);
  
  // Try direct key lookup
  if (tokens[key]) {
    return tokens[key];
  }

  // Try lowercase key (for address-based keys)
  const lowerKey = key.toLowerCase();
  if (tokens[lowerKey]) {
    return tokens[lowerKey];
  }

  return null;
};

/**
 * Generate a unique token key from address
 * Normalizes address to lowercase for consistent keys
 * @param {string} address - Token address
 * @returns {string} Normalized address key
 */
export const generateTokenKey = (address) => {
  if (!address) {
    throw new Error('Address is required to generate token key');
  }
  
  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  // Return lowercase address as key
  return address.toLowerCase();
};

/**
 * Check if a token exists in network
 * @param {string} networkKey - Network key
 * @param {string} address - Token address
 * @param {Object} settings - Optional settings object
 * @returns {boolean} True if token exists
 */
export const hasToken = (networkKey, address, settings = null) => {
  return getTokenByAddress(networkKey, address, settings) !== null;
};

/**
 * Get all token addresses for a network
 * @param {string} networkKey - Network key
 * @param {Object} settings - Optional settings object
 * @returns {Array} Array of token addresses
 */
export const getTokenAddresses = (networkKey, settings = null) => {
  const tokens = getNetworkTokens(networkKey, settings);
  return Object.values(tokens)
    .map(token => token.address)
    .filter(address => address); // Filter out null/undefined
};

/**
 * Get all token symbols for a network (may include duplicates)
 * @param {string} networkKey - Network key
 * @param {Object} settings - Optional settings object
 * @returns {Array} Array of token symbols
 */
export const getTokenSymbols = (networkKey, settings = null) => {
  const tokens = getNetworkTokens(networkKey, settings);
  return Object.values(tokens)
    .map(token => token.symbol)
    .filter(symbol => symbol); // Filter out null/undefined
};

/**
 * Find token key by address (helps with migration and CRUD operations)
 * @param {string} networkKey - Network key
 * @param {string} address - Token address
 * @param {Object} settings - Optional settings object
 * @returns {string|null} Token key or null if not found
 * 
 * Special handling for native tokens (ADDRESS_ZERO or P3D_PRECOMPILE_ADDRESS):
 * - Looks up by the network's nativeCurrency.symbol to find the actual key
 * - This ensures we return the config key (e.g., "ETH", "BNB", "P3D") not the address
 * 
 * Returns the actual key used in the tokens object, regardless of key format.
 * Useful for updating or removing tokens when you only know the address.
 */
export const findTokenKeyByAddress = (networkKey, address, settings = null) => {
  if (!address) return null;

  const normalizedAddress = address.toLowerCase();
  const network = NETWORKS[networkKey];
  
  // Special case: Native tokens have constant addresses
  // ADDRESS_ZERO for most networks (ETH, BNB, etc.)
  // P3D_PRECOMPILE_ADDRESS for 3DPass network
  if (normalizedAddress === ADDRESS_ZERO.toLowerCase() || 
      normalizedAddress === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    // Look up by native currency symbol to find the actual key in config
    if (network && network.nativeCurrency) {
      const nativeSymbol = network.nativeCurrency.symbol;
      const tokens = getNetworkTokens(networkKey, settings);
      
      // Search for token with matching symbol and native address
      // Return the actual key from config (could be "ETH", "BNB", "P3D", etc.)
      for (const [key, tokenConfig] of Object.entries(tokens)) {
        if (tokenConfig.symbol === nativeSymbol && 
            tokenConfig.isNative &&
            (tokenConfig.address.toLowerCase() === normalizedAddress)) {
          return key;
        }
      }
    }
  }

  const tokens = getNetworkTokens(networkKey, settings);

  // Check if address is already a key (address-based keys)
  if (tokens[normalizedAddress] && tokens[normalizedAddress].address && 
      tokens[normalizedAddress].address.toLowerCase() === normalizedAddress) {
    return normalizedAddress;
  }
  if (tokens[address] && tokens[address].address && 
      tokens[address].address.toLowerCase() === normalizedAddress) {
    return address;
  }

  // Search for token with matching address (works with any key format)
  for (const [key, tokenConfig] of Object.entries(tokens)) {
    if (tokenConfig.address && tokenConfig.address.toLowerCase() === normalizedAddress) {
      return key;
    }
  }

  return null;
};

/**
 * Find token key by symbol (returns first match)
 * @param {string} networkKey - Network key
 * @param {string} symbol - Token symbol
 * @param {Object} settings - Optional settings object
 * @returns {string|null} Token key or null if not found
 */
export const findTokenKeyBySymbol = (networkKey, symbol, settings = null) => {
  if (!symbol) return null;

  const tokens = getNetworkTokens(networkKey, settings);
  const normalizedSymbol = symbol.toUpperCase();

  // First try direct key lookup (for backward compatibility)
  if (tokens[symbol]) {
    return symbol;
  }

  // Search for token with matching symbol
  for (const [key, tokenConfig] of Object.entries(tokens)) {
    if (tokenConfig.symbol && tokenConfig.symbol.toUpperCase() === normalizedSymbol) {
      return key;
    }
  }

  return null;
};

