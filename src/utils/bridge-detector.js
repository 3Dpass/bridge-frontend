import { ethers } from 'ethers';
import {
  ORACLE_ABI,
  EXPORT_ABI,
  IMPORT_ABI,
  IMPORT_WRAPPER_ABI
} from '../contracts/abi';
import { createBridgeContract } from './contract-factory';
import { autoDetectToken, is3DPassPrecompile } from './token-detector';
import { get3DPassTokenByAddress } from './threedpass';
import { NETWORKS, ADDRESS_ZERO } from '../config/networks';
import { getProvider } from './provider-manager';
import { getNetworkWithSettings } from './settings';
import { hasBridgesRegistry, getBridgeInfoFromRegistry } from './update-bridge-info';
import { getNetworkTokens, getTokenByAddress, getTokensBySymbol } from './token-helpers';

// Helper function to get network name from network key
const getNetworkName = (networkKey) => {
  const network = getNetworkWithSettings(networkKey);
  return network?.name || networkKey;
};

/**
 * Bridge type detection based on constructor parameters
 */
export const BRIDGE_TYPES = {
  EXPORT: 'export',
  IMPORT: 'import',
  IMPORT_WRAPPER: 'import_wrapper'
};

/**
 * Detect bridge type by analyzing constructor parameters
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @returns {Promise<string>} Bridge type (export, import, import_wrapper)
 */
export const detectBridgeType = async (provider, bridgeAddress) => {
  try {
    console.log(`🔍 Detecting bridge type for address: ${bridgeAddress}`);
    
    // Try EXPORT first (most distinct)
    try {
      console.log(`  Trying EXPORT...`);
      const exportContract = createBridgeContract(bridgeAddress, 'export', provider);
      await exportContract.foreign_network();
      console.log(`  ✅ EXPORT detected!`);
      return BRIDGE_TYPES.EXPORT;
    } catch (error) {
      console.log(`  ❌ Not EXPORT: ${error.message}`);
    }
    
    // Both IMPORT and IMPORT_WRAPPER have home_network(), so we need to distinguish them
    // Try to call home_network() first to confirm it's an import-type bridge
    let homeNetwork;
    try {
      console.log(`  Checking if it's an import-type bridge...`);
      const importContract = createBridgeContract(bridgeAddress, 'import', provider);
      homeNetwork = await importContract.home_network();
      console.log(`  ✅ Confirmed import-type bridge with home_network: ${homeNetwork}`);
    } catch (error) {
      console.log(`  ❌ Not an import-type bridge: ${error.message}`);
      throw new Error('Unable to detect bridge type');
    }
    
    // Now try to distinguish between IMPORT and IMPORT_WRAPPER
    // Try IMPORT_WRAPPER-specific functions with better error handling
    try {
      console.log(`  Trying IMPORT_WRAPPER-specific functions...`);
      const importWrapperContract = createBridgeContract(bridgeAddress, 'import_wrapper', provider);
      
      // Try precompileAddress() first (most reliable)
      try {
        const precompileAddr = await importWrapperContract.precompileAddress();
        console.log(`  ✅ IMPORT_WRAPPER detected! precompileAddress: ${precompileAddr}`);
        return BRIDGE_TYPES.IMPORT_WRAPPER;
      } catch (error) {
        console.log(`  ❌ precompileAddress() failed: ${error.message}`);
      }
      
      // Try P3D_PRECOMPILE() as fallback
      try {
        const p3dPrecompile = await importWrapperContract.P3D_PRECOMPILE();
        console.log(`  ✅ IMPORT_WRAPPER detected via P3D_PRECOMPILE: ${p3dPrecompile}`);
        return BRIDGE_TYPES.IMPORT_WRAPPER;
      } catch (error) {
        console.log(`  ❌ P3D_PRECOMPILE() failed: ${error.message}`);
      }
      
      // Try to check if it has ERC20 functions (Import has them, ImportWrapper doesn't)
      try {
        console.log(`  Checking if it has ERC20 functions (Import vs ImportWrapper)...`);
        const erc20Contract = new ethers.Contract(bridgeAddress, ['function name() view returns (string)', 'function symbol() view returns (string)'], provider);
        await erc20Contract.name();
        console.log(`  ✅ Has ERC20 functions - assuming regular IMPORT`);
        return BRIDGE_TYPES.IMPORT;
      } catch (error) {
        console.log(`  ❌ No ERC20 functions - assuming IMPORT_WRAPPER`);
        return BRIDGE_TYPES.IMPORT_WRAPPER;
      }
      
    } catch (error) {
      console.log(`  ❌ IMPORT_WRAPPER detection failed: ${error.message}`);
      console.log(`  ✅ Assuming regular IMPORT`);
      return BRIDGE_TYPES.IMPORT;
    }
    
  } catch (error) {
    console.error('Error detecting bridge type:', error);
    throw new Error(`Failed to detect bridge type: ${error.message}`);
  }
};

/**
 * Validate oracle contract and get its basic information
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} oracleAddress - Oracle contract address
 * @returns {Promise<Object>} Oracle validation result
 */
export const validateOracleContract = async (provider, oracleAddress) => {
  try {
    console.log(`🔍 Validating oracle contract: ${oracleAddress}`);
    
    if (!oracleAddress || oracleAddress === ADDRESS_ZERO) {
      return {
        isValid: false,
        error: 'Oracle address is null or zero address'
      };
    }

    // Basic address validation
    if (!ethers.utils.isAddress(oracleAddress)) {
      return {
        isValid: false,
        error: 'Invalid oracle address format'
      };
    }

    // Try to create contract instance
    const oracleContract = new ethers.Contract(oracleAddress, ORACLE_ABI, provider);
    
    // Test if contract exists by calling a view function
    try {
      // Try to call getPrice with dummy parameters to test if contract responds
      // We'll use a simple test that should work for any oracle
      await oracleContract.getPrice('ETH', 'USD');
      console.log(`✅ Oracle contract validated: ${oracleAddress}`);
      
      return {
        isValid: true,
        oracleAddress,
        contract: oracleContract
      };
    } catch (error) {
      console.log(`❌ Oracle contract validation failed: ${error.message}`);
      return {
        isValid: false,
        error: `Oracle contract validation failed: ${error.message}`
      };
    }
  } catch (error) {
    console.error('Error validating oracle contract:', error);
    return {
      isValid: false,
      error: `Failed to validate oracle: ${error.message}`
    };
  }
};

/**
 * Check if oracle exists in network configuration (settings or config)
 * @param {string} oracleAddress - Oracle address to check
 * @param {string} networkKey - Network key
 * @param {Object} settings - Current settings
 * @returns {Object} Oracle existence check result
 */
export const checkOracleInConfig = (oracleAddress, networkKey, settings) => {
  try {
    console.log(`🔍 Checking if oracle ${oracleAddress} exists in config for ${networkKey}`);
    
    // Check in settings first (priority)
    if (settings[networkKey]?.oracles) {
      for (const [oracleKey, oracleConfig] of Object.entries(settings[networkKey].oracles)) {
        if (oracleConfig.address?.toLowerCase() === oracleAddress.toLowerCase()) {
          console.log(`✅ Found oracle in settings: ${oracleKey}`);
          return {
            exists: true,
            source: 'settings',
            oracleKey,
            oracleConfig
          };
        }
      }
    }
    
    // Check in default config
    const networkConfig = NETWORKS[networkKey];
    if (networkConfig?.oracles) {
      for (const [oracleKey, oracleConfig] of Object.entries(networkConfig.oracles)) {
        if (oracleConfig.address?.toLowerCase() === oracleAddress.toLowerCase()) {
          console.log(`✅ Found oracle in config: ${oracleKey}`);
          return {
            exists: true,
            source: 'config',
            oracleKey,
            oracleConfig
          };
        }
      }
    }
    
    console.log(`❌ Oracle not found in configuration`);
    return {
      exists: false,
      source: null,
      oracleKey: null,
      oracleConfig: null
    };
  } catch (error) {
    console.error('Error checking oracle in config:', error);
    return {
      exists: false,
      source: null,
      oracleKey: null,
      oracleConfig: null,
      error: error.message
    };
  }
};

/**
 * Generate a unique oracle key for a new oracle
 * @param {string} networkKey - Network key
 * @param {Object} settings - Current settings
 * @returns {string} Unique oracle key
 */
export const generateOracleKey = (networkKey, settings) => {
  const existingOracles = new Set();
  
  // Collect existing oracle keys from settings
  if (settings[networkKey]?.oracles) {
    Object.keys(settings[networkKey].oracles).forEach(key => existingOracles.add(key));
  }
  
  // Collect existing oracle keys from config
  const networkConfig = NETWORKS[networkKey];
  if (networkConfig?.oracles) {
    Object.keys(networkConfig.oracles).forEach(key => existingOracles.add(key));
  }
  
  // Generate unique key
  let counter = 1;
  let oracleKey = `oracle_${counter}`;
  while (existingOracles.has(oracleKey)) {
    counter++;
    oracleKey = `oracle_${counter}`;
  }
  
  return oracleKey;
};

/**
 * Get bridge data from Export contract
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} networkSymbol - Network where bridge is deployed
 * @returns {Promise<Object>} Bridge configuration data
 */
export const getExportBridgeData = async (provider, bridgeAddress, networkSymbol, settings = null) => {
  try {
    const contract = new ethers.Contract(bridgeAddress, EXPORT_ABI, provider);
    
    const [
      foreignNetwork,
      foreignAsset,
      settings
    ] = await Promise.all([
      contract.foreign_network(),
      contract.foreign_asset(),
      contract.settings()
    ]);

    // Note: Export bridges don't have oracleAddress() function
    const oracleAddress = null;

    const { tokenAddress: stakeTokenAddress } = settings;

    // Convert network names to match config names (do this first for token discovery)
    let normalizedForeignNetwork = foreignNetwork;
    if (foreignNetwork === 'BSC') {
      normalizedForeignNetwork = 'Binance Smart Chain';
    } else if (foreignNetwork === '3dpass') {
      normalizedForeignNetwork = '3DPass';
    }

    // Discover token symbols from their respective networks
    let foreignTokenSymbol = null;
    let stakeTokenSymbol = null;
    
    // Discover foreign token symbol from foreign network
    // Use original foreignNetwork for token discovery (not normalized) since config uses original names
    if (foreignAsset && foreignAsset !== ADDRESS_ZERO) {
      try {
        // Check if this is a 3DPass precompile address (starts with 0xfBFBfbFA)
        // If so, we need to use the 3DPass network to fetch the symbol, not the foreign network
        let targetNetwork = foreignNetwork; // Use original network name for token discovery
        if (is3DPassPrecompile(foreignAsset)) {
          console.log(`🔍 Detected 3DPass precompile address: ${foreignAsset}`);
          targetNetwork = '3DPass';
          console.log(`🔍 Using 3DPass network to discover token symbol for precompile`);
        } else {
          // Normalize network name for token discovery only if needed
          // BSC config uses 'BSC' as name, so keep it as 'BSC' for discovery
          // 3dpass needs to be normalized to '3DPass' for discovery
          if (targetNetwork === '3dpass') {
            targetNetwork = '3DPass';
          }
        }
        
        console.log(`🔍 Discovering foreign token symbol for ${foreignAsset} on ${targetNetwork} network`);
        
        // Validate address format first
        if (!ethers.utils.isAddress(foreignAsset)) {
          console.warn(`⚠️ Invalid foreign asset address format: ${foreignAsset}`);
          foreignTokenSymbol = 'Invalid Address';
        } else {
          foreignTokenSymbol = await discoverTokenSymbol(foreignAsset, targetNetwork, settings);
          if (foreignTokenSymbol) {
            console.log(`✅ Successfully discovered foreign token symbol: ${foreignTokenSymbol}`);
          } else {
            console.log(`❌ Failed to discover foreign token symbol for ${foreignAsset} on ${targetNetwork}`);
          }
        }
      } catch (error) {
        console.warn('Failed to discover foreign token symbol:', error);
        foreignTokenSymbol = 'Error';
      }
    }
    
    // Discover stake token symbol from current network
    if (stakeTokenAddress && stakeTokenAddress !== ADDRESS_ZERO) {
      try {
        const currentNetworkName = NETWORKS[networkSymbol]?.name || '3DPass';
        stakeTokenSymbol = await discoverTokenSymbol(stakeTokenAddress, currentNetworkName, settings);
      } catch (error) {
        console.warn('Failed to discover stake token symbol:', error);
      }
    } else if (stakeTokenAddress === ADDRESS_ZERO) {
      // Zero address means native token - get symbol from settings/config
      console.log(`🔍 Stake token address is zero address (native token) for network ${networkSymbol}`);
      stakeTokenSymbol = getNativeTokenSymbol(networkSymbol, settings);
      if (!stakeTokenSymbol) {
        console.warn(`⚠️ Native token symbol not found for network ${networkSymbol}`);
      }
    }

    return {
      foreignNetwork: normalizedForeignNetwork,
      foreignAsset,
      stakeTokenAddress,
      foreignTokenSymbol,
      stakeTokenSymbol,
      oracleAddress
    };
  } catch (error) {
    console.error('Error getting Export bridge data:', error);
    throw new Error(`Failed to get Export bridge data: ${error.message}`);
  }
};

/**
 * Get bridge data from Import contract
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} networkSymbol - Network where bridge is deployed
 * @returns {Promise<Object>} Bridge configuration data
 */
export const getImportBridgeData = async (provider, bridgeAddress, networkSymbol, settings = null) => {
  try {
    const contract = new ethers.Contract(bridgeAddress, IMPORT_ABI, provider);
    
    const [
      homeNetwork,
      homeAsset,
      oracleAddress,
      settings
    ] = await Promise.all([
      contract.home_network(),
      contract.home_asset(),
      contract.oracleAddress(),
      contract.settings()
    ]);

    const { tokenAddress: stakeTokenAddress } = settings;

    // Discover token symbols from their respective networks
    let homeTokenSymbol = null;
    let bridgeTokenSymbol = null;
    let stakeTokenSymbol = null;
    
    // Discover home token symbol from home network
    if (homeAsset && homeAsset !== ADDRESS_ZERO) {
      try {
        homeTokenSymbol = await discoverTokenSymbol(homeAsset, homeNetwork, settings);
      } catch (error) {
        console.warn('Failed to discover home token symbol:', error);
      }
    }
    
    // Discover bridge token symbol from current network (the import contract itself is the token)
    try {
      const currentNetworkName = NETWORKS[networkSymbol]?.name || '3DPass';
      bridgeTokenSymbol = await discoverTokenSymbol(bridgeAddress, currentNetworkName, settings);
    } catch (error) {
      console.warn('Failed to discover bridge token symbol:', error);
    }
    
    // Discover stake token symbol from current network
    if (stakeTokenAddress && stakeTokenAddress !== ADDRESS_ZERO) {
      try {
        const currentNetworkName = NETWORKS[networkSymbol]?.name || '3DPass';
        stakeTokenSymbol = await discoverTokenSymbol(stakeTokenAddress, currentNetworkName, settings);
      } catch (error) {
        console.warn('Failed to discover stake token symbol:', error);
      }
    } else if (stakeTokenAddress === ADDRESS_ZERO) {
      // Zero address means native token - get symbol from settings/config
      console.log(`🔍 Stake token address is zero address (native token) for network ${networkSymbol}`);
      stakeTokenSymbol = getNativeTokenSymbol(networkSymbol, settings);
      if (!stakeTokenSymbol) {
        console.warn(`⚠️ Native token symbol not found for network ${networkSymbol}`);
      }
    }

    // Convert network names to match config names
    let normalizedHomeNetwork = homeNetwork;
    if (homeNetwork === 'BSC') {
      normalizedHomeNetwork = 'Binance Smart Chain';
    } else if (homeNetwork === '3dpass' || homeNetwork === '3DPass') {
      normalizedHomeNetwork = '3DPass';
    }

    return {
      homeNetwork: normalizedHomeNetwork,
      homeAsset,
      stakeTokenAddress,
      homeTokenSymbol,
      bridgeTokenSymbol,
      stakeTokenSymbol,
      oracleAddress
    };
  } catch (error) {
    console.error('Error getting Import bridge data:', error);
    throw new Error(`Failed to get Import bridge data: ${error.message}`);
  }
};

/**
 * Get native token symbol for a network from settings or config
 * @param {string} networkKey - Network key (e.g., 'ETHEREUM', 'THREEDPASS')
 * @param {Object} settings - Current settings
 * @returns {string|null} Native token symbol or null if not found
 */
export const getNativeTokenSymbol = (networkKey, settings) => {
  try {
    // Use token-helpers to get all tokens (includes settings)
    const tokens = getNetworkTokens(networkKey, settings);
    
    // Find native token
    for (const [, tokenConfig] of Object.entries(tokens)) {
      if (tokenConfig.isNative === true) {
        console.log(`✅ Found native token symbol: ${tokenConfig.symbol}`);
        return tokenConfig.symbol;
      }
    }
    
    console.log(`❌ Native token not found for network ${networkKey}`);
    return null;
  } catch (error) {
    console.error(`❌ Error getting native token symbol:`, error);
    return null;
  }
};

/**
 * Discover token symbol from network settings or blockchain
 * @param {string} tokenAddress - Token contract address
 * @param {string} networkName - Network name (e.g., 'Ethereum', '3DPass')
 * @param {Object} settings - Current settings
 * @returns {Promise<string>} Token symbol
 */
export const discoverTokenSymbol = async (tokenAddress, networkName, settings) => {
  try {
    console.log(`🔍 Discovering token symbol for ${tokenAddress} on ${networkName}`);
    
    // Step 1: Look up token in settings for the network
    // Normalize network name for case-insensitive lookup
    let normalizedNetworkName = networkName?.trim();
    
    // Handle common network name variations
    if (normalizedNetworkName?.toLowerCase() === 'binance smart chain') {
      normalizedNetworkName = 'BSC';
    }
    
    let networkKey = Object.keys(NETWORKS).find(key => 
      NETWORKS[key].name?.toLowerCase() === normalizedNetworkName?.toLowerCase()
    );
    
    // If not found by name, try to find by key directly (for cases like 'BSC' vs 'BNB Smart Chain')
    if (!networkKey) {
      networkKey = Object.keys(NETWORKS).find(key => key.toLowerCase() === normalizedNetworkName?.toLowerCase());
    }
    
    if (!networkKey) {
      console.log(`❌ Network ${networkName} not found in configuration`);
      console.log(`Available networks:`, Object.keys(NETWORKS).map(key => ({ key, name: NETWORKS[key].name })));
      return null;
    }
    
    console.log(`✅ Found network key: ${networkKey} for network: ${networkName}`);
    
    // Special handling for 3DPass precompile addresses
    // Check if this is a 3DPass precompile that should be looked up from 3DPass network config
    if (networkKey === 'THREEDPASS' && is3DPassPrecompile(tokenAddress, settings)) {
      console.log(`🔍 Detected 3DPass precompile address: ${tokenAddress}`);
      
      // Try to get token info from threedpass.js helper functions
      const tokenConfig = get3DPassTokenByAddress(tokenAddress, settings);
      if (tokenConfig && tokenConfig.symbol) {
        console.log(`✅ Found 3DPass precompile symbol in config: ${tokenConfig.symbol}`);
        return tokenConfig.symbol;
      } else {
        console.log(`⚠️ 3DPass precompile address found but token not in config. Will try blockchain detection.`);
      }
    }
    
    // Use token-helpers to find token by address (checks both config and settings)
    const token = getTokenByAddress(networkKey, tokenAddress, settings);
    
    if (token) {
      console.log(`✅ Found token symbol: ${token.symbol}`);
      return token.symbol;
    } else {
      const tokens = getNetworkTokens(networkKey, settings);
      console.log(`❌ Token address ${tokenAddress} not found in ${networkKey} tokens`);
      console.log(`Available tokens:`, Object.keys(tokens).map(key => ({
        key,
        address: tokens[key].address,
        symbol: tokens[key].symbol
      })));
    }
    
    // Step 2: If not found in settings, detect from blockchain
    console.log(`🔍 Token not found in config, attempting to detect from blockchain...`);
    try {
      const networkProvider = getProvider(networkKey);
      
      // Check if provider is properly configured
      if (!networkProvider || !networkProvider.connection || !networkProvider.connection.url) {
        console.log(`⚠️ Provider not properly configured for ${networkKey}, skipping blockchain detection`);
        return null;
      }
      
      // Check if RPC URL is a placeholder
      const rpcUrl = networkProvider.connection.url;
      if (rpcUrl.includes('YOUR_INFURA_KEY') || rpcUrl.includes('YOUR_PROJECT_ID')) {
        console.log(`⚠️ RPC URL is a placeholder for ${networkKey}, skipping blockchain detection`);
        return null;
      }
      
      const result = await autoDetectToken(networkProvider, tokenAddress, networkKey, settings);
      
      if (result.success) {
        console.log(`✅ Detected token symbol from blockchain: ${result.tokenInfo.symbol}`);
        
        // Add the token to settings if it's not already there
        if (settings && settings[networkKey]) {
          if (!settings[networkKey].tokens) {
            settings[networkKey].tokens = {};
          }
          
          // Use address-based key for discovered tokens
          const tokenKey = tokenAddress.toLowerCase();
          settings[networkKey].tokens[tokenKey] = {
            address: tokenAddress,
            symbol: result.tokenInfo.symbol,
            name: result.tokenInfo.name,
            decimals: result.tokenInfo.decimals,
            type: result.tokenInfo.type
          };
          
          console.log(`✅ Added token to settings: ${tokenKey}`);
        }
        
        return result.tokenInfo.symbol;
      } else {
        console.log(`❌ Failed to detect token from blockchain: ${result.message}`);
        
        // For 3DPass precompiles, if blockchain detection fails, try to extract asset ID and construct symbol
        if (networkKey === 'THREEDPASS' && is3DPassPrecompile(tokenAddress, settings)) {
          console.log(`🔍 Blockchain detection failed for 3DPass precompile, attempting to extract asset ID...`);
          try {
            const { getAssetIdFromPrecompile } = await import('./threedpass');
            const assetId = getAssetIdFromPrecompile(tokenAddress, settings);
            if (assetId !== null) {
              // Try to construct symbol from asset ID if we can't fetch it
              // This is a fallback - ideally the token should be in config
              console.log(`⚠️ Found asset ID ${assetId} but could not fetch symbol. Token may need to be added to config.`);
            }
          } catch (error) {
            console.warn('Failed to extract asset ID from precompile:', error);
          }
        }
        
        return null;
      }
    } catch (error) {
      console.error(`❌ Error detecting token from blockchain:`, error);
      
      // For 3DPass precompiles, if blockchain detection fails, try to extract asset ID and construct symbol
      if (networkKey === 'THREEDPASS' && is3DPassPrecompile(tokenAddress, settings)) {
        console.log(`🔍 Blockchain detection error for 3DPass precompile, attempting to extract asset ID...`);
        try {
          const { getAssetIdFromPrecompile } = await import('./threedpass');
          const assetId = getAssetIdFromPrecompile(tokenAddress, settings);
          if (assetId !== null) {
            console.log(`⚠️ Found asset ID ${assetId} but could not fetch symbol. Token may need to be added to config.`);
          }
        } catch (error) {
          console.warn('Failed to extract asset ID from precompile:', error);
        }
      }
      
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Error discovering token symbol:`, error);
    return null;
  }
};

/**
 * Get bridge data from ImportWrapper contract
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} networkSymbol - Network where bridge is deployed
 * @returns {Promise<Object>} Bridge configuration data
 */
export const getImportWrapperBridgeData = async (provider, bridgeAddress, networkSymbol, settings = null) => {
  try {
    const contract = new ethers.Contract(bridgeAddress, IMPORT_WRAPPER_ABI, provider);
    
    // Try each call individually to handle failures gracefully
    let homeNetwork, homeAsset, precompileAddress, oracleAddress, settings;
    
    try {
      homeNetwork = await contract.home_network();
      console.log('✅ home_network:', homeNetwork);
    } catch (error) {
      console.warn('Failed to get home_network:', error.message);
      homeNetwork = 'Unknown';
    }
    
    try {
      homeAsset = await contract.home_asset();
      console.log('✅ home_asset:', homeAsset);
    } catch (error) {
      console.warn('Failed to get home_asset:', error.message);
      homeAsset = null;
    }
    
    try {
      precompileAddress = await contract.precompileAddress();
      console.log('✅ precompileAddress:', precompileAddress);
    } catch (error) {
      console.warn('Failed to get precompileAddress:', error.message);
      precompileAddress = null; // Don't set a fallback, let it be null
    }
    
    try {
      oracleAddress = await contract.oracleAddress();
      console.log('✅ oracleAddress:', oracleAddress);
    } catch (error) {
      console.warn('Failed to get oracleAddress:', error.message);
      oracleAddress = null;
    }
    
    try {
      settings = await contract.settings();
      console.log('✅ settings:', settings);
    } catch (error) {
      console.warn('Failed to get settings:', error.message);
      // Use token-helpers to get P3D address
      const p3dTokens = getTokensBySymbol('THREEDPASS', 'P3D', null);
      const p3dToken = p3dTokens && p3dTokens.length > 0 ? p3dTokens[0] : null;
      const p3dAddress = p3dToken?.address || null;
      settings = p3dAddress ? { tokenAddress: p3dAddress } : null;
    }

    const { tokenAddress: stakeTokenAddress } = settings || {};

    // Discover token symbols from their respective networks
    let homeTokenSymbol = null;
    let foreignTokenSymbol = null;
    let stakeTokenSymbol = null;
    
    // Discover home token symbol from home network
    if (homeAsset && homeAsset !== ADDRESS_ZERO) {
      try {
        homeTokenSymbol = await discoverTokenSymbol(homeAsset, homeNetwork, settings);
      } catch (error) {
        console.warn('Failed to discover home token symbol:', error);
      }
    }
    
    // Discover foreign token symbol from current network (3DPass)
    if (precompileAddress && precompileAddress !== ADDRESS_ZERO) {
      try {
        const currentNetworkName = NETWORKS[networkSymbol]?.name || '3DPass';
        foreignTokenSymbol = await discoverTokenSymbol(precompileAddress, currentNetworkName, settings);
    } catch (error) {
        console.warn('Failed to discover foreign token symbol:', error);
      }
    }
    
    // Discover stake token symbol from current network
    if (stakeTokenAddress && stakeTokenAddress !== ADDRESS_ZERO) {
      try {
        const currentNetworkName = NETWORKS[networkSymbol]?.name || '3DPass';
        stakeTokenSymbol = await discoverTokenSymbol(stakeTokenAddress, currentNetworkName, settings);
      } catch (error) {
        console.warn('Failed to discover stake token symbol:', error);
        // Use token-helpers to get P3D symbol
        const p3dTokens = getTokensBySymbol('THREEDPASS', 'P3D', null);
        const p3dToken = p3dTokens && p3dTokens.length > 0 ? p3dTokens[0] : null;
        stakeTokenSymbol = p3dToken?.symbol || null;
      }
    } else if (stakeTokenAddress === ADDRESS_ZERO) {
      // Zero address means native token - get symbol from settings/config
      console.log(`🔍 Stake token address is zero address (native token) for network ${networkSymbol}`);
      stakeTokenSymbol = getNativeTokenSymbol(networkSymbol, settings);
      if (!stakeTokenSymbol) {
        console.warn(`⚠️ Native token symbol not found for network ${networkSymbol}`);
      }
    }

    // Convert network names to match config names
    let normalizedHomeNetwork = homeNetwork;
    if (homeNetwork === 'BSC') {
      normalizedHomeNetwork = 'Binance Smart Chain';
    } else if (homeNetwork === '3dpass' || homeNetwork === '3DPass') {
      normalizedHomeNetwork = '3DPass';
    }

    return {
      homeNetwork: normalizedHomeNetwork,
      homeAsset,
      precompileAddress,
      stakeTokenAddress,
      homeTokenSymbol,
      foreignTokenSymbol,
      stakeTokenSymbol,
      oracleAddress
    };
  } catch (error) {
    console.error('Error getting ImportWrapper bridge data:', error);
    throw new Error(`Failed to get ImportWrapper bridge data: ${error.message}`);
  }
};

/**
 * Get token symbol from settings or config
 * @param {string} tokenAddress - Token address
 * @param {string} networkSymbol - Network symbol
 * @param {Object} settings - Current settings
 * @returns {string|null} Token symbol or null if not found
 */
export const getTokenSymbolFromConfig = (tokenAddress, networkSymbol, settings) => {
  if (!tokenAddress) return null;

  // Use token-helpers to find token by address (checks both config and settings)
  const token = getTokenByAddress(networkSymbol, tokenAddress, settings);
  return token ? token.symbol : null;
};

/**
 * Generate bridge description
 * @param {string} type - Bridge type
 * @param {string} homeNetwork - Home network
 * @param {string} homeTokenSymbol - Home token symbol
 * @param {string} foreignNetwork - Foreign network
 * @param {string} foreignTokenSymbol - Foreign token symbol
 * @returns {string} Generated description
 */
export const generateBridgeDescription = (type, homeNetwork, homeTokenSymbol, foreignNetwork, foreignTokenSymbol) => {
  const direction = type === 'export' ? '→' : '←';
  return `${homeNetwork} ${homeTokenSymbol} ${direction} ${foreignNetwork} ${foreignTokenSymbol} Bridge`;
};

/**
 * Auto-detect bridge and aggregate all data
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} networkSymbol - Network where bridge is deployed
 * @param {Object} settings - Current settings
 * @returns {Promise<Object>} Complete bridge configuration
 */
export const autoDetectBridge = async (provider, bridgeAddress, networkSymbol, settings = null) => {
  try {
    // Detect bridge type
    const bridgeType = await detectBridgeType(provider, bridgeAddress);
    
    let bridgeData;
    let bridgeConfig;

    switch (bridgeType) {
      case BRIDGE_TYPES.EXPORT:
        bridgeData = await getExportBridgeData(provider, bridgeAddress, networkSymbol, settings);
        
        bridgeConfig = {
          address: bridgeAddress,
          type: bridgeType,
          homeNetwork: getNetworkName(networkSymbol),
          homeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          homeTokenAddress: bridgeData.stakeTokenAddress,
          foreignNetwork: bridgeData.foreignNetwork,
          foreignTokenSymbol: bridgeData.foreignTokenSymbol || 'Unknown',
          foreignTokenAddress: bridgeData.foreignAsset,
          stakeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          stakeTokenAddress: bridgeData.stakeTokenAddress,
          oracleAddress: bridgeData.oracleAddress,
          description: generateBridgeDescription(
            bridgeType,
            getNetworkName(networkSymbol),
            bridgeData.stakeTokenSymbol || 'Unknown',
            bridgeData.foreignNetwork,
            bridgeData.foreignTokenSymbol || 'Unknown'
          )
        };
        break;

      case BRIDGE_TYPES.IMPORT:
        bridgeData = await getImportBridgeData(provider, bridgeAddress, networkSymbol, settings);
        
        bridgeConfig = {
          address: bridgeAddress,
          type: bridgeType,
          homeNetwork: bridgeData.homeNetwork,
          homeTokenSymbol: bridgeData.homeTokenSymbol || 'Unknown',
          homeTokenAddress: bridgeData.homeAsset,
          foreignNetwork: getNetworkName(networkSymbol),
          foreignTokenSymbol: bridgeData.bridgeTokenSymbol || 'Unknown',
          foreignTokenAddress: bridgeAddress, // Bridge address itself
          stakeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          stakeTokenAddress: bridgeData.stakeTokenAddress,
          oracleAddress: bridgeData.oracleAddress,
          isIssuerBurner: true,
          description: generateBridgeDescription(
            bridgeType,
            bridgeData.homeNetwork,
            bridgeData.homeTokenSymbol || 'Unknown',
            getNetworkName(networkSymbol),
            bridgeData.bridgeTokenSymbol || 'Unknown'
          )
        };
        break;

      case BRIDGE_TYPES.IMPORT_WRAPPER:
        bridgeData = await getImportWrapperBridgeData(provider, bridgeAddress, networkSymbol, settings);
        
        bridgeConfig = {
          address: bridgeAddress,
          type: bridgeType,
          homeNetwork: bridgeData.homeNetwork,
          homeTokenSymbol: bridgeData.homeTokenSymbol || 'Unknown',
          homeTokenAddress: bridgeData.homeAsset,
          foreignNetwork: getNetworkName(networkSymbol),
          foreignTokenSymbol: bridgeData.foreignTokenSymbol || 'Unknown',
          foreignTokenAddress: bridgeData.precompileAddress,
          stakeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          stakeTokenAddress: bridgeData.stakeTokenAddress,
          oracleAddress: bridgeData.oracleAddress,
          isIssuerBurner: true,
          description: generateBridgeDescription(
            bridgeType,
            bridgeData.homeNetwork,
            bridgeData.homeTokenSymbol || 'Unknown',
            getNetworkName(networkSymbol),
            bridgeData.foreignTokenSymbol || 'Unknown'
          )
        };
        break;

      default:
        throw new Error(`Unsupported bridge type: ${bridgeType}`);
    }

    // Try to fetch createdAt from bridge registry if available
    let createdAt = null;
    if (hasBridgesRegistry(networkSymbol)) {
      try {
        const networkConfig = NETWORKS[networkSymbol];
        const registryAddress = networkConfig.contracts.bridgesRegistry;
        console.log(`🔍 Fetching createdAt from bridge registry: ${registryAddress}`);
        
        const registryInfo = await getBridgeInfoFromRegistry(provider, registryAddress, bridgeAddress);
        if (registryInfo && registryInfo.createdAt) {
          createdAt = registryInfo.createdAt;
          console.log(`✅ Fetched createdAt from registry: ${createdAt} (${new Date(createdAt * 1000).toISOString()})`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch createdAt from registry: ${error.message}`);
        // Don't fail the entire detection if registry lookup fails
      }
    }

    // Add createdAt to bridge config if available
    if (createdAt) {
      bridgeConfig.createdAt = createdAt;
    }

    // Validate and handle oracle address
    if (bridgeData.oracleAddress) {
      console.log(`🔍 Processing oracle address for bridge: ${bridgeData.oracleAddress}`);
      
      // Validate the oracle contract
      const oracleValidation = await validateOracleContract(provider, bridgeData.oracleAddress);
      
      if (!oracleValidation.isValid) {
        console.error(`❌ Oracle validation failed: ${oracleValidation.error}`);
        return {
          success: false,
          bridgeConfig: null,
          bridgeType: null,
          message: `Bridge oracle validation failed: ${oracleValidation.error}`,
          invalidOracle: true
        };
      }
      
      // Check if oracle exists in configuration
      const oracleCheck = checkOracleInConfig(bridgeData.oracleAddress, networkSymbol, settings);
      
      if (!oracleCheck.exists) {
        console.log(`⚠️ Oracle not found in configuration, needs to be added`);
        // Generate a unique key for the new oracle
        const newOracleKey = generateOracleKey(networkSymbol, settings);
        
        // Add the oracle to bridge config with a flag indicating it needs to be added to settings
        bridgeConfig.oracleAddress = bridgeData.oracleAddress;
        bridgeConfig.oracleNeedsAddition = {
          key: newOracleKey,
          address: bridgeData.oracleAddress,
          name: `Oracle ${newOracleKey}`,
          description: `Auto-detected oracle from bridge ${bridgeAddress}`
        };
        
        console.log(`✅ Oracle marked for addition to settings: ${newOracleKey}`);
      } else {
        // Oracle exists in configuration, use it
        bridgeConfig.oracleAddress = bridgeData.oracleAddress;
        console.log(`✅ Oracle found in configuration: ${oracleCheck.oracleKey}`);
      }
    } else {
      // No oracle address detected - this is invalid for import bridges
      if (bridgeType === BRIDGE_TYPES.IMPORT || bridgeType === BRIDGE_TYPES.IMPORT_WRAPPER) {
        console.error(`❌ Import bridge must have an oracle address`);
        return {
          success: false,
          bridgeConfig: null,
          bridgeType: null,
          message: 'Import bridge must have an oracle address',
          invalidOracle: true
        };
      }
      
      // For export bridges, oracle address is not required
      console.log(`ℹ️ Export bridge - no oracle address required`);
    }

    return {
      success: true,
      bridgeConfig,
      bridgeType,
      message: `Successfully detected ${bridgeType} bridge`
    };

  } catch (error) {
    console.error('Error auto-detecting bridge:', error);
    return {
      success: false,
      bridgeConfig: null,
      bridgeType: null,
      message: error.message
    };
  }
};
