import { ethers } from 'ethers';
import { autoDetectBridge } from './bridge-detector';
import { autoDetectAssistant } from './assistant-detector';
import { autoDetectToken } from './token-detector';
import { NETWORKS } from '../config/networks';

/**
 * BridgesRegistry ABI for interacting with the registry contract
 */
const BRIDGES_REGISTRY_ABI = [
  'function getAllBridges() view returns (address[])',
  'function getAllAssistants() view returns (address[])',
  'function getBridge(address) view returns (tuple(address bridgeAddress, uint8 bridgeType, uint256 createdAt, bool exists))',
  'function getAssistant(address) view returns (tuple(address assistantAddress, uint8 assistantType, uint256 createdAt, bool exists))',
  'function getBridgesByType(uint8) view returns (address[])',
  'function getAssistantsByType(uint8) view returns (address[])',
  'function getBridgeCount() view returns (uint256)',
  'function getAssistantCount() view returns (uint256)'
];

/**
 * Bridge and Assistant type enums from BridgesRegistry
 */
export const BRIDGE_TYPES = {
  EXPORT: 0,
  IMPORT: 1
};

export const ASSISTANT_TYPES = {
  IMPORT: 0,
  EXPORT: 1
};

/**
 * Get all bridges from BridgesRegistry
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} registryAddress - BridgesRegistry contract address
 * @returns {Promise<Array>} Array of bridge addresses
 */
export const getAllBridgesFromRegistry = async (provider, registryAddress) => {
  try {
    const registry = new ethers.Contract(registryAddress, BRIDGES_REGISTRY_ABI, provider);
    const bridgeAddresses = await registry.getAllBridges();
    return bridgeAddresses;
  } catch (error) {
    console.error('Error getting bridges from registry:', error);
    throw new Error(`Failed to get bridges from registry: ${error.message}`);
  }
};

/**
 * Get all assistants from BridgesRegistry
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} registryAddress - BridgesRegistry contract address
 * @returns {Promise<Array>} Array of assistant addresses
 */
export const getAllAssistantsFromRegistry = async (provider, registryAddress) => {
  try {
    const registry = new ethers.Contract(registryAddress, BRIDGES_REGISTRY_ABI, provider);
    const assistantAddresses = await registry.getAllAssistants();
    return assistantAddresses;
  } catch (error) {
    console.error('Error getting assistants from registry:', error);
    throw new Error(`Failed to get assistants from registry: ${error.message}`);
  }
};

/**
 * Get bridge info from BridgesRegistry
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} registryAddress - BridgesRegistry contract address
 * @param {string} bridgeAddress - Bridge contract address
 * @returns {Promise<Object>} Bridge info from registry
 */
export const getBridgeInfoFromRegistry = async (provider, registryAddress, bridgeAddress) => {
  try {
    const registry = new ethers.Contract(registryAddress, BRIDGES_REGISTRY_ABI, provider);
    const bridgeInfo = await registry.getBridge(bridgeAddress);
    return {
      address: bridgeInfo.bridgeAddress,
      type: bridgeInfo.bridgeType,
      createdAt: bridgeInfo.createdAt,
      exists: bridgeInfo.exists
    };
  } catch (error) {
    console.error('Error getting bridge info from registry:', error);
    throw new Error(`Failed to get bridge info from registry: ${error.message}`);
  }
};

/**
 * Get assistant info from BridgesRegistry
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} registryAddress - BridgesRegistry contract address
 * @param {string} assistantAddress - Assistant contract address
 * @returns {Promise<Object>} Assistant info from registry
 */
export const getAssistantInfoFromRegistry = async (provider, registryAddress, assistantAddress) => {
  try {
    const registry = new ethers.Contract(registryAddress, BRIDGES_REGISTRY_ABI, provider);
    const assistantInfo = await registry.getAssistant(assistantAddress);
    return {
      address: assistantInfo.assistantAddress,
      type: assistantInfo.assistantType,
      createdAt: assistantInfo.createdAt,
      exists: assistantInfo.exists
    };
  } catch (error) {
    console.error('Error getting assistant info from registry:', error);
    throw new Error(`Failed to get assistant info from registry: ${error.message}`);
  }
};

/**
 * Aggregate bridge data using bridge detector
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} networkSymbol - Network symbol
 * @param {Object} settings - Current settings
 * @returns {Promise<Object>} Aggregated bridge data
 */
export const aggregateBridgeData = async (provider, bridgeAddress, networkSymbol, settings) => {
  try {
    const result = await autoDetectBridge(provider, bridgeAddress, networkSymbol, settings);
    
    if (result.success) {
      return {
        success: true,
        bridgeConfig: result.bridgeConfig,
        bridgeType: result.bridgeType,
        message: result.message
      };
    } else {
      return {
        success: false,
        bridgeConfig: null,
        bridgeType: null,
        message: result.message
      };
    }
  } catch (error) {
    console.error('Error aggregating bridge data:', error);
    return {
      success: false,
      bridgeConfig: null,
      bridgeType: null,
      message: error.message
    };
  }
};

/**
 * Aggregate assistant data using assistant detector
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantAddress - Assistant contract address
 * @param {string} networkSymbol - Network symbol
 * @returns {Promise<Object>} Aggregated assistant data
 */
export const aggregateAssistantData = async (provider, assistantAddress, networkSymbol) => {
  try {
    const result = await autoDetectAssistant(provider, assistantAddress, networkSymbol);
    
    if (result.success) {
      return {
        success: true,
        assistantConfig: result.assistantConfig,
        shareTokenInfo: result.shareTokenInfo,
        message: result.message
      };
    } else {
      return {
        success: false,
        assistantConfig: null,
        shareTokenInfo: null,
        message: result.message
      };
    }
  } catch (error) {
    console.error('Error aggregating assistant data:', error);
    return {
      success: false,
      assistantConfig: null,
      shareTokenInfo: null,
      message: error.message
    };
  }
};

/**
 * Discover and aggregate all bridge and assistant data from BridgesRegistry
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} networkSymbol - Network symbol
 * @param {Object} settings - Current settings
 * @returns {Promise<Object>} Complete network data
 */
export const updateBridgeInfoFromRegistry = async (provider, networkSymbol, settings = {}) => {
  try {
    const networkConfig = NETWORKS[networkSymbol];
    if (!networkConfig) {
      throw new Error(`Network ${networkSymbol} not found in configuration`);
    }

    const registryAddress = networkConfig.contracts?.bridgesRegistry;
    if (!registryAddress) {
      throw new Error(`BridgesRegistry not deployed on network ${networkSymbol}`);
    }

    console.log(`🔍 Discovering bridges and assistants on ${networkSymbol}...`);

    // Get all bridges and assistants from registry
    const [bridgeAddresses, assistantAddresses] = await Promise.all([
      getAllBridgesFromRegistry(provider, registryAddress),
      getAllAssistantsFromRegistry(provider, registryAddress)
    ]);

    console.log(`📊 Found ${bridgeAddresses.length} bridges and ${assistantAddresses.length} assistants`);

    // Aggregate bridge data
    const bridges = {};
    const bridgeErrors = [];
    
    for (const bridgeAddress of bridgeAddresses) {
      try {
        const bridgeData = await aggregateBridgeData(provider, bridgeAddress, networkSymbol, settings);
        if (bridgeData.success) {
          // Generate bridge key that matches existing naming convention
        let bridgeKey;
        if (bridgeData.bridgeConfig.type === 'import_wrapper') {
          bridgeKey = `${bridgeData.bridgeConfig.homeTokenSymbol}_IMPORT`;
        } else if (bridgeData.bridgeConfig.type === 'export_wrapper') {
          bridgeKey = `${bridgeData.bridgeConfig.homeTokenSymbol}_EXPORT`;
        } else {
          bridgeKey = `${bridgeData.bridgeConfig.homeTokenSymbol}_${bridgeData.bridgeConfig.type.toUpperCase()}`;
        }
          bridges[bridgeKey] = bridgeData.bridgeConfig;
          console.log(`✅ Bridge ${bridgeKey}: ${bridgeData.message}`);
        } else {
          bridgeErrors.push({ address: bridgeAddress, error: bridgeData.message });
          console.warn(`❌ Bridge ${bridgeAddress}: ${bridgeData.message}`);
        }
      } catch (error) {
        bridgeErrors.push({ address: bridgeAddress, error: error.message });
        console.error(`❌ Bridge ${bridgeAddress}: ${error.message}`);
      }
    }

    // Aggregate assistant data
    const assistants = {};
    const assistantErrors = [];
    
    for (const assistantAddress of assistantAddresses) {
      try {
        const assistantData = await aggregateAssistantData(provider, assistantAddress, networkSymbol);
        if (assistantData.success) {
          // Generate assistant key that matches existing naming convention
          let assistantKey;
          if (assistantData.assistantConfig.type === 'import_wrapper') {
            // For import_wrapper assistants, use the token symbol from shareSymbol (remove 'IA' suffix)
            const tokenSymbol = assistantData.assistantConfig.shareSymbol.replace('IA', '');
            assistantKey = `${tokenSymbol}_IMPORT_ASSISTANT`;
          } else if (assistantData.assistantConfig.type === 'export_wrapper') {
            // For export_wrapper assistants, map shareSymbol to correct token symbol
            const shareSymbol = assistantData.assistantConfig.shareSymbol;
            let tokenSymbol;
            
            // Map specific share symbols to their correct token symbols
            if (shareSymbol === 'P3DEA') {
              tokenSymbol = 'P3D';
            } else if (shareSymbol === 'FIREA') {
              tokenSymbol = 'FIRE';
            } else if (shareSymbol === 'WATEA') {
              tokenSymbol = 'WATER';
            } else {
              // Fallback: remove 'EA' suffix
              tokenSymbol = shareSymbol.replace('EA', '');
            }
            
            assistantKey = `${tokenSymbol}_EXPORT_ASSISTANT`;
          } else {
            assistantKey = `${assistantData.assistantConfig.shareSymbol}_${assistantData.assistantConfig.type.toUpperCase()}_ASSISTANT`;
          }
          assistants[assistantKey] = assistantData.assistantConfig;
          console.log(`✅ Assistant ${assistantKey}: ${assistantData.message}`);
        } else {
          assistantErrors.push({ address: assistantAddress, error: assistantData.message });
          console.warn(`❌ Assistant ${assistantAddress}: ${assistantData.message}`);
        }
      } catch (error) {
        assistantErrors.push({ address: assistantAddress, error: error.message });
        console.error(`❌ Assistant ${assistantAddress}: ${error.message}`);
      }
    }

    // Discover new tokens from bridges and assistants
    const discoveredTokens = {};
    const tokenErrors = [];

    // Extract token addresses from bridges
    const tokenAddresses = new Set();
    
    Object.values(bridges).forEach(bridge => {
      if (bridge.homeTokenAddress) tokenAddresses.add(bridge.homeTokenAddress);
      if (bridge.foreignTokenAddress) tokenAddresses.add(bridge.foreignTokenAddress);
      if (bridge.stakeTokenAddress) tokenAddresses.add(bridge.stakeTokenAddress);
    });

    // Extract token addresses from assistants (share tokens)
    Object.values(assistants).forEach(assistant => {
      if (assistant.address) tokenAddresses.add(assistant.address); // Assistant itself is the share token
    });

    // Detect token data
    for (const tokenAddress of tokenAddresses) {
      try {
        const tokenResult = await autoDetectToken(provider, tokenAddress, networkSymbol, settings);
        if (tokenResult.success) {
          const tokenKey = tokenResult.tokenInfo.symbol;
          discoveredTokens[tokenKey] = tokenResult.tokenInfo;
          console.log(`✅ Token ${tokenKey}: ${tokenResult.tokenInfo.name}`);
        } else {
          tokenErrors.push({ address: tokenAddress, error: tokenResult.message });
          console.warn(`❌ Token ${tokenAddress}: ${tokenResult.message}`);
        }
      } catch (error) {
        tokenErrors.push({ address: tokenAddress, error: error.message });
        console.error(`❌ Token ${tokenAddress}: ${error.message}`);
      }
    }

    const result = {
      success: true,
      network: networkSymbol,
      bridges,
      assistants,
      discoveredTokens,
      summary: {
        totalBridges: bridgeAddresses.length,
        successfulBridges: Object.keys(bridges).length,
        failedBridges: bridgeErrors.length,
        totalAssistants: assistantAddresses.length,
        successfulAssistants: Object.keys(assistants).length,
        failedAssistants: assistantErrors.length,
        totalTokens: tokenAddresses.size,
        successfulTokens: Object.keys(discoveredTokens).length,
        failedTokens: tokenErrors.length
      },
      errors: {
        bridges: bridgeErrors,
        assistants: assistantErrors,
        tokens: tokenErrors
      },
      message: `Successfully discovered ${Object.keys(bridges).length} bridges, ${Object.keys(assistants).length} assistants, and ${Object.keys(discoveredTokens).length} tokens on ${networkSymbol}`
    };

    console.log(`🎉 Discovery complete:`, result.summary);
    return result;

  } catch (error) {
    console.error('Error updating bridge info from registry:', error);
    return {
      success: false,
      network: networkSymbol,
      bridges: {},
      assistants: {},
      discoveredTokens: {},
      summary: {},
      errors: {},
      message: error.message
    };
  }
};

/**
 * Generate configuration update for a network
 * @param {Object} discoveryResult - Result from updateBridgeInfoFromRegistry
 * @returns {Object} Configuration update object
 */
export const generateConfigUpdate = (discoveryResult) => {
  if (!discoveryResult.success) {
    return null;
  }

  const { network, bridges, assistants, discoveredTokens } = discoveryResult;

  return {
    network,
    bridges,
    assistants,
    tokens: discoveredTokens,
    timestamp: Date.now(),
    summary: discoveryResult.summary
  };
};

/**
 * Check if network has BridgesRegistry deployed
 * @param {string} networkSymbol - Network symbol
 * @returns {boolean} True if BridgesRegistry is deployed
 */
export const hasBridgesRegistry = (networkSymbol) => {
  const networkConfig = NETWORKS[networkSymbol];
  return networkConfig && networkConfig.contracts && networkConfig.contracts.bridgesRegistry;
};

/**
 * Get all networks with BridgesRegistry deployed
 * @returns {Array} Array of network symbols with BridgesRegistry
 */
export const getNetworksWithBridgesRegistry = () => {
  return Object.keys(NETWORKS).filter(networkSymbol => hasBridgesRegistry(networkSymbol));
};
