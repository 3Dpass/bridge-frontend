import { ethers } from 'ethers';
import { 
  EXPORT_ABI, 
  IMPORT_ABI, 
  IMPORT_WRAPPER_ABI 
} from '../contracts/abi';
import { autoDetectToken } from './token-detector';
import { NETWORKS } from '../config/networks';

/**
 * Assistant type detection based on bridge contract
 */
export const ASSISTANT_TYPES = {
  EXPORT: 'export',
  IMPORT: 'import',
  IMPORT_WRAPPER: 'import_wrapper'
};

/**
 * Detect assistant type by analyzing the bridge contract
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @returns {Promise<string>} Assistant type (export, import, import_wrapper)
 */
export const detectAssistantType = async (provider, bridgeAddress) => {
  try {
    // Try each bridge type and check if the contract responds
    const bridgeTypes = [
      { type: ASSISTANT_TYPES.EXPORT, abi: EXPORT_ABI },
      { type: ASSISTANT_TYPES.IMPORT, abi: IMPORT_ABI },
      { type: ASSISTANT_TYPES.IMPORT_WRAPPER, abi: IMPORT_WRAPPER_ABI }
    ];

    for (const { type, abi } of bridgeTypes) {
      try {
        const contract = new ethers.Contract(bridgeAddress, abi, provider);
        
        // Try to call a function that exists on this bridge type
        switch (type) {
          case ASSISTANT_TYPES.EXPORT:
            await contract.foreign_network();
            return type;
          case ASSISTANT_TYPES.IMPORT:
            await contract.home_network();
            return type;
          case ASSISTANT_TYPES.IMPORT_WRAPPER:
            await contract.home_network();
            return type;
          default:
            throw new Error(`Unsupported bridge type: ${type}`);
        }
      } catch (error) {
        // Continue to next bridge type
        continue;
      }
    }
    
    throw new Error('Unable to detect bridge type');
  } catch (error) {
    console.error('Error detecting assistant type:', error);
    throw new Error(`Failed to detect assistant type: ${error.message}`);
  }
};

/**
 * Get assistant data from Export bridge
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @returns {Promise<Object>} Bridge configuration data
 */
export const getExportBridgeData = async (provider, bridgeAddress) => {
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

    return {
      foreignNetwork,
      foreignAsset,
      settings
    };
  } catch (error) {
    console.error('Error getting Export bridge data:', error);
    throw new Error(`Failed to get Export bridge data: ${error.message}`);
  }
};

/**
 * Get assistant data from Import bridge
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @returns {Promise<Object>} Bridge configuration data
 */
export const getImportBridgeData = async (provider, bridgeAddress) => {
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

    return {
      homeNetwork,
      homeAsset,
      settings
    };
  } catch (error) {
    console.error('Error getting Import bridge data:', error);
    throw new Error(`Failed to get Import bridge data: ${error.message}`);
  }
};

/**
 * Get assistant data from ImportWrapper bridge
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} bridgeAddress - Bridge contract address
 * @returns {Promise<Object>} Bridge configuration data
 */
export const getImportWrapperBridgeData = async (provider, bridgeAddress) => {
  try {
    const contract = new ethers.Contract(bridgeAddress, IMPORT_WRAPPER_ABI, provider);
    
    const [
      homeNetwork,
      homeAsset,
      precompileAddress,
      settings
    ] = await Promise.all([
      contract.home_network(),
      contract.home_asset(),
      contract.precompileAddress(),
      contract.settings()
    ]);

    return {
      homeNetwork,
      homeAsset,
      precompileAddress,
      settings
    };
  } catch (error) {
    console.error('Error getting ImportWrapper bridge data:', error);
    throw new Error(`Failed to get ImportWrapper bridge data: ${error.message}`);
  }
};

/**
 * Get share token information for assistant
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantAddress - Assistant contract address
 * @param {string} networkSymbol - Network where assistant is deployed
 * @returns {Promise<Object>} Share token information
 */
export const getAssistantShareTokenInfo = async (provider, assistantAddress, networkSymbol) => {
  try {
    const tokenResult = await autoDetectToken(provider, assistantAddress, networkSymbol);
    
    if (tokenResult.success) {
      return {
        symbol: tokenResult.tokenInfo.symbol,
        name: tokenResult.tokenInfo.name,
        decimals: tokenResult.tokenInfo.decimals
      };
    }
    
    return {
      symbol: null,
      name: null,
      decimals: null
    };
  } catch (error) {
    console.warn('Failed to detect assistant share token:', error);
    return {
      symbol: null,
      name: null,
      decimals: null
    };
  }
};

/**
 * Generate unique assistant key based on assistant data
 * @param {Object} assistantConfig - Assistant configuration
 * @param {Object} existingAssistants - Existing assistants from settings
 * @returns {string} Unique assistant key
 */
export const generateAssistantKey = (assistantConfig, existingAssistants = {}) => {
  const { type, shareSymbol } = assistantConfig;
  
  if (!type || !shareSymbol) {
    return '';
  }
  
  // Create base key: SHARE_SYMBOL_TYPE_ASSISTANT
  const baseKey = `${shareSymbol.toUpperCase()}_${type.toUpperCase()}_ASSISTANT`;
  
  // Check if this key already exists
  const existingKeys = Object.keys(existingAssistants);
  
  // If key doesn't exist, use it
  if (!existingKeys.includes(baseKey)) {
    return baseKey;
  }
  
  // If key exists, add a number suffix
  let counter = 1;
  let newKey = `${baseKey}_${counter}`;
  
  while (existingKeys.includes(newKey)) {
    counter++;
    newKey = `${baseKey}_${counter}`;
  }
  
  return newKey;
};

/**
 * Generate assistant description
 * @param {string} type - Assistant type
 * @param {string} homeNetwork - Home network
 * @param {string} foreignNetwork - Foreign network
 * @param {string} tokenSymbol - Token symbol
 * @returns {string} Generated description
 */
export const generateAssistantDescription = (type, homeNetwork, foreignNetwork, tokenSymbol) => {
  const direction = type === 'export' ? '→' : '←';
  return `${homeNetwork} ${tokenSymbol} ${direction} ${foreignNetwork} ${type.charAt(0).toUpperCase() + type.slice(1)} Assistant`;
};

/**
 * Get bridge address from assistant contract
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantAddress - Assistant contract address
 * @returns {Promise<string>} Bridge address
 */
export const getBridgeAddressFromAssistant = async (provider, assistantAddress) => {
  try {
    // All assistant contracts have a public bridgeAddress variable
    const assistantContract = new ethers.Contract(assistantAddress, [
      'function bridgeAddress() view returns (address)'
    ], provider);
    
    const bridgeAddress = await assistantContract.bridgeAddress();
    return bridgeAddress;
  } catch (error) {
    console.error('Error getting bridge address from assistant:', error);
    throw new Error(`Failed to get bridge address from assistant: ${error.message}`);
  }
};

/**
 * Auto-detect assistant and aggregate all data
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantAddress - Assistant contract address
 * @param {string} networkSymbol - Network where assistant is deployed
 * @param {Object} existingAssistants - Existing assistants for uniqueness checking
 * @returns {Promise<Object>} Complete assistant configuration
 */
export const autoDetectAssistant = async (provider, assistantAddress, networkSymbol, existingAssistants = {}) => {
  try {
    // Get bridge address from assistant contract
    const bridgeAddress = await getBridgeAddressFromAssistant(provider, assistantAddress);
    
    // Now use the existing logic with the detected bridge address
    return await autoDetectAssistantWithBridge(provider, assistantAddress, bridgeAddress, networkSymbol, existingAssistants);

  } catch (error) {
    console.error('Error auto-detecting assistant:', error);
    return {
      success: false,
      assistantConfig: null,
      shareTokenInfo: null,
      message: error.message
    };
  }
};

/**
 * Auto-detect assistant with bridge address provided
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantAddress - Assistant contract address
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} networkSymbol - Network where assistant is deployed
 * @param {Object} existingAssistants - Existing assistants for uniqueness checking
 * @returns {Promise<Object>} Complete assistant configuration
 */
export const autoDetectAssistantWithBridge = async (provider, assistantAddress, bridgeAddress, networkSymbol, existingAssistants = {}) => {
  try {
    // Detect assistant type from bridge
    const assistantType = await detectAssistantType(provider, bridgeAddress);
    
    // Get bridge data based on type
    let bridgeData;
    let homeNetwork, foreignNetwork, tokenSymbol;
    
    switch (assistantType) {
      case ASSISTANT_TYPES.EXPORT:
        bridgeData = await getExportBridgeData(provider, bridgeAddress);
        homeNetwork = NETWORKS[networkSymbol]?.name || networkSymbol;
        foreignNetwork = bridgeData.foreignNetwork;
        tokenSymbol = 'Unknown'; // Would need to get from bridge data
        break;
        
      case ASSISTANT_TYPES.IMPORT:
        bridgeData = await getImportBridgeData(provider, bridgeAddress);
        homeNetwork = bridgeData.homeNetwork;
        foreignNetwork = NETWORKS[networkSymbol]?.name || networkSymbol;
        tokenSymbol = 'Unknown'; // Would need to get from bridge data
        break;
        
      case ASSISTANT_TYPES.IMPORT_WRAPPER:
        bridgeData = await getImportWrapperBridgeData(provider, bridgeAddress);
        homeNetwork = bridgeData.homeNetwork;
        foreignNetwork = NETWORKS[networkSymbol]?.name || networkSymbol;
        tokenSymbol = 'Unknown'; // Would need to get from bridge data
        break;
        
      default:
        throw new Error(`Unsupported assistant type: ${assistantType}`);
    }
    
    // Get share token information
    const shareTokenInfo = await getAssistantShareTokenInfo(provider, assistantAddress, networkSymbol);
    
    // Generate description
    const description = generateAssistantDescription(assistantType, homeNetwork, foreignNetwork, tokenSymbol);
    
    const assistantConfig = {
      address: assistantAddress,
      type: assistantType,
      bridgeAddress: bridgeAddress,
      description: description,
      shareSymbol: shareTokenInfo.symbol || `${assistantType.toUpperCase()}A`,
      shareName: shareTokenInfo.name || `${assistantType} assistant share`
    };
    
    // Generate unique assistant key
    const assistantKey = generateAssistantKey(assistantConfig, existingAssistants);
    assistantConfig.key = assistantKey;

    return {
      success: true,
      assistantConfig,
      shareTokenInfo,
      bridgeData,
      message: `Successfully detected ${assistantType} assistant`
    };

  } catch (error) {
    console.error('Error auto-detecting assistant with bridge:', error);
    return {
      success: false,
      assistantConfig: null,
      shareTokenInfo: null,
      bridgeData: null,
      message: error.message
    };
  }
};
