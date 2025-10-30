import { ethers } from 'ethers';
import { createBridgeContract } from './contract-factory';
import { autoDetectToken } from './token-detector';
import { NETWORKS } from '../config/networks';
import { hasBridgesRegistry, getAssistantInfoFromRegistry } from './update-bridge-info';

/**
 * Assistant type detection based on assistant contract
 */
export const ASSISTANT_TYPES = {
  EXPORT: 'export',
  EXPORT_WRAPPER: 'export_wrapper',
  IMPORT: 'import',
  IMPORT_WRAPPER: 'import_wrapper'
};

/**
 * Check if function selector exists in contract bytecode
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} contractAddress - Contract address
 * @param {string} functionSelector - Function selector (e.g., 'approvePrecompile()', 'approvePrecompile() external')
 * @returns {Promise<boolean>} True if function exists
 */
const hasFunctionSelector = async (provider, contractAddress, functionSelector) => {
  try {
    console.log(`  🔍 Looking for function selector: ${functionSelector}`);
    
    // Extract just the function signature (remove modifiers like 'external', 'onlyManager', etc.)
    // Pattern: extract function name and parameters, e.g., "approvePrecompile()"
    const functionMatch = functionSelector.match(/function\s+(\w+)\s*\([^)]*\)/);
    let cleanSignature = functionSelector;
    
    if (functionMatch) {
      // If it starts with "function", extract the signature
      cleanSignature = `function ${functionMatch[1]}()`;
    } else {
      // If it's already just the signature without "function" keyword, use as-is
      // Remove any modifiers by extracting just the function name and parentheses
      const simpleMatch = functionSelector.match(/(\w+)\s*\([^)]*\)/);
      if (simpleMatch) {
        cleanSignature = `function ${simpleMatch[1]}()`;
      }
    }
    
    console.log(`  🔍 Cleaned function signature: ${cleanSignature}`);
    
    // Method 1: Try interface creation with cleaned signature
    try {
      new ethers.Contract(contractAddress, [cleanSignature], provider);
      console.log(`  ✅ Function exists (interface creation successful): ${cleanSignature}`);
      return true;
    } catch (interfaceError) {
      if (interfaceError.message.includes('unsupported fragment')) {
        console.log(`  ⚠️ Interface creation failed, trying bytecode check...`);
      } else {
        console.log(`  ⚠️ Interface creation failed: ${interfaceError.message}`);
      }
    }
    
    // Method 2: Bytecode check (most reliable for detecting function existence)
    const selector = ethers.utils.id(cleanSignature).substring(0, 10);
    console.log(`  🔍 Function selector (4 bytes): ${selector}`);
    
    // Get contract bytecode
    const bytecode = await provider.getCode(contractAddress);
    if (!bytecode || bytecode === '0x') {
      console.log(`  ❌ Contract has no bytecode`);
      return false;
    }
    
    console.log(`  🔍 Contract bytecode length: ${bytecode.length}`);
    
    // Check if selector exists in bytecode
    const selectorWithoutPrefix = selector.substring(2); // Remove '0x' prefix
    const found = bytecode.includes(selectorWithoutPrefix);
    console.log(`  🔍 Looking for selector: ${selectorWithoutPrefix}`);
    console.log(`  🔍 Selector found in bytecode: ${found}`);
    
    if (found) {
      console.log(`  ✅ Function exists (bytecode check): ${cleanSignature}`);
      return true;
    }
    
    // Method 3: Try static call as last resort (will fail due to onlyManager modifier, but that's OK)
    try {
      const contract = new ethers.Contract(contractAddress, [cleanSignature], provider);
      const functionName = cleanSignature.match(/function\s+(\w+)/)?.[1];
      if (functionName) {
        await contract.callStatic[functionName]();
        console.log(`  ✅ Function exists (static call successful): ${cleanSignature}`);
        return true;
      }
    } catch (staticCallError) {
      // If it's an execution revert, the function exists but call failed
      if (staticCallError.message.includes('execution reverted') || 
          staticCallError.message.includes('call revert') ||
          staticCallError.message.includes('onlyManager') ||
          staticCallError.message.includes('caller is not the manager')) {
        console.log(`  ✅ Function exists (static call reverted as expected): ${cleanSignature}`);
        return true;
      }
      console.log(`  ⚠️ Static call failed: ${staticCallError.message}`);
    }
    
    console.log(`  ❌ Function not found: ${cleanSignature}`);
    return false;
  } catch (error) {
    console.error('Error checking function selector:', error);
    return false;
  }
};

/**
 * Detect assistant type by analyzing the assistant contract itself
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantAddress - Assistant contract address
 * @param {string} bridgeAddress - Bridge contract address
 * @returns {Promise<string>} Assistant type (export, export_wrapper, import, import_wrapper)
 */
export const detectAssistantType = async (provider, assistantAddress, bridgeAddress) => {
  try {
    console.log(`🔍 Detecting assistant type for address: ${assistantAddress}`);
    console.log(`🔍 Bridge address: ${bridgeAddress}`);
    
    // First, determine the bridge type to understand what kind of assistant this should be
    let bridgeType = null;
    
    // Check if it's an EXPORT bridge
    try {
      console.log(`  Checking if bridge is EXPORT type...`);
      const exportBridge = createBridgeContract(bridgeAddress, 'export', provider);
      await exportBridge.foreign_network();
      bridgeType = 'export';
      console.log(`  ✅ Bridge is EXPORT type`);
    } catch (error) {
      console.log(`  ❌ Not an EXPORT bridge: ${error.message}`);
    }
    
    // Check if it's an IMPORT_WRAPPER bridge
    // IMPORT_WRAPPER bridges have precompileAddress() method, while regular IMPORT bridges don't
    if (!bridgeType) {
      try {
        console.log(`  Checking if bridge is IMPORT_WRAPPER type...`);
        const importWrapperBridge = createBridgeContract(bridgeAddress, 'import_wrapper', provider);
        
        // First check if home_network() exists (both IMPORT and IMPORT_WRAPPER have this)
        await importWrapperBridge.home_network();
        
        // Then check if precompileAddress() exists (only IMPORT_WRAPPER has this)
        try {
          await importWrapperBridge.precompileAddress();
          bridgeType = 'import_wrapper';
          console.log(`  ✅ Bridge is IMPORT_WRAPPER type`);
        } catch (precompileError) {
          // If precompileAddress() doesn't exist, it's likely a regular IMPORT bridge
          console.log(`  ⚠️ home_network() exists but precompileAddress() doesn't - will check as regular IMPORT`);
        }
      } catch (error) {
        console.log(`  ❌ Not an IMPORT_WRAPPER bridge: ${error.message}`);
      }
    }
    
    // Check if it's an IMPORT bridge
    if (!bridgeType) {
      try {
        console.log(`  Checking if bridge is IMPORT type...`);
        const importBridge = createBridgeContract(bridgeAddress, 'import', provider);
        await importBridge.home_network();
        bridgeType = 'import';
        console.log(`  ✅ Bridge is IMPORT type`);
      } catch (error) {
        console.log(`  ❌ Not an IMPORT bridge: ${error.message}`);
      }
    }
    
    if (!bridgeType) {
      throw new Error('Unable to determine bridge type');
    }
    
    console.log(`🔍 Detected bridge type: ${bridgeType}`);
    
    // Now check if the assistant has approvePrecompile function to determine if it's a wrapper
    // Use the actual function signature from the ABI: "function approvePrecompile()"
    // IMPORTANT: We need to verify the function can actually be called, not just check bytecode
    const possibleSignatures = [
      'function approvePrecompile()', // Try the correct ABI format first
      'approvePrecompile()' // Fallback to simple format
    ];
    
    let hasApprovePrecompile = false;
    
    // Try direct contract call first (most reliable - verifies it actually works)
    // Regular ExportAssistant does NOT have approvePrecompile(), so we need to be strict
    try {
      const assistantContract = new ethers.Contract(assistantAddress, [
        'function approvePrecompile()'
      ], provider);
      // Try to call it - if it succeeds (even with a revert), the function exists
      // But we need to distinguish between "function doesn't exist" vs "function exists but reverts"
      try {
        // Try static call - if it succeeds without reverting, function definitely exists
        await assistantContract.callStatic.approvePrecompile();
        hasApprovePrecompile = true;
        console.log(`  ✅ Found approvePrecompile() via direct contract call (static call succeeded)`);
      } catch (staticError) {
        // If it reverts with onlyManager or similar, the function exists
        // But we need to be careful - if it's a CALL_EXCEPTION with empty data, function might not exist
        if (staticError.code === 'CALL_EXCEPTION' && 
            (!staticError.data || staticError.data === '0x')) {
          // Empty data usually means function doesn't exist
          console.log(`  ⚠️ approvePrecompile() call failed - function likely doesn't exist: ${staticError.message}`);
        } else if (staticError.message.includes('onlyManager') || 
                   staticError.message.includes('caller is not the manager') ||
                   staticError.message.includes('execution reverted')) {
          // Has revert reason - function exists but requires manager
          hasApprovePrecompile = true;
          console.log(`  ✅ Found approvePrecompile() via direct contract call (reverted as expected)`);
        } else {
          console.log(`  ⚠️ approvePrecompile() call failed: ${staticError.message}`);
        }
      }
    } catch (error) {
      console.log(`  ⚠️ approvePrecompile() not callable: ${error.message}`);
    }
    
    // Only check bytecode if direct call failed (fallback)
    if (!hasApprovePrecompile) {
      for (const signature of possibleSignatures) {
        console.log(`🔍 Checking signature: ${signature}`);
        const found = await hasFunctionSelector(provider, assistantAddress, signature);
        if (found) {
          // Double-check by trying to call it
          try {
            const assistantContract = new ethers.Contract(assistantAddress, [
              'function approvePrecompile()'
            ], provider);
            try {
              await assistantContract.callStatic.approvePrecompile();
              hasApprovePrecompile = true;
              console.log(`  ✅ Verified approvePrecompile() works (static call succeeded)`);
              break;
            } catch (staticError) {
              // Check if it's a CALL_EXCEPTION with empty data (function doesn't exist)
              if (staticError.code === 'CALL_EXCEPTION' && 
                  (!staticError.data || staticError.data === '0x')) {
                console.log(`  ⚠️ approvePrecompile() found in bytecode but not callable (function doesn't exist): ${staticError.message}`);
                continue; // Try next signature
              } else if (staticError.message.includes('onlyManager') || 
                        staticError.message.includes('caller is not the manager') ||
                        staticError.message.includes('execution reverted')) {
                hasApprovePrecompile = true;
                console.log(`  ✅ Verified approvePrecompile() works (reverted as expected)`);
                break;
              } else {
                console.log(`  ⚠️ approvePrecompile() found in bytecode but not callable: ${staticError.message}`);
              }
            }
          } catch (callError) {
            console.log(`  ⚠️ approvePrecompile() found in bytecode but not callable: ${callError.message}`);
          }
        }
      }
    }
    
    console.log(`🔍 Final result: hasApprovePrecompile = ${hasApprovePrecompile}`);
    
    // Also check if the assistant has precompileAddress() function (for Import Wrapper assistants)
    // ImportWrapperAssistant has precompileAddress() as a public variable
    // IMPORTANT: For IMPORT bridges, we need to actually verify the function can be called,
    // not just check if it exists in bytecode, as regular Import assistants might have
    // similar function signatures but not actually implement precompileAddress()
    let hasPrecompileAddress = false;
    
    // Try direct contract call first (most reliable - verifies it actually works)
    try {
      const assistantContract = new ethers.Contract(assistantAddress, [
        'function precompileAddress() view returns (address)'
      ], provider);
      const precompileAddr = await assistantContract.precompileAddress();
      // Verify it returns a valid address (not zero address)
      if (precompileAddr && precompileAddr !== ethers.constants.AddressZero) {
        hasPrecompileAddress = true;
        console.log(`  ✅ Found precompileAddress() via direct contract call: ${precompileAddr}`);
      } else {
        console.log(`  ⚠️ precompileAddress() returns zero address, not a valid ImportWrapper assistant`);
      }
    } catch (error) {
      console.log(`  ⚠️ precompileAddress() not callable: ${error.message}`);
    }
    
    // Only check bytecode if direct call failed (fallback)
    if (!hasPrecompileAddress) {
      const precompileAddressSignatures = [
        'function precompileAddress() view returns (address)',
        'function precompileAddress() returns (address)',
        'function precompileAddress()'
      ];
      
      for (const signature of precompileAddressSignatures) {
        console.log(`🔍 Checking for precompileAddress() in bytecode: ${signature}`);
        const found = await hasFunctionSelector(provider, assistantAddress, signature);
        if (found) {
          // Double-check by trying to call it
          try {
            const assistantContract = new ethers.Contract(assistantAddress, [
              'function precompileAddress() view returns (address)'
            ], provider);
            const precompileAddr = await assistantContract.precompileAddress();
            if (precompileAddr && precompileAddr !== ethers.constants.AddressZero) {
              hasPrecompileAddress = true;
              console.log(`  ✅ Verified precompileAddress() works: ${precompileAddr}`);
              break;
            }
          } catch (callError) {
            console.log(`  ⚠️ precompileAddress() found in bytecode but not callable: ${callError.message}`);
          }
        }
      }
    }
    
    console.log(`🔍 Final result: hasPrecompileAddress = ${hasPrecompileAddress}`);
    
    // Determine assistant type based on bridge type and function checks
    if (bridgeType === 'export') {
      // Regular ExportAssistant DOES have approvePrecompile()
      // Export Wrapper assistants do NOT have approvePrecompile()
      // So if approvePrecompile() exists and can be called, it's a regular Export
      if (hasApprovePrecompile) {
        console.log(`  ✅ Regular EXPORT assistant detected! (has approvePrecompile)`);
        return ASSISTANT_TYPES.EXPORT;
      } else {
        console.log(`  ✅ EXPORT_WRAPPER assistant detected!`);
        return 'export_wrapper';
      }
    } else if (bridgeType === 'import_wrapper') {
      // For import_wrapper bridges, the assistant is always import_wrapper type
      // regardless of whether it has approvePrecompile function
      console.log(`  ✅ IMPORT_WRAPPER assistant detected!`);
      return 'import_wrapper';
    } else if (bridgeType === 'import') {
      // For IMPORT bridges, only classify as IMPORT_WRAPPER if precompileAddress() can actually be called
      // Regular Import assistants might have approvePrecompile() but not precompileAddress()
      // The presence of precompileAddress() that can be called is the key differentiator
      if (hasPrecompileAddress) {
        console.log(`  ✅ IMPORT_WRAPPER assistant detected! (has precompileAddress: ${hasPrecompileAddress})`);
        return 'import_wrapper';
      } else if (hasApprovePrecompile) {
        // If it has approvePrecompile but not precompileAddress, it might still be an ImportWrapper
        // but we'll be conservative and check if precompileAddress exists on the bridge
        // Actually, let's be more conservative: if only approvePrecompile exists, treat as regular IMPORT
        console.log(`  ⚠️ Has approvePrecompile() but not precompileAddress() - treating as regular IMPORT`);
        console.log(`  ✅ Regular IMPORT assistant detected!`);
        return ASSISTANT_TYPES.IMPORT;
      } else {
        console.log(`  ✅ Regular IMPORT assistant detected!`);
        return ASSISTANT_TYPES.IMPORT;
      }
    }
    
    throw new Error(`Unable to determine assistant type for bridge type: ${bridgeType}`);
    
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
    const contract = createBridgeContract(bridgeAddress, 'export', provider);
    
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
    const contract = createBridgeContract(bridgeAddress, 'import', provider);
    
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
    const contract = createBridgeContract(bridgeAddress, 'import_wrapper', provider);
    
    // Try to get home_network and home_asset first (these should always exist)
    const [homeNetwork, homeAsset] = await Promise.all([
      contract.home_network(),
      contract.home_asset()
    ]);
    
    // Try to get precompileAddress, but don't fail if it doesn't exist
    let precompileAddress = null;
    try {
      precompileAddress = await contract.precompileAddress();
    } catch (error) {
      console.warn(`⚠️ precompileAddress() not available on ImportWrapper bridge ${bridgeAddress}, continuing without it`);
      // This is okay - some ImportWrapper bridges might not have this method
    }
    
    // Try to get settings
    let settings = null;
    try {
      settings = await contract.settings();
    } catch (error) {
      console.warn(`⚠️ settings() not available on ImportWrapper bridge ${bridgeAddress}, continuing without it`);
      // This is okay - settings might not be needed
    }

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
 * @param {Object} settings - Optional settings for custom token lookup
 * @returns {Promise<Object>} Share token information
 */
export const getAssistantShareTokenInfo = async (provider, assistantAddress, networkSymbol, settings = null) => {
  try {
    const tokenResult = await autoDetectToken(provider, assistantAddress, networkSymbol, settings);
    
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
export const generateAssistantDescription = (type, homeNetwork, foreignNetwork, shareSymbol) => {
  // Direction is always from home network to foreign network
  const direction = '→';
  // Use shareSymbol if provided, otherwise just show the direction without symbol
  const symbolPart = shareSymbol ? ` ${shareSymbol}` : '';
  return `${homeNetwork} ${direction} ${foreignNetwork}${symbolPart} ${type.charAt(0).toUpperCase() + type.slice(1)} Assistant`;
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
 * Get manager address from assistant contract
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantAddress - Assistant contract address
 * @returns {Promise<string>} Manager address
 */
export const getManagerAddressFromAssistant = async (provider, assistantAddress) => {
  try {
    // Assistant contracts have a public managerAddress variable
    const assistantContract = new ethers.Contract(assistantAddress, [
      'function managerAddress() view returns (address)'
    ], provider);
    
    const managerAddress = await assistantContract.managerAddress();
    return managerAddress;
  } catch (error) {
    console.error('Error getting manager address from assistant:', error);
    // Return null if manager address is not available
    return null;
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
export const autoDetectAssistant = async (provider, assistantAddress, networkSymbol, existingAssistants = {}, settings = null) => {
  try {
    // Get bridge address from assistant contract
    const bridgeAddress = await getBridgeAddressFromAssistant(provider, assistantAddress);
    
    // Now use the existing logic with the detected bridge address
    return await autoDetectAssistantWithBridge(provider, assistantAddress, bridgeAddress, networkSymbol, existingAssistants, settings);

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
export const autoDetectAssistantWithBridge = async (provider, assistantAddress, bridgeAddress, networkSymbol, existingAssistants = {}, settings = null) => {
  try {
    // Detect assistant type from assistant contract
    const assistantType = await detectAssistantType(provider, assistantAddress, bridgeAddress);
    
    // Get bridge data based on type
    let bridgeData;
    let homeNetwork, foreignNetwork;
    
    switch (assistantType) {
      case ASSISTANT_TYPES.EXPORT:
        bridgeData = await getExportBridgeData(provider, bridgeAddress);
        homeNetwork = NETWORKS[networkSymbol]?.name || networkSymbol;
        foreignNetwork = bridgeData.foreignNetwork;
        break;
        
      case ASSISTANT_TYPES.EXPORT_WRAPPER:
        bridgeData = await getExportBridgeData(provider, bridgeAddress);
        homeNetwork = NETWORKS[networkSymbol]?.name || networkSymbol;
        foreignNetwork = bridgeData.foreignNetwork;
        break;
        
      case ASSISTANT_TYPES.IMPORT:
        bridgeData = await getImportBridgeData(provider, bridgeAddress);
        homeNetwork = bridgeData.homeNetwork;
        foreignNetwork = NETWORKS[networkSymbol]?.name || networkSymbol;
        break;
        
      case ASSISTANT_TYPES.IMPORT_WRAPPER:
        bridgeData = await getImportWrapperBridgeData(provider, bridgeAddress);
        homeNetwork = bridgeData.homeNetwork;
        foreignNetwork = NETWORKS[networkSymbol]?.name || networkSymbol;
        break;
        
      default:
        throw new Error(`Unsupported assistant type: ${assistantType}`);
    }
    
    // Get share token information
    const shareTokenInfo = await getAssistantShareTokenInfo(provider, assistantAddress, networkSymbol, settings);
    
    // Get manager address from assistant contract
    const managerAddress = await getManagerAddressFromAssistant(provider, assistantAddress);
    
    // Generate description using the share symbol
    const description = generateAssistantDescription(assistantType, homeNetwork, foreignNetwork, shareTokenInfo.symbol);
    
    const assistantConfig = {
      address: assistantAddress,
      type: assistantType,
      bridgeAddress: bridgeAddress,
      managerAddress: managerAddress,
      description: description,
      shareSymbol: shareTokenInfo.symbol || `${assistantType.toUpperCase()}A`,
      shareName: shareTokenInfo.name || `${assistantType} assistant share`
    };
    
    // Generate unique assistant key
    const assistantKey = generateAssistantKey(assistantConfig, existingAssistants);
    assistantConfig.key = assistantKey;

    // Try to fetch createdAt from bridge registry if available
    let createdAt = null;
    if (hasBridgesRegistry(networkSymbol)) {
      try {
        const networkConfig = NETWORKS[networkSymbol];
        const registryAddress = networkConfig.contracts.bridgesRegistry;
        console.log(`🔍 Fetching createdAt from bridge registry for assistant: ${registryAddress}`);
        
        const registryInfo = await getAssistantInfoFromRegistry(provider, registryAddress, assistantAddress);
        if (registryInfo && registryInfo.createdAt) {
          createdAt = registryInfo.createdAt;
          console.log(`✅ Fetched createdAt from registry for assistant: ${createdAt} (${new Date(createdAt * 1000).toISOString()})`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch createdAt from registry for assistant: ${error.message}`);
        // Don't fail the entire detection if registry lookup fails
      }
    }

    // Add createdAt to assistant config if available
    if (createdAt) {
      assistantConfig.createdAt = createdAt;
    }

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
