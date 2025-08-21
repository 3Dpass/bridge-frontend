import { ethers } from 'ethers';
import { 
  EXPORT_ABI, 
  IMPORT_ABI, 
  IMPORT_WRAPPER_ABI 
} from '../contracts/abi';
import { autoDetectToken } from './token-detector';
import { NETWORKS, ADDRESS_ZERO } from '../config/networks';
import { getProvider } from './provider-manager';

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
      const exportContract = new ethers.Contract(bridgeAddress, EXPORT_ABI, provider);
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
      const importContract = new ethers.Contract(bridgeAddress, IMPORT_ABI, provider);
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
      const importWrapperContract = new ethers.Contract(bridgeAddress, IMPORT_WRAPPER_ABI, provider);
      
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

    const { tokenAddress: stakeTokenAddress } = settings;

    // Discover token symbols from their respective networks
    let foreignTokenSymbol = null;
    let stakeTokenSymbol = null;
    
    // Discover foreign token symbol from foreign network
    if (foreignAsset && foreignAsset !== ADDRESS_ZERO) {
      try {
        console.log(`🔍 Discovering foreign token symbol for ${foreignAsset} on ${foreignNetwork} network`);
        
        // Validate address format first
        if (!ethers.utils.isAddress(foreignAsset)) {
          console.warn(`⚠️ Invalid foreign asset address format: ${foreignAsset}`);
          foreignTokenSymbol = 'Invalid Address';
        } else {
          foreignTokenSymbol = await discoverTokenSymbol(foreignAsset, foreignNetwork, settings);
          if (foreignTokenSymbol) {
            console.log(`✅ Successfully discovered foreign token symbol: ${foreignTokenSymbol}`);
          } else {
            console.log(`❌ Failed to discover foreign token symbol for ${foreignAsset} on ${foreignNetwork}`);
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
    }

    // Convert network names to match config names
    const normalizedForeignNetwork = foreignNetwork === 'BSC' ? 'Binance Smart Chain' : foreignNetwork;

    return {
      foreignNetwork: normalizedForeignNetwork,
      foreignAsset,
      stakeTokenAddress,
      foreignTokenSymbol,
      stakeTokenSymbol
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
      settings
    ] = await Promise.all([
      contract.home_network(),
      contract.home_asset(),
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
    }

    // Convert network names to match config names
    const normalizedHomeNetwork = homeNetwork === 'BSC' ? 'Binance Smart Chain' : homeNetwork;

    return {
      homeNetwork: normalizedHomeNetwork,
      homeAsset,
      stakeTokenAddress,
      homeTokenSymbol,
      bridgeTokenSymbol,
      stakeTokenSymbol
    };
  } catch (error) {
    console.error('Error getting Import bridge data:', error);
    throw new Error(`Failed to get Import bridge data: ${error.message}`);
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
    let networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].name === networkName);
    
    // If not found by name, try to find by key directly (for cases like 'BSC' vs 'BNB Smart Chain')
    if (!networkKey) {
      networkKey = Object.keys(NETWORKS).find(key => key === networkName);
    }
    
    if (!networkKey) {
      console.log(`❌ Network ${networkName} not found in configuration`);
      console.log(`Available networks:`, Object.keys(NETWORKS).map(key => ({ key, name: NETWORKS[key].name })));
      return null;
    }
    
    console.log(`✅ Found network key: ${networkKey} for network: ${networkName}`);
    
    // Check if token exists in settings first
    if (settings && settings[networkKey] && settings[networkKey].tokens) {
      const tokenKey = Object.keys(settings[networkKey].tokens).find(key => 
        settings[networkKey].tokens[key].address?.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      if (tokenKey) {
        const symbol = settings[networkKey].tokens[tokenKey].symbol;
        console.log(`✅ Found token symbol in settings: ${symbol}`);
        return symbol;
      }
    }
    
    // Step 1.5: Check if token exists in default config
    const networkConfig = NETWORKS[networkKey];
    if (networkConfig && networkConfig.tokens) {
      console.log(`🔍 Checking ${Object.keys(networkConfig.tokens).length} tokens in ${networkKey} config`);
      const tokenKey = Object.keys(networkConfig.tokens).find(key => 
        networkConfig.tokens[key].address?.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      if (tokenKey) {
        const symbol = networkConfig.tokens[tokenKey].symbol;
        console.log(`✅ Found token symbol in config: ${symbol}`);
        return symbol;
      } else {
        console.log(`❌ Token address ${tokenAddress} not found in ${networkKey} config tokens`);
        console.log(`Available tokens:`, Object.keys(networkConfig.tokens).map(key => ({
          key,
          address: networkConfig.tokens[key].address,
          symbol: networkConfig.tokens[key].symbol
        })));
      }
    } else {
      console.log(`❌ No tokens configured for network ${networkKey}`);
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
      
      const result = await autoDetectToken(networkProvider, tokenAddress, networkKey);
      
      if (result.success) {
        console.log(`✅ Detected token symbol from blockchain: ${result.tokenInfo.symbol}`);
        
        // Add the token to settings if it's not already there
        if (settings && settings[networkKey]) {
          if (!settings[networkKey].tokens) {
            settings[networkKey].tokens = {};
          }
          
          const tokenKey = `${result.tokenInfo.symbol}_${networkKey}`;
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
        return null;
      }
    } catch (error) {
      console.error(`❌ Error detecting token from blockchain:`, error);
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
    let homeNetwork, homeAsset, precompileAddress, settings;
    
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
      settings = await contract.settings();
      console.log('✅ settings:', settings);
    } catch (error) {
      console.warn('Failed to get settings:', error.message);
      // Use P3D address from config instead of hardcoding
      const p3dAddress = NETWORKS[networkSymbol]?.tokens?.P3D?.address || null;
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
        // Get P3D symbol from config instead of hardcoding
        const p3dSymbol = NETWORKS[networkSymbol]?.tokens?.P3D?.symbol || null;
        stakeTokenSymbol = p3dSymbol;
      }
    }

    // Convert network names to match config names
    const getNetworkNameFromKey = (networkKey) => {
      return NETWORKS[networkKey]?.name || networkKey;
    };
    
    // Convert BSC to Binance Smart Chain for consistency
    const normalizedHomeNetwork = homeNetwork === 'BSC' ? 'Binance Smart Chain' : homeNetwork;

    return {
      homeNetwork: normalizedHomeNetwork,
      homeAsset,
      precompileAddress,
      stakeTokenAddress,
      homeTokenSymbol,
      foreignTokenSymbol,
      stakeTokenSymbol
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

  // Check in settings first
  if (settings && settings[networkSymbol] && settings[networkSymbol].tokens) {
    for (const [symbol, token] of Object.entries(settings[networkSymbol].tokens)) {
      if (token.address.toLowerCase() === tokenAddress.toLowerCase()) {
        return symbol;
      }
    }
  }

  // Check in default config
  const networkConfig = NETWORKS[networkSymbol];
  if (networkConfig && networkConfig.tokens) {
    for (const [symbol, token] of Object.entries(networkConfig.tokens)) {
      if (token.address.toLowerCase() === tokenAddress.toLowerCase()) {
        return symbol;
      }
    }
  }

  return null;
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
          homeNetwork: NETWORKS[networkSymbol]?.name || networkSymbol,
          homeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          homeTokenAddress: bridgeData.stakeTokenAddress,
          foreignNetwork: bridgeData.foreignNetwork,
          foreignTokenSymbol: bridgeData.foreignTokenSymbol || 'Unknown',
          foreignTokenAddress: bridgeData.foreignAsset,
          stakeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          stakeTokenAddress: bridgeData.stakeTokenAddress,
          description: generateBridgeDescription(
            bridgeType,
            NETWORKS[networkSymbol]?.name || networkSymbol,
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
          foreignNetwork: NETWORKS[networkSymbol]?.name || networkSymbol,
          foreignTokenSymbol: bridgeData.bridgeTokenSymbol || 'Unknown',
          foreignTokenAddress: bridgeAddress, // Bridge address itself
          stakeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          stakeTokenAddress: bridgeData.stakeTokenAddress,
          isIssuerBurner: true,
          description: generateBridgeDescription(
            bridgeType,
            bridgeData.homeNetwork,
            bridgeData.homeTokenSymbol || 'Unknown',
            NETWORKS[networkSymbol]?.name || networkSymbol,
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
          foreignNetwork: NETWORKS[networkSymbol]?.name || networkSymbol,
          foreignTokenSymbol: bridgeData.foreignTokenSymbol || 'Unknown',
          foreignTokenAddress: bridgeData.precompileAddress,
          stakeTokenSymbol: bridgeData.stakeTokenSymbol || 'Unknown',
          stakeTokenAddress: bridgeData.stakeTokenAddress,
          isIssuerBurner: true,
          description: generateBridgeDescription(
            bridgeType,
            bridgeData.homeNetwork,
            bridgeData.homeTokenSymbol || 'Unknown',
            NETWORKS[networkSymbol]?.name || networkSymbol,
            bridgeData.foreignTokenSymbol || 'Unknown'
          )
        };
        break;

      default:
        throw new Error(`Unsupported bridge type: ${bridgeType}`);
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
