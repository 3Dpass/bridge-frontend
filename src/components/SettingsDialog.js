import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { autoDetectToken, isNativeToken } from '../utils/token-detector';
import { autoDetectBridge } from '../utils/bridge-detector';
import { autoDetectAssistant } from '../utils/assistant-detector';
import { updateBridgeInfoFromRegistry, hasBridgesRegistry } from '../utils/update-bridge-info';
import { validateOracleContract } from '../utils/bridge-detector';
import { getProvider, updateProviderSettings } from '../utils/provider-manager';
import { getNetworkWithSettings } from '../utils/settings';
import { 
  Settings, 
  Network, 
  Save, 
  RotateCcw, 
  X,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Coins,
  Link,
  Users,
  RefreshCw
} from 'lucide-react';
import CreateNewAssistant from './CreateNewAssistant';
import CreateNewBridge from './CreateNewBridge';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const SettingsDialog = ({ isOpen, onClose }) => {
  const { network } = useWeb3();
  const { 
    settings, 
    saveSettings, 
    updateNetworkSetting, 
    updateContractAddress,
    addCustomToken,
    removeCustomToken,
    addCustomBridgeInstanceForNetwork,
    removeCustomBridgeInstanceForNetwork,
    addCustomAssistantContractForNetwork,
    removeCustomAssistantContractForNetwork,
    updateOracle,
    removeOracle,
    resetSettings,
    validateTokenConfig,
    getBridgeInstancesWithSettings,
    getAssistantContractsWithSettings,
    getHistorySearchDepth,
    updateHistorySearchDepth,
    getClaimSearchDepth,
    updateClaimSearchDepth
  } = useSettings();
  const [copiedField, setCopiedField] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddToken, setShowAddToken] = useState({});
  const [newToken, setNewToken] = useState({});
  const [showAddBridge, setShowAddBridge] = useState({});
  const [newBridge, setNewBridge] = useState({});
  const [showAddAssistant, setShowAddAssistant] = useState({});
  const [newAssistant, setNewAssistant] = useState({});
  const [detectedTokens, setDetectedTokens] = useState({});
  const [showCreateAssistant, setShowCreateAssistant] = useState({});
  const [showCreateBridge, setShowCreateBridge] = useState({});
  const [showAddOracle, setShowAddOracle] = useState({});
  const [newOracle, setNewOracle] = useState({});

  // Check if an oracle with given address already exists
  const findExistingOracleByAddress = (networkKey, oracleAddress) => {
    const networkWithSettings = getNetworkWithSettings(networkKey);
    const existingOracles = networkWithSettings?.oracles || {};
    
    return Object.keys(existingOracles).find(key => 
      existingOracles[key].address.toLowerCase() === oracleAddress.toLowerCase()
    );
  };

  // Get all tokens with settings (local function)
  const getTokensWithSettings = () => {
    const allTokens = {};
    
    Object.entries(NETWORKS).forEach(([networkKey, networkConfig]) => {
      // Add config tokens
      if (networkConfig.tokens) {
        Object.entries(networkConfig.tokens).forEach(([tokenKey, tokenConfig]) => {
          allTokens[tokenKey] = {
            ...tokenConfig,
            isConfigToken: true
          };
        });
      }
      
      // Add custom tokens from settings
      if (settings[networkKey]?.tokens) {
        Object.entries(settings[networkKey].tokens).forEach(([tokenKey, tokenConfig]) => {
          allTokens[tokenKey] = {
            ...tokenConfig,
            isConfigToken: false
          };
        });
      }
    });
    
    return allTokens;
  };

  // Update provider manager when settings change
  useEffect(() => {
    updateProviderSettings(settings);
  }, [settings]);

  // Auto-check up-to-date status for existing bridges when dialog opens
  useEffect(() => {
    if (isOpen) {
      const checkExistingBridgesStatus = async () => {
        const allBridges = getBridgeInstancesWithSettings();
        console.log('🔍 Starting automatic bridge status check for:', Object.keys(allBridges));
        
        for (const [networkKey, networkBridges] of Object.entries(allBridges)) {
          for (const [bridgeKey, bridgeConfig] of Object.entries(networkBridges)) {
            // Skip if bridgeConfig is null or undefined
            if (!bridgeConfig) {
              console.log(`🔍 Skipping ${bridgeKey} on ${networkKey}: bridgeConfig is null/undefined`);
              continue;
            }
            
            // Only check bridges that don't have upToDate status set or have failed detection
            if ((bridgeConfig.upToDate === undefined || bridgeConfig.upToDate === null) && bridgeConfig.address) {
              console.log(`🔍 Checking ${bridgeKey} (${bridgeConfig.address}) on ${networkKey}`);
              try {
                const networkProvider = getProvider(networkKey);
                console.log(`🔍 Using provider for ${networkKey}:`, networkProvider.connection.url);
                
                const result = await autoDetectBridge(networkProvider, bridgeConfig.address, networkKey, settings);
                console.log(`🔍 Detection result for ${bridgeKey}:`, result);
                
                if (result.success) {
                  // Handle oracle addition if needed
                  if (result.bridgeConfig.oracleNeedsAddition) {
                    console.log(`🔍 Adding new oracle to settings:`, result.bridgeConfig.oracleNeedsAddition);
                    const { key, address, name, description } = result.bridgeConfig.oracleNeedsAddition;
                    
                    // Add the oracle to settings
                    updateOracle(networkKey, key, {
                      address,
                      name,
                      description
                    });
                    
                    // Remove the oracleNeedsAddition flag from bridge config
                    delete result.bridgeConfig.oracleNeedsAddition;
                  }
                  
                  const comparison = compareBridgeData(bridgeConfig, result.bridgeConfig);
                  const upToDate = !comparison.hasDifferences;
                  
                  // Update the bridge configuration with the new upToDate status
                  addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
                    ...bridgeConfig,
                    upToDate: upToDate,
                  });
                  
                  console.log(`🔍 Auto-checked ${bridgeKey}: ${upToDate ? 'Up to date' : 'Needs update'}`);
                } else if (result.invalidOracle) {
                  console.error(`🔍 Bridge has invalid oracle: ${result.message}`);
                  // Mark bridge as invalid due to oracle issues
                  addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
                    ...bridgeConfig,
                    upToDate: false,
                    invalidOracle: true,
                    oracleError: result.message
                  });
                } else {
                  console.warn(`🔍 Bridge detection failed for ${bridgeKey}:`, result.message);
                  // Set status as unknown to avoid repeated failed attempts
                  addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
                    ...bridgeConfig,
                    upToDate: null, // null means detection failed
                  });
                }
              } catch (error) {
                console.error(`Error checking ${bridgeKey} status:`, error);
                // Set status as unknown to avoid repeated failed attempts
                addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
                  ...bridgeConfig,
                  upToDate: null, // null means detection failed
                });
              }
            }
          }
        }
      };
      
      // Run the check after a short delay to avoid blocking the UI
      setTimeout(checkExistingBridgesStatus, 1000);
    }
  }, [isOpen, settings, addCustomBridgeInstanceForNetwork, getBridgeInstancesWithSettings, updateOracle]);

  // Generate unique bridge key based on detected bridge data
  const generateBridgeKey = (bridgeConfig, networkKey) => {
    const { homeTokenSymbol, foreignTokenSymbol, type } = bridgeConfig;
    
    if (!homeTokenSymbol || !foreignTokenSymbol || !type) {
      return '';
    }
    
    // Create base key: HOME_TOKEN_FOREIGN_TOKEN_TYPE
    const baseKey = `${homeTokenSymbol.toUpperCase()}_${foreignTokenSymbol.toUpperCase()}_${type.toUpperCase()}`;
    
    // Check if this key already exists in settings
    const existingBridges = getBridgeInstancesWithSettings();
    const existingKeys = Object.keys(existingBridges);
    
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

  // Generate unique assistant key based on detected assistant data
  const generateAssistantKey = (assistantConfig, networkKey) => {
    const { shareSymbol, type } = assistantConfig;
    
    if (!shareSymbol || !type) {
      return '';
    }
    
    // Create base key: SHARE_SYMBOL_TYPE_ASSISTANT
    const baseKey = `${shareSymbol.toUpperCase()}_${type.toUpperCase()}_ASSISTANT`;
    
    // Check if this key already exists in settings
    const existingAssistants = getAssistantContractsWithSettings();
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

  // Save settings to localStorage
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const result = await saveSettings(settings);
      if (result.success) {
        toast.success('Settings saved successfully!');
        onClose();
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset settings to defaults
  const handleResetSettings = () => {
    const result = resetSettings();
    if (result.success) {
      toast.success('Settings reset to defaults');
    } else {
      toast.error('Failed to reset settings');
    }
  };

  // Copy field to clipboard
  const copyToClipboard = async (text, fieldName) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success(`${fieldName} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Validate RPC URL
  const validateRpcUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Validate contract address
  const validateContractAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Validate token address (supports both regular and 3DPass precompile addresses)
  const validateTokenAddress = (address) => {
    // Regular Ethereum-style address
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return true;
    }
    
    // 3DPass precompile address format
    if (/^0x[a-fA-F0-9]{40}$/.test(address) && address.startsWith('0x000000000000000000000000000000000000')) {
      return true;
    }
    
    // 3DPass wrapped token format (like 0xfBFBfbFA000000000000000000000000000000de)
    if (/^0x[a-fA-F0-9]{40}$/.test(address) && address.startsWith('0x')) {
      return true;
    }
    
    return false;
  };

  // Handle adding a new token
  const handleAddToken = (networkKey) => {
    const token = newToken[networkKey];
    if (!token || !token.symbol || !token.address || !token.name || !token.decimals) {
      toast.error('Please fill in all token fields');
      return;
    }

    if (!validateTokenAddress(token.address)) {
      toast.error('Invalid token address');
      return;
    }

    // Determine the correct symbol to use
    let tokenSymbol = token.symbol;
    
    // If this is an update to an existing token, find the existing symbol
    if (token.alreadyExists) {
      const existingTokens = getTokensWithSettings();
      const existingToken = Object.values(existingTokens).find(existing => 
        existing.address.toLowerCase() === token.address.toLowerCase()
      );
      
      if (existingToken) {
        // Find the symbol for this existing token
        const existingSymbol = Object.keys(existingTokens).find(symbol => 
          existingTokens[symbol].address.toLowerCase() === token.address.toLowerCase()
        );
        if (existingSymbol) {
          tokenSymbol = existingSymbol;
        }
      }
    }

    const tokenConfig = {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: parseInt(token.decimals),
      standard: token.standard || 'ERC20',
      isNative: isNativeToken(token.address, networkKey), // Automatically determined based on address and network
      isPrecompile: NETWORKS[networkKey]?.erc20Precompile ? (token.isPrecompile || false) : false, // Only for networks that support precompiles
      isTestToken: token.isTestToken || false,
      ...(NETWORKS[networkKey]?.erc20Precompile && { assetId: token.assetId || null }), // Only include assetId for networks that support precompiles
      upToDate: true, // Mark as up to date after update
    };

    if (!validateTokenConfig(tokenConfig)) {
      toast.error('Invalid token configuration');
      return;
    }

    addCustomToken(networkKey, tokenSymbol, tokenConfig);

    setNewToken(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddToken(prev => ({ ...prev, [networkKey]: false }));
    setDetectedTokens(prev => ({ ...prev, [networkKey]: false }));
    
    if (token.alreadyExists) {
      toast.success(`Token ${tokenSymbol} updated successfully`);
    } else {
      toast.success(`Token ${tokenSymbol} added successfully`);
    }
  };

  // Handle removing a token
  const handleRemoveToken = (networkKey, tokenSymbol) => {
    // Check if this is a native token (from config)
    const configToken = NETWORKS[networkKey]?.tokens?.[tokenSymbol];
    if (configToken?.isNative) {
      toast.error(`Cannot remove native token ${tokenSymbol}`);
      return;
    }
    
    // Check if this is a native token (from settings)
    const settingsToken = settings[networkKey]?.tokens?.[tokenSymbol];
    if (settingsToken?.isNative) {
      toast.error(`Cannot remove native token ${tokenSymbol}`);
      return;
    }
    
    removeCustomToken(networkKey, tokenSymbol);
    toast.success(`Token ${tokenSymbol} removed successfully`);
  };

  // Handle adding a new oracle
  const handleAddOracle = (networkKey) => {
    const oracle = newOracle[networkKey];
    if (!oracle || !oracle.key || !oracle.address || !oracle.name) {
      toast.error('Please fill in all oracle fields');
      return;
    }

    if (!validateContractAddress(oracle.address)) {
      toast.error('Invalid oracle address');
      return;
    }

    // Check if an oracle with this address already exists
    const existingOracleKey = findExistingOracleByAddress(networkKey, oracle.address);

    let finalOracleKey = oracle.key;
    let isUpdate = false;

    if (existingOracleKey) {
      // Update existing oracle instead of creating duplicate
      finalOracleKey = existingOracleKey;
      isUpdate = true;
      console.log(`🔄 Updating existing oracle ${existingOracleKey} with address ${oracle.address}`);
    } else {
      console.log(`➕ Adding new oracle ${oracle.key} with address ${oracle.address}`);
    }

    updateOracle(networkKey, finalOracleKey, {
      address: oracle.address,
      name: oracle.name,
      description: oracle.description || '',
    });

    setNewOracle(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddOracle(prev => ({ ...prev, [networkKey]: false }));
    
    toast.success(`Oracle ${finalOracleKey} ${isUpdate ? 'updated' : 'added'} successfully`);
  };

  // Handle removing an oracle
  const handleRemoveOracle = (networkKey, oracleKey) => {
    removeOracle(networkKey, oracleKey);
    toast.success(`Oracle ${oracleKey} removed successfully`);
  };

  // Handle adding a new bridge instance
  const handleAddBridge = (networkKey) => {
    const bridge = newBridge[networkKey];
    if (!bridge || !bridge.key || !bridge.address || !bridge.type || !bridge.homeNetwork || 
        !bridge.homeTokenSymbol || !bridge.foreignNetwork || !bridge.foreignTokenSymbol ||
        !bridge.homeTokenAddress || !bridge.foreignTokenAddress || !bridge.stakeTokenAddress) {
      toast.error('Please fill in all bridge fields including token addresses');
      return;
    }

    if (!validateContractAddress(bridge.address)) {
      toast.error('Invalid bridge address');
      return;
    }

    // Validate token addresses (all required)
    if (!validateTokenAddress(bridge.homeTokenAddress)) {
      toast.error('Invalid home token address');
      return;
    }

    if (!validateTokenAddress(bridge.foreignTokenAddress)) {
      toast.error('Invalid foreign token address');
      return;
    }

    if (!validateTokenAddress(bridge.stakeTokenAddress)) {
      toast.error('Invalid stake token address');
      return;
    }

    // Determine the correct key to use
    let bridgeKey = bridge.key;
    
    // If this is an update to an existing bridge, find the existing key
    if (bridge.alreadyExists) {
      const existingBridges = getBridgeInstancesWithSettings();
      const existingBridge = Object.values(existingBridges).find(existing => 
        existing.address.toLowerCase() === bridge.address.toLowerCase()
      );
      
      if (existingBridge) {
        // Find the key for this existing bridge
        const existingKey = Object.keys(existingBridges).find(key => 
          existingBridges[key].address.toLowerCase() === bridge.address.toLowerCase()
        );
        if (existingKey) {
          bridgeKey = existingKey;
        }
      }
    }

    addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
      address: bridge.address,
      type: bridge.type,
      homeNetwork: bridge.homeNetwork,
      homeTokenSymbol: bridge.homeTokenSymbol,
      homeTokenAddress: bridge.homeTokenAddress,
      foreignNetwork: bridge.foreignNetwork,
      foreignTokenSymbol: bridge.foreignTokenSymbol,
      foreignTokenAddress: bridge.foreignTokenAddress,
      stakeTokenSymbol: bridge.stakeTokenSymbol || 'P3D',
      stakeTokenAddress: bridge.stakeTokenAddress,
      description: bridge.description || `${bridge.homeTokenSymbol} ${bridge.type} Bridge`,
      upToDate: true, // Mark as up to date after update
    });

    setNewBridge(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddBridge(prev => ({ ...prev, [networkKey]: false }));
    
    if (bridge.alreadyExists) {
      toast.success(`Bridge ${bridgeKey} updated successfully`);
    } else {
      toast.success(`Bridge ${bridgeKey} added successfully`);
    }
  };

  // Check if bridge already exists in settings/config
  const isBridgeAlreadyExists = (networkKey, bridgeAddress) => {
    if (!bridgeAddress) return false;
    
    // Settings always take priority over config
    // Check in custom settings bridges first
    const customBridges = settings[networkKey]?.bridges || {};
    const existingInSettings = Object.values(customBridges).some(bridge => 
      bridge.address.toLowerCase() === bridgeAddress.toLowerCase()
    );
    
    // If it exists in settings, it's already there (user's choice)
    if (existingInSettings) {
      return true;
    }
    
    // If custom bridges are enabled, allow adding any bridge (including config bridges)
    // This allows users to re-add bridges they previously removed
    if (settings[networkKey]?.customBridges) {
      return false;
    }
    
    return false;
  };



  // Compare bridge data to detect differences
  const compareBridgeData = (existingBridge, detectedBridge) => {
    console.log(`🔍 Comparing bridge data:`, {
      existing: existingBridge,
      detected: detectedBridge
    });
    
    const fieldsToCompare = [
      'type',
      'homeNetwork',
      'homeTokenSymbol',
      'homeTokenAddress',
      'foreignNetwork',
      'foreignTokenSymbol',
      'foreignTokenAddress',
      'stakeTokenSymbol',
      'stakeTokenAddress',
      'oracleAddress'
    ];
    
    const differences = {};
    let hasDifferences = false;
    
    for (const field of fieldsToCompare) {
      let existingValue = existingBridge[field];
      let detectedValue = detectedBridge[field];
      
      // Special handling for oracleAddress field
      if (field === 'oracleAddress') {
        // For export bridges, both null and undefined should be considered equivalent
        if (existingBridge.type === 'export' || detectedBridge.type === 'export') {
          // Normalize null/undefined to null for export bridges
          existingValue = existingValue || null;
          detectedValue = detectedValue || null;
        }
      }
      
      if (existingValue !== detectedValue) {
        differences[field] = true;
        hasDifferences = true;
        console.log(`🔍 Bridge data mismatch in ${field}: existing="${existingValue}" (${typeof existingValue}) vs detected="${detectedValue}" (${typeof detectedValue})`);
      } else {
        differences[field] = false;
        console.log(`✅ Bridge data match in ${field}: "${existingValue}"`);
      }
    }
    
    console.log(`🔍 Bridge comparison result: hasDifferences=${hasDifferences}`, differences);
    
    return {
      hasDifferences,
      differences
    };
  };

  // Check if assistant already exists in settings/config
  const isAssistantAlreadyExists = (networkKey, assistantAddress) => {
    if (!assistantAddress) return false;
    
    // Settings always take priority over config
    // Check in custom settings assistants first
    const customAssistants = settings[networkKey]?.assistants || {};
    const existingInSettings = Object.values(customAssistants).some(assistant => 
      assistant.address.toLowerCase() === assistantAddress.toLowerCase()
    );
    
    // If it exists in settings, it's already there (user's choice)
    if (existingInSettings) {
      return true;
    }
    
    // If custom assistants are enabled, allow adding any assistant (including config assistants)
    // This allows users to re-add assistants they previously removed
    if (settings[networkKey]?.customAssistants) {
      return false;
    }
    
    return false;
  };

  // Check if token already exists in settings/config
  const isTokenAlreadyExists = (networkKey, tokenAddress) => {
    if (!tokenAddress) return false;
    
    console.log(`🔍 Checking if token ${tokenAddress} exists in ${networkKey}`);
    
    // Settings always take priority over config
    // Check in custom settings tokens first
    const customTokens = settings[networkKey]?.tokens || {};
    const existingInSettings = Object.values(customTokens).some(token => 
      token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    
    console.log(`🔍 Token exists in settings: ${existingInSettings}`);
    console.log(`🔍 Custom tokens enabled: ${settings[networkKey]?.customTokens}`);
    
    // If it exists in settings, it's already there (user's choice)
    if (existingInSettings) {
      console.log(`🔍 Token found in settings - returning true`);
      return true;
    }
    
    // If custom tokens are enabled, allow adding any token (including config tokens)
    // This allows users to re-add tokens they previously removed
    if (settings[networkKey]?.customTokens) {
      console.log(`🔍 Custom tokens enabled - allowing token addition`);
      return false;
    }
    
    console.log(`🔍 Token not found anywhere - returning false`);
    return false;
  };





  // Compare assistant data to detect differences
  const compareAssistantData = (existingAssistant, detectedAssistant) => {
    const fieldsToCompare = [
      'type',
      'bridgeAddress',
      'shareSymbol',
      'shareName',
      'managerAddress'
    ];
    
    const differences = {};
    let hasDifferences = false;
    
    for (const field of fieldsToCompare) {
      const existingValue = existingAssistant[field];
      const detectedValue = detectedAssistant[field];
      
      if (existingValue !== detectedValue) {
        differences[field] = true;
        hasDifferences = true;
        console.log(`🔍 Assistant data mismatch in ${field}: existing="${existingValue}" vs detected="${detectedValue}"`);
      } else {
        differences[field] = false;
      }
    }
    
    return {
      hasDifferences,
      differences
    };
  };

  // Compare token data to detect differences
  const compareTokenData = (existingToken, detectedToken) => {
    const fieldsToCompare = [
      'symbol',
      'name',
      'decimals',
      'standard',
      'isPrecompile',
      'isTestToken',
      'assetId'
    ];
    
    const differences = {};
    let hasDifferences = false;
    
    for (const field of fieldsToCompare) {
      const existingValue = existingToken[field];
      const detectedValue = detectedToken[field];
      
      // Handle type conversions for specific fields
      let existingValueToCompare = existingValue;
      let detectedValueToCompare = detectedValue;
      
      if (field === 'decimals') {
        // Convert both to numbers for comparison
        existingValueToCompare = parseInt(existingValue) || 0;
        detectedValueToCompare = parseInt(detectedValue) || 0;
      } else if (field === 'assetId') {
        // Convert both to numbers for comparison
        existingValueToCompare = parseInt(existingValue) || null;
        detectedValueToCompare = parseInt(detectedValue) || null;
      } else if (field === 'isPrecompile' || field === 'isTestToken') {
        // Convert both to booleans for comparison
        existingValueToCompare = Boolean(existingValue);
        detectedValueToCompare = Boolean(detectedValue);
      }
      
      if (existingValueToCompare !== detectedValueToCompare) {
        differences[field] = true;
        hasDifferences = true;
        console.log(`🔍 Token data mismatch in ${field}: existing="${existingValue}" (${typeof existingValue}) vs detected="${detectedValue}" (${typeof detectedValue})`);
      } else {
        differences[field] = false;
      }
    }
    
    return {
      hasDifferences,
      differences
    };
  };

  // Update "Up to date" status for existing bridges
  const updateBridgeUpToDateStatus = async (networkKey, bridgeKey, bridgeConfig) => {
    try {
      const networkProvider = getProvider(networkKey);
      const result = await autoDetectBridge(networkProvider, bridgeConfig.address, networkKey, settings);
      
      if (result.success) {
        // Check if this is a config bridge or custom bridge
        const originalConfigBridge = NETWORKS[networkKey]?.bridges?.[bridgeKey];
        const isConfigBridge = !!originalConfigBridge;
        const isCustomBridge = !!settings[networkKey]?.bridges?.[bridgeKey];
        
        let comparison;
        
        if (isConfigBridge && !isCustomBridge) {
          // Config bridge that hasn't been modified: compare with original config
          comparison = compareBridgeData(originalConfigBridge, result.bridgeConfig);
        } else {
          // Custom bridge or modified config bridge: compare with current stored data
          comparison = compareBridgeData(bridgeConfig, result.bridgeConfig);
        }
        
        const upToDate = !comparison.hasDifferences;
        
        // Update the bridge configuration with the new upToDate status
        addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
          ...bridgeConfig,
          upToDate: upToDate,
        });
        
        return upToDate;
      }
    } catch (error) {
      console.error('Error updating bridge up-to-date status:', error);
    }
    
    return false;
  };

  // Update "Up to date" status for existing assistants
  const updateAssistantUpToDateStatus = async (networkKey, assistantKey, assistantConfig) => {
    try {
      const networkProvider = getProvider(networkKey);
      const result = await autoDetectAssistant(networkProvider, assistantConfig.address, networkKey, settings);
      
      if (result.success) {
        // Check if this is a config assistant or custom assistant
        const originalConfigAssistant = NETWORKS[networkKey]?.assistants?.[assistantKey];
        const isConfigAssistant = !!originalConfigAssistant;
        const isCustomAssistant = !!settings[networkKey]?.assistants?.[assistantKey];
        
        let comparison;
        
        if (isConfigAssistant && !isCustomAssistant) {
          // Config assistant that hasn't been modified: compare with original config
          comparison = compareAssistantData(originalConfigAssistant, result.assistantConfig);
        } else {
          // Custom assistant or modified config assistant: compare with current stored data
          comparison = compareAssistantData(assistantConfig, result.assistantConfig);
        }
        
        const upToDate = !comparison.hasDifferences;
        
        // Update the assistant configuration with the new upToDate status
        addCustomAssistantContractForNetwork(networkKey, assistantKey, {
          ...assistantConfig,
          upToDate: upToDate,
        });
        
        return upToDate;
      }
    } catch (error) {
      console.error('Error updating assistant up-to-date status:', error);
    }
    
    return false;
  };



  // Handle removing a bridge instance
  const handleRemoveBridge = (networkKey, bridgeKey) => {
    removeCustomBridgeInstanceForNetwork(networkKey, bridgeKey);
    toast.success(`Bridge ${bridgeKey} removed successfully`);
  };

  // Handle adding a new assistant contract
  const handleAddAssistant = (networkKey) => {
    const assistant = newAssistant[networkKey];
    if (!assistant || 
        !assistant.key || 
        !assistant.address || 
        !assistant.type || 
        !assistant.bridgeAddress ||
        !assistant.shareSymbol ||
        !assistant.shareName ||
        !assistant.managerAddress) {
      toast.error('Please fill in all required assistant fields');
      return;
    }

    if (!validateContractAddress(assistant.address)) {
      toast.error('Invalid assistant address');
      return;
    }

    if (!validateContractAddress(assistant.bridgeAddress)) {
      toast.error('Invalid bridge address');
      return;
    }

    if (!validateContractAddress(assistant.managerAddress)) {
      toast.error('Invalid manager address');
      return;
    }

    // Determine the correct key to use
    let assistantKey = assistant.key;
    
    // If this is an update to an existing assistant, find the existing key
    if (assistant.alreadyExists) {
      const existingAssistants = getAssistantContractsWithSettings();
      const existingAssistant = Object.values(existingAssistants).find(existing => 
        existing.address.toLowerCase() === assistant.address.toLowerCase()
      );
      
      if (existingAssistant) {
        // Find the key for this existing assistant
        const existingKey = Object.keys(existingAssistants).find(key => 
          existingAssistants[key].address.toLowerCase() === assistant.address.toLowerCase()
        );
        if (existingKey) {
          assistantKey = existingKey;
        }
      }
    }

    addCustomAssistantContractForNetwork(networkKey, assistantKey, {
      address: assistant.address,
      type: assistant.type,
      bridgeAddress: assistant.bridgeAddress,
      managerAddress: assistant.managerAddress,
      description: assistant.description || `${assistant.type} Assistant`,
      shareSymbol: assistant.shareSymbol || `${assistant.type.toUpperCase()}A`,
      shareName: assistant.shareName || `${assistant.type} assistant share`,
      upToDate: true // Mark as up to date after update
    });

    setNewAssistant(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddAssistant(prev => ({ ...prev, [networkKey]: false }));
    
    if (assistant.alreadyExists) {
      toast.success(`Assistant ${assistantKey} updated successfully`);
    } else {
      toast.success(`Assistant ${assistantKey} added successfully`);
    }
  };

  // Handle removing an assistant contract
  const handleRemoveAssistant = (networkKey, assistantKey) => {
    removeCustomAssistantContractForNetwork(networkKey, assistantKey);
    toast.success(`Assistant ${assistantKey} removed successfully`);
  };

  // Handle assistant created from factory
  const handleAssistantCreated = (networkKey, assistantAddress, assistantConfig) => {
    // Generate a unique key for the new assistant
    const assistantKey = `${assistantConfig.shareSymbol}_${assistantConfig.type.toUpperCase()}_ASSISTANT`;
    
    // Add the assistant to settings
    addCustomAssistantContractForNetwork(networkKey, assistantKey, assistantConfig);
    
    toast.success(`Assistant ${assistantKey} added to settings`);
  };

  // Handle bridge created from factory
  const handleBridgeCreated = (networkKey, bridgeAddress, bridgeConfig) => {
    // Generate a unique key for the new bridge
    const bridgeKey = `${bridgeConfig.homeAsset}_${bridgeConfig.foreignAsset}_${bridgeConfig.type.toUpperCase()}`;
    
    // Add the bridge to settings
    addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, bridgeConfig);
    
    toast.success(`Bridge ${bridgeKey} added to settings`);
  };

  // Handle discovering bridges and assistants from registry
  const handleDiscoverFromRegistry = async (networkKey) => {
    try {
      // Get the appropriate provider for this network
      const networkProvider = getProvider(networkKey);
      console.log(`Discovering bridges and assistants on ${NETWORKS[networkKey]?.name} using provider:`, networkProvider.connection.url);
      
      toast.loading(`Discovering bridges and assistants on ${NETWORKS[networkKey]?.name}...`);
      
      const result = await updateBridgeInfoFromRegistry(networkProvider, networkKey, settings);
      
      if (result.success) {
        // Get existing bridge configurations before updating
        const existingBridges = getBridgeInstancesWithSettings();
        
        // Update bridges with proper upToDate status and validation
        Object.entries(result.bridges).forEach(([bridgeKey, bridgeConfig]) => {
          // Check if this bridge already exists and compare data
          const existingBridge = existingBridges[bridgeKey];
          
          // Validate bridge data before applying
          const isValidBridge = bridgeConfig.address && 
            validateContractAddress(bridgeConfig.address) &&
            bridgeConfig.homeTokenAddress && 
            validateTokenAddress(bridgeConfig.homeTokenAddress) &&
            bridgeConfig.foreignTokenAddress && 
            validateTokenAddress(bridgeConfig.foreignTokenAddress) &&
            bridgeConfig.stakeTokenAddress && 
            validateTokenAddress(bridgeConfig.stakeTokenAddress) &&
            // Check for data quality issues
            bridgeConfig.homeTokenSymbol && 
            bridgeConfig.homeTokenSymbol !== 'Invalid Address' &&
            bridgeConfig.homeTokenSymbol !== 'Error' &&
            bridgeConfig.foreignTokenSymbol && 
            bridgeConfig.foreignTokenSymbol !== 'Invalid Address' &&
            bridgeConfig.foreignTokenSymbol !== 'Error' &&
            bridgeConfig.stakeTokenSymbol && 
            bridgeConfig.stakeTokenSymbol !== 'Invalid Address' &&
            bridgeConfig.stakeTokenSymbol !== 'Error';
          
          if (!isValidBridge) {
            console.warn(`Skipping bridge ${bridgeKey} due to validation issues:`, bridgeConfig);
            // If this bridge exists, mark it as "Invalid" without applying invalid data
            if (existingBridge) {
              addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
                ...existingBridge,
                upToDate: 'invalid'
              });
            }
            return; // Skip this bridge
          }
          
          let upToDate = undefined;
          
          if (existingBridge) {
            // If we're applying registry data, mark as up to date since it's from the registry
            upToDate = true;
          } else {
            // New bridge from registry - mark as up to date
            upToDate = true;
          }
          
          // Add the bridge with the correct upToDate status
          addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, {
            ...bridgeConfig,
            upToDate: upToDate
          });
        });

        // Get existing assistant configurations before updating
        const existingAssistants = getAssistantContractsWithSettings();
        
        // Update assistants with proper status checking and validation
        Object.entries(result.assistants).forEach(([assistantKey, assistantConfig]) => {
          // Check if this assistant already exists and compare data
          const existingAssistant = existingAssistants[assistantKey];
          
          // Validate assistant data before applying
          const isValidAssistant = assistantConfig.address && 
            validateContractAddress(assistantConfig.address) &&
            assistantConfig.bridgeAddress && 
            validateContractAddress(assistantConfig.bridgeAddress) &&
            // Check for data quality issues
            assistantConfig.shareSymbol && 
            assistantConfig.shareSymbol !== 'Invalid Address' &&
            assistantConfig.shareSymbol !== 'Error' &&
            assistantConfig.shareName && 
            assistantConfig.shareName !== 'Invalid Address' &&
            assistantConfig.shareName !== 'Error';
          
          if (!isValidAssistant) {
            console.warn(`Skipping assistant ${assistantKey} due to validation issues:`, assistantConfig);
            // If this assistant exists, mark it as "Invalid" without applying invalid data
            if (existingAssistant) {
              addCustomAssistantContractForNetwork(networkKey, assistantKey, {
                ...existingAssistant,
                upToDate: 'invalid'
              });
            }
            return; // Skip this assistant
          }
          
          let upToDate = undefined;
          
          if (existingAssistant) {
            // If we're applying registry data, mark as up to date since it's from the registry
            upToDate = true;
          } else {
            // New assistant from registry - mark as up to date
            upToDate = true;
          }
          
          // Add the assistant with the correct upToDate status
          addCustomAssistantContractForNetwork(networkKey, assistantKey, {
            ...assistantConfig,
            upToDate: upToDate
          });
        });

        // Update tokens with validation
        Object.entries(result.discoveredTokens).forEach(([tokenKey, tokenConfig]) => {
          // Validate token data before applying
          const isValidToken = tokenConfig.address && 
            validateTokenAddress(tokenConfig.address) &&
            tokenConfig.symbol &&
            tokenConfig.symbol !== 'Invalid Address' &&
            tokenConfig.symbol !== 'Error' &&
            tokenConfig.name &&
            tokenConfig.name !== 'Invalid Address' &&
            tokenConfig.name !== 'Error' &&
            tokenConfig.decimals;
          
          if (!isValidToken) {
            console.warn(`Skipping token ${tokenKey} due to validation issues:`, tokenConfig);
            return; // Skip this token
          }
          
          addCustomToken(networkKey, tokenKey, tokenConfig);
        });

        toast.success(result.message);
        console.log('Discovery summary:', result.summary);
        console.log('Discovery errors:', result.errors);
      } else {
        toast.error(`Discovery failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error discovering from registry:', error);
      toast.error(`Discovery failed: ${error.message}`);
    }
  };



  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-start justify-center p-2 sm:p-4 pt-4 sm:pt-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-dark-900 border border-secondary-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-secondary-800">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-white">Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(96vh-8rem)] sm:max-h-[calc(96vh-10rem)]">
            <div className="space-y-6">
              {/* Network Settings */}
              {Object.entries(NETWORKS).map(([networkKey, networkConfig]) => (
                <div key={networkKey} className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Network className="w-5 h-5 text-primary-500" />
                      <h3 className="text-lg font-semibold text-white">{networkConfig.name}</h3>
                      {network?.symbol === networkConfig.symbol && (
                        <span className="px-2 py-1 bg-primary-600 text-white text-xs rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    {hasBridgesRegistry(networkKey) && (
                      <button
                        onClick={() => handleDiscoverFromRegistry(networkKey)}
                        className="btn-primary flex items-center gap-2 px-3 py-1 text-sm"
                        title="Discover bridges and assistants from BridgesRegistry"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Update
                      </button>
                    )}
                  </div>

                  {/* RPC URL Settings */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-secondary-300">
                        RPC Provider URL
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customRpc-${networkKey}`}
                          checked={settings[networkKey]?.customRpc || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customRpc', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customRpc-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={settings[networkKey]?.customRpc ? (settings[networkKey]?.rpcUrl || '') : (() => {
                          try {
                            const provider = getProvider(networkKey);
                            return provider.connection.url;
                          } catch (error) {
                            return NETWORKS[networkKey]?.rpcUrl || '';
                          }
                        })()}
                        onChange={(e) => updateNetworkSetting(networkKey, 'rpcUrl', e.target.value)}
                        placeholder="Enter RPC URL"
                        disabled={!settings[networkKey]?.customRpc}
                        className={`flex-1 input-field ${
                          settings[networkKey]?.customRpc && !validateRpcUrl(settings[networkKey]?.rpcUrl)
                            ? 'border-error-500'
                            : ''
                        } ${!settings[networkKey]?.customRpc ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''}`}
                      />
                      <button
                        onClick={() => copyToClipboard(settings[networkKey]?.customRpc ? (settings[networkKey]?.rpcUrl || '') : (() => {
                          try {
                            const provider = getProvider(networkKey);
                            return provider.connection.url;
                          } catch (error) {
                            return NETWORKS[networkKey]?.rpcUrl || '';
                          }
                        })(), 'RPC URL')}
                        disabled={!settings[networkKey]?.customRpc}
                        className={`btn-secondary px-3 ${!settings[networkKey]?.customRpc ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {copiedField === 'RPC URL' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    
                    {settings[networkKey]?.customRpc && !validateRpcUrl(settings[networkKey]?.rpcUrl) && (
                      <p className="text-error-500 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid URL format
                      </p>
                    )}
                  </div>

                  {/* Contract Addresses */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-secondary-300">
                        Contract Addresses
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customContracts-${networkKey}`}
                          checked={settings[networkKey]?.customContracts || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customContracts', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customContracts-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(settings[networkKey]?.contracts || {}).map(([contractType, address]) => (
                        <div key={contractType} className="space-y-1">
                          <label className="text-xs text-secondary-400 capitalize">
                            {contractType.replace(/([A-Z])/g, ' $1').trim()}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={address || ''}
                              onChange={(e) => updateContractAddress(networkKey, contractType, e.target.value)}
                              placeholder={`0x...`}
                              disabled={!settings[networkKey]?.customContracts}
                              className={`flex-1 input-field text-sm ${
                                settings[networkKey]?.customContracts && address && !validateContractAddress(address)
                                  ? 'border-error-500'
                                  : ''
                              } ${!settings[networkKey]?.customContracts ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''}`}
                            />
                            <button
                              onClick={() => copyToClipboard(address, contractType)}
                              disabled={!settings[networkKey]?.customContracts}
                              className={`btn-secondary px-2 ${!settings[networkKey]?.customContracts ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {copiedField === contractType ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          {settings[networkKey]?.customContracts && address && !validateContractAddress(address) && (
                            <p className="text-error-500 text-xs flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Invalid address
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Token Management */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-primary-500" />
                        <label className="text-sm font-medium text-secondary-300">
                          Token Management
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customTokens-${networkKey}`}
                          checked={settings[networkKey]?.customTokens || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customTokens', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customTokens-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>

                    {/* Existing Tokens */}
                    <div className="space-y-2 mb-3">
                      {Object.entries(settings[networkKey]?.tokens || {}).map(([tokenSymbol, tokenConfig]) => (
                        <div key={tokenSymbol} className="flex items-center gap-2 p-2 bg-dark-800 rounded border border-secondary-700">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{tokenSymbol}</span>
                              <span className="text-xs text-secondary-400">{tokenConfig.name}</span>
                              {tokenConfig.isNative && (
                                <span className="px-1 py-0.5 bg-blue-600 text-white text-xs rounded-full">Native</span>
                              )}
                              {tokenConfig.isPrecompile && (
                                <span className="px-1 py-0.5 bg-purple-600 text-white text-xs rounded-full">Precompile</span>
                              )}
                              {tokenConfig.isTestToken && (
                                <span className="px-1 py-0.5 bg-yellow-600 text-white text-xs rounded-full">Test</span>
                              )}
                            </div>
                            <div className="text-xs text-secondary-500 truncate">{tokenConfig.address}</div>
                            <div className="text-xs text-secondary-400">
                              {tokenConfig.standard} • {tokenConfig.decimals} decimals
                              {tokenConfig.assetId && ` • Asset ID: ${tokenConfig.assetId}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => copyToClipboard(tokenConfig.address, `${tokenSymbol} address`)}
                              className="btn-secondary px-2 py-1"
                            >
                              {copiedField === `${tokenSymbol} address` ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {settings[networkKey]?.customTokens && !tokenConfig.isNative && (
                              <button
                                onClick={() => handleRemoveToken(networkKey, tokenSymbol)}
                                className="btn-error px-2 py-1"
                                title="Remove token"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Token */}
                    {settings[networkKey]?.customTokens && (
                      <div className="space-y-3">
                        {!showAddToken[networkKey] ? (
                          <button
                            onClick={() => setShowAddToken(prev => ({ ...prev, [networkKey]: true }))}
                            className="btn-secondary flex items-center gap-2 w-full"
                          >
                            <Plus className="w-4 h-4" />
                            Add an existing Token
                          </button>
                        ) : (
                          <div className="p-3 bg-dark-800 rounded border border-secondary-700 space-y-3">
                            {/* Token Address - Auto-detection on input */}
                            <input
                              type="text"
                              placeholder="Token Address (0x...)"
                              value={newToken[networkKey]?.address || ''}
                              onChange={async (e) => {
                                const address = e.target.value;
                                setNewToken(prev => ({
                                  ...prev,
                                  [networkKey]: { ...prev[networkKey], address }
                                }));
                                
                                // Clear alreadyExists flag initially
                                setNewToken(prev => ({
                                  ...prev,
                                  [networkKey]: {
                                    ...prev[networkKey],
                                    alreadyExists: false
                                  }
                                }));
                                
                                // Auto-detect token when address is valid
                                if (address && validateTokenAddress(address)) {
                                  try {
                                    // Get the appropriate provider for this network
                                    const networkProvider = getProvider(networkKey);
                                    console.log(`Auto-detecting token on ${networkKey} using provider:`, networkProvider.connection.url);
                                    
                                    const result = await autoDetectToken(networkProvider, address, networkKey);
                                    if (result.success) {
                                      // Check if token already exists AFTER detection
                                      const tokenExists = isTokenAlreadyExists(networkKey, address);
                                      
                                      // If token exists, check if data needs updating
                                      let needsUpdate = false;
                                      let fieldDifferences = {};
                                      if (tokenExists) {
                                        // Get existing token data for comparison
                                        const existingTokens = getTokensWithSettings();
                                        const existingToken = Object.values(existingTokens).find(token => 
                                          token.address.toLowerCase() === address.toLowerCase()
                                        );
                                        
                                        if (existingToken) {
                                          const comparison = compareTokenData(existingToken, result.tokenInfo);
                                          needsUpdate = comparison.hasDifferences;
                                          fieldDifferences = comparison.differences;
                                        }
                                      }
                                      
                                      setNewToken(prev => ({
                                        ...prev,
                                        [networkKey]: {
                                          ...prev[networkKey],
                                          ...result.tokenInfo,
                                          alreadyExists: tokenExists,
                                          needsUpdate: needsUpdate,
                                          fieldDifferences: fieldDifferences,
                                          upToDate: tokenExists && !needsUpdate
                                        }
                                      }));
                                      setDetectedTokens(prev => ({
                                        ...prev,
                                        [networkKey]: true
                                      }));
                                      
                                      if (tokenExists) {
                                        if (needsUpdate) {
                                          toast.error(`Token detected but data differs from settings. You can update with current on-chain data.`);
                                          console.log(`⚠️ Token detected but data differs from settings: ${address}`);
                                        } else {
                                          // Only show error if custom tokens are enabled and token exists in settings
                                          if (settings[networkKey]?.customTokens) {
                                            toast.error(`The token already exists in the settings`);
                                            console.log(`⚠️ Token already exists in settings: ${address}`);
                                          } else {
                                      toast.success(`Detected ${result.tokenInfo.symbol} token`);
                                            console.log(`✅ Successfully detected ${result.tokenInfo.symbol} token`);
                                          }
                                        }
                                      } else {
                                        toast.success(`Detected ${result.tokenInfo.symbol} token`);
                                        console.log(`✅ Successfully detected ${result.tokenInfo.symbol} token`);
                                      }
                                    }
                                  } catch (error) {
                                    console.warn('Auto-detection failed:', error);
                                    // Don't show error toast for auto-detection failures
                                  }
                                } else {
                                  // Reset detection state when address is invalid or empty
                                  setDetectedTokens(prev => ({
                                    ...prev,
                                    [networkKey]: false
                                  }));
                                }
                              }}
                              className={`w-full input-field text-sm ${
                                newToken[networkKey]?.address && !validateTokenAddress(newToken[networkKey]?.address)
                                  ? 'border-error-500'
                                  : newToken[networkKey]?.fieldDifferences?.address
                                  ? 'border-yellow-500 bg-yellow-50/10'
                                  : ''
                              }`}
                            />
                            
                                                        {/* Token Symbol and Decimals */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Token Symbol (e.g., USDT)"
                                  value={newToken[networkKey]?.symbol || ''}
                                  onChange={(e) => setNewToken(prev => ({
                                    ...prev,
                                    [networkKey]: { ...prev[networkKey], symbol: e.target.value }
                                  }))}
                                  className={`w-full input-field text-sm ${
                                    detectedTokens[networkKey] ? 'border-green-500' : ''
                                  } ${
                                    newToken[networkKey]?.fieldDifferences?.symbol
                                      ? 'border-yellow-500 bg-yellow-50/10'
                                      : ''
                                  }`}
                                />
                                {detectedTokens[networkKey] && (
                                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  </div>
                                )}
                              </div>
                              <input
                                type="number"
                                placeholder="Decimals"
                                value={newToken[networkKey]?.decimals || ''}
                                onChange={(e) => setNewToken(prev => ({
                                  ...prev,
                                  [networkKey]: { ...prev[networkKey], decimals: e.target.value }
                                }))}
                                className={`w-full input-field text-sm ${
                                  newToken[networkKey]?.fieldDifferences?.decimals
                                    ? 'border-yellow-500 bg-yellow-50/10'
                                    : ''
                                }`}
                              />
                            </div>
                            
                            {/* Token Name */}
                            <input
                              type="text"
                              placeholder="Token Name (e.g., Tether USD)"
                              value={newToken[networkKey]?.name || ''}
                              onChange={(e) => setNewToken(prev => ({
                                ...prev,
                                [networkKey]: { ...prev[networkKey], name: e.target.value }
                              }))}
                              className={`w-full input-field text-sm ${
                                newToken[networkKey]?.fieldDifferences?.name
                                  ? 'border-yellow-500 bg-yellow-50/10'
                                  : ''
                              }`}
                            />
                            
                            {/* Standard and Asset ID */}
                            <div className={`grid gap-2 ${
                              NETWORKS[networkKey]?.erc20Precompile 
                                ? 'grid-cols-1 sm:grid-cols-2' 
                                : 'grid-cols-1'
                            }`}>
                              <select
                                value={newToken[networkKey]?.standard || 'ERC20'}
                                onChange={(e) => setNewToken(prev => ({
                                  ...prev,
                                  [networkKey]: { ...prev[networkKey], standard: e.target.value }
                                }))}
                                className="w-full input-field text-sm"
                              >
                                <option value="ERC20">ERC20</option>
                                <option value="Native">Native</option>
                              </select>
                              {NETWORKS[networkKey]?.erc20Precompile && (
                                <input
                                  type="text"
                                  placeholder="Asset ID (for precompiles)"
                                  value={newToken[networkKey]?.assetId || ''}
                                  onChange={(e) => setNewToken(prev => ({
                                    ...prev,
                                    [networkKey]: { ...prev[networkKey], assetId: e.target.value }
                                  }))}
                                  className="w-full input-field text-sm"
                                />
                              )}
                            </div>
                            
                            {/* Checkboxes - Optimized for mobile */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {NETWORKS[networkKey]?.erc20Precompile && (
                                <label className="flex items-center gap-2 text-sm text-secondary-300">
                                  <input
                                    type="checkbox"
                                    checked={newToken[networkKey]?.isPrecompile || false}
                                    onChange={(e) => setNewToken(prev => ({
                                      ...prev,
                                      [networkKey]: { ...prev[networkKey], isPrecompile: e.target.checked }
                                    }))}
                                    className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                                  />
                                  <span className="text-xs sm:text-sm">Precompile</span>
                                </label>
                              )}
                              <label className="flex items-center gap-2 text-sm text-secondary-300">
                                <input
                                  type="checkbox"
                                  checked={newToken[networkKey]?.isTestToken || false}
                                  onChange={(e) => setNewToken(prev => ({
                                    ...prev,
                                    [networkKey]: { ...prev[networkKey], isTestToken: e.target.checked }
                                  }))}
                                  className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                                />
                                <span className="text-xs sm:text-sm">Test Token</span>
                              </label>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddToken(networkKey)}
                                disabled={
                                  !newToken[networkKey]?.address ||
                                  !newToken[networkKey]?.symbol ||
                                  !newToken[networkKey]?.name ||
                                  !newToken[networkKey]?.decimals ||
                                  !validateTokenAddress(newToken[networkKey]?.address) ||
                                  (newToken[networkKey]?.alreadyExists && !newToken[networkKey]?.needsUpdate)
                                }
                                className="btn-primary px-3 flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setShowAddToken(prev => ({ ...prev, [networkKey]: false }));
                                  setNewToken(prev => ({ ...prev, [networkKey]: {} }));
                                  setDetectedTokens(prev => ({ ...prev, [networkKey]: false }));
                                }}
                                className="btn-outline px-3 flex-1 sm:flex-none"
                              >
                                Cancel
                              </button>
                            </div>
                            
                            {/* Help Text */}
                            {networkKey === 'THREEDPASS' && (
                              <p className="text-xs text-secondary-400">
                                💡 Tip: For 3DPass precompiles (0xFBFBFBFA...), the Detect button will automatically identify the token type and fetch all information.
                              </p>
                            )}
                            
                            {/* Error Message */}
                            {newToken[networkKey]?.address && !validateTokenAddress(newToken[networkKey]?.address) && (
                              <p className="text-error-500 text-xs flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Invalid token address
                              </p>
                            )}
                            {newToken[networkKey]?.alreadyExists && !newToken[networkKey]?.needsUpdate && (
                              <p className="text-error-500 text-xs flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                The token already exists in the settings
                              </p>
                            )}
                            {newToken[networkKey]?.alreadyExists && newToken[networkKey]?.needsUpdate && (
                              <p className="text-warning-500 text-xs flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Token data differs from settings. Click "Save" to update with current on-chain data.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bridge Instances for this Network */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Link className="w-4 h-4 text-primary-500" />
                        <label className="text-sm font-medium text-secondary-300">
                          Bridge Instances
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customBridges-${networkKey}`}
                          checked={settings[networkKey]?.customBridges || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customBridges', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customBridges-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>

                    {/* Existing Bridge Instances for this Network */}
                    <div className="space-y-2 mb-3">
                      {Object.entries({ 
                        ...getBridgeInstancesWithSettings(), 
                        ...settings[networkKey]?.bridges 
                      })
                        .filter(([bridgeKey, bridgeConfig]) => {
                          // For export bridges: show under home network
                          if (bridgeConfig.type === 'export') {
                            return bridgeConfig.homeNetwork === networkConfig.name;
                          }
                          // For import and import_wrapper bridges: show under foreign network
                          if (bridgeConfig.type === 'import' || bridgeConfig.type === 'import_wrapper') {
                            return bridgeConfig.foreignNetwork === networkConfig.name;
                          }
                          return false;
                        })
                        .map(([bridgeKey, bridgeConfig]) => (
                        <div key={bridgeKey} className="p-2 bg-dark-800 rounded border border-secondary-700">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white">{bridgeKey}</span>
                              <span className={`px-1 py-0.5 text-xs rounded-full ${
                                bridgeConfig.type === 'import' || bridgeConfig.type === 'import_wrapper'
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-green-600 text-white'
                              }`}>
                                {bridgeConfig.type}
                              </span>
                              {settings[networkKey]?.bridges?.[bridgeKey] && (
                                <span className="px-1 py-0.5 bg-yellow-600 text-white text-xs rounded-full">Custom</span>
                              )}
                              {bridgeConfig.upToDate === true && (
                                <span className="px-1 py-0.5 bg-green-600 text-white text-xs rounded-full">Up to date</span>
                              )}
                              {bridgeConfig.upToDate === false && (
                                <span className="px-1 py-0.5 bg-orange-600 text-white text-xs rounded-full">Needs update</span>
                              )}
                              {bridgeConfig.upToDate === undefined && (
                                <span className="px-1 py-0.5 bg-gray-600 text-white text-xs rounded-full">Unverified</span>
                              )}
                              {bridgeConfig.upToDate === null && (
                                <span className="px-1 py-0.5 bg-red-600 text-white text-xs rounded-full">Detection failed</span>
                              )}
                              {bridgeConfig.upToDate === 'invalid' && (
                                <span className="px-1 py-0.5 bg-red-800 text-white text-xs rounded-full">Invalid</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copyToClipboard(bridgeConfig.address, `${bridgeKey} address`)}
                                className="btn-secondary px-1 py-0.5"
                              >
                                {copiedField === `${bridgeKey} address` ? (
                                  <CheckCircle className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              {settings[networkKey]?.bridges?.[bridgeKey] && settings[networkKey]?.customBridges && (
                                <>
                                  <button
                                    onClick={async () => {
                                      toast.loading(`Checking ${bridgeKey} up-to-date status...`);
                                      const upToDate = await updateBridgeUpToDateStatus(networkKey, bridgeKey, bridgeConfig);
                                      if (upToDate) {
                                        toast.success(`${bridgeKey} is up to date`);
                                      } else {
                                        toast.error(`${bridgeKey} needs updating`);
                                      }
                                    }}
                                    className="btn-secondary px-1 py-0.5"
                                    title="Check up-to-date status"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>
                                <button
                                  onClick={() => handleRemoveBridge(networkKey, bridgeKey)}
                                  className="btn-error px-1 py-0.5"
                                  title="Remove bridge"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              {/* Show refresh button for config bridges that don't have upToDate status */}
                              {!settings[networkKey]?.bridges?.[bridgeKey] && (bridgeConfig.upToDate === undefined || bridgeConfig.upToDate === null) && (
                                <button
                                  onClick={async () => {
                                    toast.loading(`Checking ${bridgeKey} up-to-date status...`);
                                    const upToDate = await updateBridgeUpToDateStatus(networkKey, bridgeKey, bridgeConfig);
                                    if (upToDate) {
                                      toast.success(`${bridgeKey} is up to date`);
                                    } else {
                                      toast.error(`${bridgeKey} needs updating`);
                                    }
                                  }}
                                  className="btn-secondary px-1 py-0.5"
                                  title="Check up-to-date status"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-secondary-400 space-y-0.5">
                            <div>Address: {bridgeConfig.address}</div>
                            <div>Route: {bridgeConfig.homeNetwork} {bridgeConfig.homeTokenSymbol} → {bridgeConfig.foreignNetwork} {bridgeConfig.foreignTokenSymbol}</div>
                            <div>Stake: {bridgeConfig.stakeTokenSymbol}</div>
                            {bridgeConfig.description && (
                              <div>Description: {bridgeConfig.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>

                    {/* Add New Bridge Instance for this Network */}
                    {settings[networkKey]?.customBridges && (
                      <div className="space-y-3">
                        {!showAddBridge[networkKey] ? (
                          <div className="space-y-3">
                              <button
                            onClick={() => setShowAddBridge(prev => ({ ...prev, [networkKey]: true }))}
                    className="btn-secondary flex items-center gap-2 w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add an existing Bridge
                  </button>
                            <button
                              onClick={async () => {
                                // Check if we need to switch networks first
                                const networkConfig = NETWORKS[networkKey];
                                if (!networkConfig) {
                                  toast.error('Could not determine required network');
                                  return;
                                }
                                
                                // Check current network
                                if (!window.ethereum) {
                                  console.error('MetaMask not available');
                                  toast.error('MetaMask not available');
                                  return;
                                }
                                
                                let currentChainId;
                                try {
                                  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                                  currentChainId = parseInt(chainId, 16);
                                  console.log('🔍 Current chain ID:', currentChainId, 'Required chain ID:', networkConfig.id);
                                } catch (error) {
                                  console.error('Error getting chain ID:', error);
                                  toast.error('Failed to check current network');
                                  return;
                                }
                                
                                if (currentChainId !== networkConfig.id) {
                                  console.log('🚨 NETWORK SWITCHING WILL BE TRIGGERED NOW!');
                                  console.log('🔄 Wrong network detected, switching automatically...');
                                  
                                  try {
                                    const chainId = `0x${networkConfig.id.toString(16)}`;
                                    console.log('🔄 Switching to network:', { networkKey, chainId });

                                    await window.ethereum.request({
                                      method: 'wallet_switchEthereumChain',
                                      params: [{ chainId }],
                                    });

                                    console.log('✅ Network switched successfully to:', networkConfig.name);
                                    toast.success(`Switched to ${networkConfig.name} network`);
                                    
                                    // Wait a moment for the network to settle
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                  } catch (error) {
                                    console.error('❌ Network switch failed:', error);
                                    if (error.code === 4902) {
                                      // Network not added to MetaMask
                                      toast.error(`${networkConfig.name} network not found in MetaMask. Please add it manually.`);
                                    } else {
                                      toast.error('Failed to switch network');
                                    }
                                    return;
                                  }
                                }
                                
                                // Now open the dialog
                                setShowCreateBridge(prev => ({ ...prev, [networkKey]: true }));
                              }}
                              className="btn-primary flex items-center gap-2 w-full"
                            >
                              <Plus className="w-4 h-4" />
                              Create new Bridge Instance
                            </button>
                          </div>
                ) : (
                          <div className="p-3 bg-dark-800 rounded border border-secondary-700 space-y-3">
                    {/* Bridge Address */}
                    <div className="grid grid-cols-1 gap-3">
                      <input
                        type="text"
                        placeholder="Bridge Address (0x...) *"
                        value={newBridge[networkKey]?.address || ''}
                        onChange={async (e) => {
                          const address = e.target.value;
                          setNewBridge(prev => ({ 
                            ...prev, 
                            [networkKey]: { ...prev[networkKey], address }
                          }));
                          
                          // Clear alreadyExists flag initially
                          setNewBridge(prev => ({
                            ...prev,
                            [networkKey]: {
                              ...prev[networkKey],
                              alreadyExists: false
                            }
                          }));
                          
                          // Auto-detect bridge when a valid address is entered
                          if (address && validateContractAddress(address)) {
                            console.log(`🔍 Auto-detecting bridge at: ${address} on network: ${networkKey}`);
                            try {
                              // Get the appropriate provider for this network
                              const networkProvider = getProvider(networkKey);
                              const providerUrl = networkProvider.connection.url;
                              console.log(`Using provider for ${networkKey}:`, providerUrl);
                              
                              // Show which provider is being used
                              toast.loading(`Connecting via ${providerUrl.includes('127.0.0.1') ? 'local' : 'remote'} provider...`);
                              
                              const result = await autoDetectBridge(networkProvider, address, networkKey, settings);
                              console.log('Bridge detection result:', result);
                              console.log('Bridge config details:', result.bridgeConfig);
                              
                              if (result.success) {
                                // Generate unique bridge key
                                const generatedKey = generateBridgeKey(result.bridgeConfig, networkKey);
                                
                                // Check if bridge already exists AFTER detection
                                const bridgeExists = isBridgeAlreadyExists(networkKey, address);
                                
                                // If bridge exists, check if data needs updating
                                let needsUpdate = false;
                                let fieldDifferences = {};
                                if (bridgeExists) {
                                  // Get existing bridge data for comparison
                                  const existingBridges = getBridgeInstancesWithSettings();
                                  const existingBridge = Object.values(existingBridges).find(bridge => 
                                    bridge.address.toLowerCase() === address.toLowerCase()
                                  );
                                  
                                  if (existingBridge) {
                                    const comparison = compareBridgeData(existingBridge, result.bridgeConfig);
                                    needsUpdate = comparison.hasDifferences;
                                    fieldDifferences = comparison.differences;
                                  }
                                }
                                
                                setNewBridge(prev => ({
                                  ...prev,
                                  [networkKey]: {
                                    ...prev[networkKey],
                                    ...result.bridgeConfig,
                                    key: generatedKey,
                                    alreadyExists: bridgeExists,
                                    needsUpdate: needsUpdate,
                                    fieldDifferences: fieldDifferences,
                                    upToDate: bridgeExists && !needsUpdate
                                  }
                                }));
                                
                                if (bridgeExists) {
                                  if (needsUpdate) {
                                    toast.error(`Bridge detected but data differs from settings. You can update with current on-chain data.`);
                                    console.log(`⚠️ Bridge detected but data differs from settings: ${address}`);
                                  } else {
                                    toast.error(`Bridge detected and matches existing settings`);
                                    console.log(`⚠️ Bridge detected and matches existing settings: ${address}`);
                                  }
                                } else {
                                  toast.success(`Detected ${result.bridgeType} bridge with key: ${generatedKey}`);
                                  console.log(`✅ Successfully detected ${result.bridgeType} bridge with key: ${generatedKey}`);
                                }
                              } else {
                                console.warn('Bridge detection failed:', result.message);
                                toast.error(`Bridge detection failed: ${result.message}`);
                              }
                            } catch (error) {
                              console.error('Bridge detection error:', error);
                              toast.error(`Bridge detection error: ${error.message}`);
                            }
                          }
                        }}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.address && !validateContractAddress(newBridge[networkKey]?.address)
                            ? 'border-error-500'
                            : newBridge[networkKey]?.fieldDifferences?.address
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                    </div>
                    
                    {/* Bridge Key | Type */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Bridge Key (e.g., CUSTOM_USDT_IMPORT) *"
                                value={newBridge[networkKey]?.key || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], key: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.fieldDifferences?.key
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                      <select
                                value={newBridge[networkKey]?.type || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], type: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.fieldDifferences?.type
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      >
                        <option value="">Select Type *</option>
                        <option value="import">Import</option>
                        <option value="import_wrapper">Import Wrapper</option>
                        <option value="export">Export</option>
                      </select>
                    </div>
                    
                    {/* Network | Network */}
                    <div className="grid grid-cols-2 gap-3">
                      <select
                                value={newBridge[networkKey]?.homeNetwork || networkConfig.name}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], homeNetwork: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.fieldDifferences?.homeNetwork
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      >
                        <option value="Ethereum">Ethereum</option>
                        <option value="Binance Smart Chain">Binance Smart Chain</option>
                        <option value="3DPass">3DPass</option>
                      </select>
                      <select
                                value={newBridge[networkKey]?.foreignNetwork || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], foreignNetwork: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.fieldDifferences?.foreignNetwork
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      >
                        <option value="">Foreign Network</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="Binance Smart Chain">Binance Smart Chain</option>
                        <option value="3DPass">3DPass</option>
                      </select>
                    </div>
                    
                    {/* Token Address | Token Symbol */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Home Token Address (0x...) *"
                                value={newBridge[networkKey]?.homeTokenAddress || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], homeTokenAddress: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          (newBridge[networkKey]?.homeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.homeTokenAddress)) ||
                          (newBridge[networkKey]?.homeTokenSymbol === 'Invalid Address' || newBridge[networkKey]?.homeTokenSymbol === 'Error')
                            ? 'border-error-500'
                            : newBridge[networkKey]?.fieldDifferences?.homeTokenAddress
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Home Token Symbol (e.g., USDT) *"
                                value={newBridge[networkKey]?.homeTokenSymbol || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], homeTokenSymbol: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.fieldDifferences?.homeTokenSymbol
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                    </div>
                    
                    {/* Foreign Token Address | Foreign Token Symbol */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Foreign Token Address (0x...) *"
                                value={newBridge[networkKey]?.foreignTokenAddress || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], foreignTokenAddress: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          (newBridge[networkKey]?.foreignTokenAddress && !validateTokenAddress(newBridge[networkKey]?.foreignTokenAddress)) ||
                          (newBridge[networkKey]?.foreignTokenSymbol === 'Invalid Address' || newBridge[networkKey]?.foreignTokenSymbol === 'Error')
                            ? 'border-error-500'
                            : newBridge[networkKey]?.fieldDifferences?.foreignTokenAddress
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Foreign Token Symbol (e.g., wUSDT) *"
                                value={newBridge[networkKey]?.foreignTokenSymbol || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], foreignTokenSymbol: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.fieldDifferences?.foreignTokenSymbol
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                    </div>
                    
                    {/* Stake Token Address | Stake Token Symbol */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Stake Token Address (0x...) *"
                                value={newBridge[networkKey]?.stakeTokenAddress || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], stakeTokenAddress: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          (newBridge[networkKey]?.stakeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.stakeTokenAddress)) ||
                          (newBridge[networkKey]?.stakeTokenSymbol === 'Invalid Address' || newBridge[networkKey]?.stakeTokenSymbol === 'Error')
                            ? 'border-error-500'
                            : newBridge[networkKey]?.fieldDifferences?.stakeTokenAddress
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Stake Token Symbol (e.g., P3D)"
                                value={newBridge[networkKey]?.stakeTokenSymbol || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], stakeTokenSymbol: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newBridge[networkKey]?.fieldDifferences?.stakeTokenSymbol
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                    </div>
                    
                    {/* Oracle Address | Description - Only show for import bridges */}
                    {['import', 'import_wrapper'].includes(newBridge[networkKey]?.type) && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder="Oracle Address (0x...) (required for import bridges)"
                            value={newBridge[networkKey]?.oracleAddress || ''}
                            onChange={async (e) => {
                              const oracleAddress = e.target.value;
                              setNewBridge(prev => ({ 
                                ...prev, 
                                [networkKey]: { ...prev[networkKey], oracleAddress }
                              }));
                              
                              // Auto-verify oracle when a valid address is entered
                              if (oracleAddress && validateContractAddress(oracleAddress)) {
                                console.log(`🔍 Verifying oracle at: ${oracleAddress} on network: ${networkKey}`);
                                try {
                                  // Get the appropriate provider for this network
                                  const networkProvider = getProvider(networkKey);
                                  const providerUrl = networkProvider.connection.url;
                                  console.log(`Using provider for ${networkKey}:`, providerUrl);
                                  
                                  // Show which provider is being used
                                  toast.loading(`Verifying oracle via ${providerUrl.includes('127.0.0.1') ? 'local' : 'remote'} provider...`);
                                  
                                  // Verify oracle contract exists and has expected functions
                                  const oracleContract = new ethers.Contract(oracleAddress, [
                                    'function getPrice(address token) view returns (uint256)',
                                    'function getPrice20(address token) view returns (uint256)',
                                    'function validatePrice(uint256 price) pure returns (bool)'
                                  ], networkProvider);
                                  
                                  // Try to call a basic function to verify it's a valid oracle
                                  await oracleContract.getPrice20(ethers.constants.AddressZero);
                                  
                                  toast.success(`Oracle verified successfully`);
                                  console.log(`✅ Successfully verified oracle at: ${oracleAddress}`);
                                  
                                } catch (error) {
                                  console.warn('Oracle verification failed:', error.message);
                                  toast.error(`Oracle verification failed: ${error.message}`);
                                }
                              }
                            }}
                            className={`input-field text-sm ${
                              newBridge[networkKey]?.oracleAddress && !validateContractAddress(newBridge[networkKey]?.oracleAddress)
                                ? 'border-error-500'
                                : newBridge[networkKey]?.fieldDifferences?.oracleAddress
                                ? 'border-yellow-500 bg-yellow-50/10'
                                : ''
                            }`}
                          />
                          <input
                            type="text"
                            placeholder="Description (optional)"
                                    value={newBridge[networkKey]?.description || ''}
                                    onChange={(e) => setNewBridge(prev => ({ 
                                      ...prev, 
                                      [networkKey]: { ...prev[networkKey], description: e.target.value }
                                    }))}
                            className="input-field text-sm"
                          />
                        </div>
                        
                        {/* Oracle Selection Help */}
                        <div className="text-xs text-secondary-400 p-2 bg-dark-700 rounded">
                          <p>💡 <strong>Oracle Address:</strong> Import bridges must specify which oracle they use. You can:</p>
                          <ul className="list-disc list-inside mt-1 space-y-1">
                            <li>Use one of the network's configured oracles (see Oracles section above)</li>
                            <li>Enter a custom oracle address (will be validated on-chain)</li>
                            <li><strong>Required for import bridges</strong> - used for price validation</li>
                          </ul>
                        </div>
                      </>
                    )}
                    
                    {/* Description field for export bridges (when oracle field is hidden) */}
                    {!['import', 'import_wrapper'].includes(newBridge[networkKey]?.type) && (
                      <div className="grid grid-cols-1 gap-3">
                        <input
                          type="text"
                          placeholder="Description (optional)"
                          value={newBridge[networkKey]?.description || ''}
                          onChange={(e) => setNewBridge(prev => ({ 
                            ...prev, 
                            [networkKey]: { ...prev[networkKey], description: e.target.value }
                          }))}
                          className="input-field text-sm"
                        />
                      </div>
                    )}
                    
                    {/* Creation Date (Read-only) */}
                    {newBridge[networkKey]?.createdAt && (
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-center gap-2 p-2 bg-dark-700 rounded border border-secondary-600">
                          <span className="text-xs text-secondary-400">Created:</span>
                          <span className="text-xs text-white">
                            {new Date(newBridge[networkKey].createdAt * 1000).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Address validation error messages */}
                    {((newBridge[networkKey]?.homeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.homeTokenAddress)) || 
                     (newBridge[networkKey]?.homeTokenSymbol === 'Invalid Address' || newBridge[networkKey]?.homeTokenSymbol === 'Error')) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid home token address
                      </p>
                    )}
                    {((newBridge[networkKey]?.foreignTokenAddress && !validateTokenAddress(newBridge[networkKey]?.foreignTokenAddress)) || 
                     (newBridge[networkKey]?.foreignTokenSymbol === 'Invalid Address' || newBridge[networkKey]?.foreignTokenSymbol === 'Error')) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid foreign token address
                      </p>
                    )}
                    {((newBridge[networkKey]?.stakeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.stakeTokenAddress)) || 
                     (newBridge[networkKey]?.stakeTokenSymbol === 'Invalid Address' || newBridge[networkKey]?.stakeTokenSymbol === 'Error')) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid stake token address
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                                onClick={() => handleAddBridge(networkKey)}
                                disabled={
                                  !newBridge[networkKey]?.key || 
                                  !newBridge[networkKey]?.address || 
                                  !newBridge[networkKey]?.type ||
                                  !newBridge[networkKey]?.homeNetwork ||
                                  !newBridge[networkKey]?.homeTokenSymbol ||
                                  !newBridge[networkKey]?.foreignNetwork ||
                                  !newBridge[networkKey]?.foreignTokenSymbol ||
                                  !newBridge[networkKey]?.homeTokenAddress ||
                                  !newBridge[networkKey]?.foreignTokenAddress ||
                                  !newBridge[networkKey]?.stakeTokenAddress ||
                                  !validateContractAddress(newBridge[networkKey]?.address) ||
                                  !validateTokenAddress(newBridge[networkKey]?.homeTokenAddress) ||
                                  !validateTokenAddress(newBridge[networkKey]?.foreignTokenAddress) ||
                                  !validateTokenAddress(newBridge[networkKey]?.stakeTokenAddress) ||
                                  // Oracle validation: required for import bridges, optional for export bridges
                                  (['import', 'import_wrapper'].includes(newBridge[networkKey]?.type) && 
                                   (!newBridge[networkKey]?.oracleAddress || !validateContractAddress(newBridge[networkKey]?.oracleAddress))) ||
                                  (newBridge[networkKey]?.oracleAddress && !validateContractAddress(newBridge[networkKey]?.oracleAddress)) ||
                                  newBridge[networkKey]?.homeTokenSymbol === 'Invalid Address' ||
                                  newBridge[networkKey]?.homeTokenSymbol === 'Error' ||
                                  newBridge[networkKey]?.foreignTokenSymbol === 'Invalid Address' ||
                                  newBridge[networkKey]?.foreignTokenSymbol === 'Error' ||
                                  newBridge[networkKey]?.stakeTokenSymbol === 'Invalid Address' ||
                                  newBridge[networkKey]?.stakeTokenSymbol === 'Error' ||
                                  (newBridge[networkKey]?.alreadyExists && !newBridge[networkKey]?.needsUpdate)
                                }
                        className="btn-primary px-3 disabled:opacity-50 disabled:cursor-not-allowed"

                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                                  setShowAddBridge(prev => ({ ...prev, [networkKey]: false }));
                                  setNewBridge(prev => ({ ...prev, [networkKey]: {} }));
                        }}
                        className="btn-outline px-3"
                      >
                        Cancel
                      </button>
                    </div>
                            {newBridge[networkKey]?.address && !validateContractAddress(newBridge[networkKey]?.address) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid bridge address
                      </p>
                            )}
                            {newBridge[networkKey]?.oracleAddress && !validateContractAddress(newBridge[networkKey]?.oracleAddress) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid oracle address
                      </p>
                            )}
                            {['import', 'import_wrapper'].includes(newBridge[networkKey]?.type) && !newBridge[networkKey]?.oracleAddress && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Oracle address is required for import bridges
                      </p>
                            )}
                            {newBridge[networkKey]?.alreadyExists && !newBridge[networkKey]?.needsUpdate && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        The bridge already exists in the settings
                      </p>
                            )}
                            {newBridge[networkKey]?.alreadyExists && newBridge[networkKey]?.needsUpdate && (
                      <p className="text-warning-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Bridge data differs from settings. Click "Add" to update with current on-chain data.
                      </p>
                            )}

                          </div>
                    )}
                  </div>
                )}
              </div>

                  {/* Oracles for this Network */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Link className="w-4 h-4 text-primary-500" />
                        <label className="text-sm font-medium text-secondary-300">
                          Oracles
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customOracles-${networkKey}`}
                          checked={settings[networkKey]?.customOracles || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customOracles', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customOracles-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>

                    {/* Existing Oracles */}
                    <div className="space-y-2 mb-3">
                      {Object.entries({ 
                        ...NETWORKS[networkKey]?.oracles || {}, 
                        ...settings[networkKey]?.oracles || {} 
                      }).map(([oracleKey, oracleConfig]) => (
                        <div key={oracleKey} className="flex items-center gap-2 p-2 bg-dark-800 rounded border border-secondary-700">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{oracleKey}</span>
                              <span className="text-xs text-secondary-400">{oracleConfig.name}</span>
                              {settings[networkKey]?.customOracles && settings[networkKey]?.oracles?.[oracleKey] && (
                                <span className="px-1 py-0.5 bg-yellow-600 text-white text-xs rounded-full">Custom</span>
                              )}
                            </div>
                            <div className="text-xs text-secondary-500 truncate">{oracleConfig.address}</div>
                            {oracleConfig.description && (
                              <div className="text-xs text-secondary-400">{oracleConfig.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => copyToClipboard(oracleConfig.address, `${oracleKey} address`)}
                              className="btn-secondary px-2 py-1"
                            >
                              {copiedField === `${oracleKey} address` ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {settings[networkKey]?.customOracles && settings[networkKey]?.oracles?.[oracleKey] && (
                              <button
                                onClick={() => handleRemoveOracle(networkKey, oracleKey)}
                                className="btn-error px-2 py-1"
                                title="Remove oracle"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Oracle */}
                    {settings[networkKey]?.customOracles && (
                      <div className="space-y-3">
                        {!showAddOracle[networkKey] ? (
                          <button
                            onClick={() => setShowAddOracle(prev => ({ ...prev, [networkKey]: true }))}
                            className="btn-secondary flex items-center gap-2 w-full"
                          >
                            <Plus className="w-4 h-4" />
                            Add an existing Oracle
                          </button>
                        ) : (
                          <div className="p-3 bg-dark-800 rounded border border-secondary-700 space-y-3">
                            {/* Oracle Address | Oracle Name */}
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="Oracle Address (0x...) (required)"
                                value={newOracle[networkKey]?.address || ''}
                                onChange={async (e) => {
                                  const oracleAddress = e.target.value;
                                  setNewOracle(prev => ({ 
                                    ...prev, 
                                    [networkKey]: { ...prev[networkKey], address: oracleAddress }
                                  }));
                                  
                                  // Auto-verify oracle when a valid address is entered
                                  if (oracleAddress && validateContractAddress(oracleAddress)) {
                                    console.log(`🔍 Verifying oracle at: ${oracleAddress} on network: ${networkKey}`);
                                    try {
                                      // Get the appropriate provider for this network
                                      const networkProvider = getProvider(networkKey);
                                      const providerUrl = networkProvider.connection.url;
                                      console.log(`Using provider for ${networkKey}:`, providerUrl);
                                      
                                      // Show which provider is being used
                                      toast.loading(`Verifying oracle via ${providerUrl.includes('127.0.0.1') ? 'local' : 'remote'} provider...`);
                                      
                                      // Validate the oracle contract on-chain
                                      const oracleValidation = await validateOracleContract(networkProvider, oracleAddress);
                                      
                                      if (oracleValidation.isValid) {
                                        toast.success(`Oracle verified successfully`);
                                        console.log(`✅ Successfully verified oracle at: ${oracleAddress}`);
                                        
                                        // Auto-generate key if not already set
                                        if (!newOracle[networkKey]?.key) {
                                          // Generate a unique key based on the oracle address
                                          const shortAddress = oracleAddress.slice(2, 8); // Remove '0x' and take first 6 chars
                                          const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
                                          const generatedKey = `oracle_${shortAddress}_${timestamp}`;
                                          
                                          setNewOracle(prev => ({ 
                                            ...prev, 
                                            [networkKey]: { 
                                              ...prev[networkKey], 
                                              key: generatedKey
                                            }
                                          }));
                                        }
                                        
                                        // Auto-generate description if not already set
                                        if (!newOracle[networkKey]?.description) {
                                          setNewOracle(prev => ({ 
                                            ...prev, 
                                            [networkKey]: { 
                                              ...prev[networkKey], 
                                              description: `Verified oracle contract at ${oracleAddress}` 
                                            }
                                          }));
                                        }
                                        
                                        // Auto-generate name if not already set
                                        if (!newOracle[networkKey]?.name) {
                                          setNewOracle(prev => ({ 
                                            ...prev, 
                                            [networkKey]: { 
                                              ...prev[networkKey], 
                                              name: `Oracle ${oracleAddress.slice(0, 8)}...` 
                                            }
                                          }));
                                        }
                                      } else {
                                        toast.error(`Oracle verification failed: ${oracleValidation.error}`);
                                        console.warn('Oracle verification failed:', oracleValidation.error);
                                      }
                                    } catch (error) {
                                      console.warn('Oracle verification failed:', error.message);
                                      toast.error(`Oracle verification failed: ${error.message}`);
                                    }
                                  }
                                }}
                                className={`input-field text-sm ${
                                  newOracle[networkKey]?.address && !validateContractAddress(newOracle[networkKey]?.address)
                                    ? 'border-error-500'
                                    : ''
                                }`}
                              />
                              <input
                                type="text"
                                placeholder="Oracle Name (e.g., Backup Oracle) *"
                                value={newOracle[networkKey]?.name || ''}
                                onChange={(e) => setNewOracle(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], name: e.target.value }
                                }))}
                                className="input-field text-sm"
                              />
                            </div>
                            
                            {/* Oracle Key | Description */}
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="Oracle Key (e.g., backup, secondary) *"
                                value={newOracle[networkKey]?.key || ''}
                                onChange={(e) => setNewOracle(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], key: e.target.value }
                                }))}
                                className="input-field text-sm"
                              />
                              <input
                                type="text"
                                placeholder="Description (optional)"
                                value={newOracle[networkKey]?.description || ''}
                                onChange={(e) => setNewOracle(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], description: e.target.value }
                                }))}
                                className="input-field text-sm"
                              />
                            </div>
                            

                            
                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddOracle(networkKey)}
                                disabled={
                                  !newOracle[networkKey]?.key ||
                                  !newOracle[networkKey]?.address ||
                                  !newOracle[networkKey]?.name ||
                                  !validateContractAddress(newOracle[networkKey]?.address)
                                }
                                className="btn-primary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setShowAddOracle(prev => ({ ...prev, [networkKey]: false }));
                                  setNewOracle(prev => ({ ...prev, [networkKey]: {} }));
                                }}
                                className="btn-outline px-3"
                              >
                                Cancel
                              </button>
                            </div>
                            
                            {/* Validation Error Messages */}
                            {newOracle[networkKey]?.address && !validateContractAddress(newOracle[networkKey]?.address) && (
                              <p className="text-error-500 text-xs flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Invalid oracle address
                              </p>
                            )}
                          </div>
                    )}
                  </div>
                )}
              </div>

                  {/* Assistant Contracts for this Network */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary-500" />
                        <label className="text-sm font-medium text-secondary-300">
                          Assistant Contracts
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customAssistants-${networkKey}`}
                          checked={settings[networkKey]?.customAssistants || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customAssistants', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customAssistants-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                </div>

                    {/* Existing Assistant Contracts for this Network */}
                    <div className="space-y-2 mb-3">
                      {Object.entries({ 
                        ...getAssistantContractsWithSettings(), 
                        ...settings[networkKey]?.assistants 
                      })
                        .filter(([assistantKey, assistantConfig]) => {
                          // Show assistants that belong to this network
                          // Assistants are organized by network in the config
                          const networkAssistants = networkConfig.assistants || {};
                          return assistantKey in networkAssistants || 
                                 (settings[networkKey]?.assistants && assistantKey in settings[networkKey].assistants);
                        })
                        .map(([assistantKey, assistantConfig]) => (
                        <div key={assistantKey} className="p-2 bg-dark-800 rounded border border-secondary-700">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white">{assistantKey}</span>
                              <span className={`px-1 py-0.5 text-xs rounded-full ${
                                assistantConfig.type === 'import' || assistantConfig.type === 'import_wrapper'
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-green-600 text-white'
                              }`}>
                                {assistantConfig.type.replace('_', ' ')} Assistant
                              </span>
                              {settings[networkKey]?.assistants?.[assistantKey] && (
                                <span className="px-1 py-0.5 bg-yellow-600 text-white text-xs rounded-full">Custom</span>
                              )}
                              {assistantConfig.upToDate === true && (
                                <span className="px-1 py-0.5 bg-green-600 text-white text-xs rounded-full">Up to date</span>
                              )}
                              {assistantConfig.upToDate === false && (
                                <span className="px-1 py-0.5 bg-orange-600 text-white text-xs rounded-full">Needs update</span>
                              )}
                              {assistantConfig.upToDate === undefined && (
                                <span className="px-1 py-0.5 bg-gray-600 text-white text-xs rounded-full">Unverified</span>
                              )}
                              {assistantConfig.upToDate === null && (
                                <span className="px-1 py-0.5 bg-red-600 text-white text-xs rounded-full">Detection failed</span>
                              )}
                              {assistantConfig.upToDate === 'invalid' && (
                                <span className="px-1 py-0.5 bg-red-800 text-white text-xs rounded-full">Invalid</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copyToClipboard(assistantConfig.address, `${assistantKey} address`)}
                                className="btn-secondary px-1 py-0.5"
                              >
                                {copiedField === `${assistantKey} address` ? (
                                  <CheckCircle className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              {settings[networkKey]?.assistants?.[assistantKey] && settings[networkKey]?.customAssistants && (
                                <>
                                  <button
                                    onClick={async () => {
                                      toast.loading(`Checking ${assistantKey} up-to-date status...`);
                                      const upToDate = await updateAssistantUpToDateStatus(networkKey, assistantKey, assistantConfig);
                                      if (upToDate) {
                                        toast.success(`${assistantKey} is up to date`);
                                      } else {
                                        toast.error(`${assistantKey} needs updating`);
                                      }
                                    }}
                                    className="btn-secondary px-1 py-0.5"
                                    title="Check up-to-date status"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>
                                <button
                                  onClick={() => handleRemoveAssistant(networkKey, assistantKey)}
                                  className="btn-error px-1 py-0.5"
                                  title="Remove assistant"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              {/* Show refresh button for config assistants that don't have upToDate status */}
                              {!settings[networkKey]?.assistants?.[assistantKey] && (assistantConfig.upToDate === undefined || assistantConfig.upToDate === null) && (
                                <button
                                  onClick={async () => {
                                    toast.loading(`Checking ${assistantKey} up-to-date status...`);
                                    const upToDate = await updateAssistantUpToDateStatus(networkKey, assistantKey, assistantConfig);
                                    if (upToDate) {
                                      toast.success(`${assistantKey} is up to date`);
                                    } else {
                                      toast.error(`${assistantKey} needs updating`);
                                    }
                                  }}
                                  className="btn-secondary px-1 py-0.5"
                                  title="Check up-to-date status"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-secondary-400 space-y-0.5">
                            <div>Address: {assistantConfig.address}</div>
                            <div>Bridge: {assistantConfig.bridgeAddress}</div>
                            {assistantConfig.shareSymbol && (
                              <div>Share: {assistantConfig.shareSymbol}</div>
                            )}
                            {assistantConfig.description && (
                              <div>Description: {assistantConfig.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Assistant Contract for this Network */}
                    {settings[networkKey]?.customAssistants && (
                      <div className="space-y-3">
                        {!showAddAssistant[networkKey] ? (
                          <div className="space-y-2">
                          <button
                            onClick={() => setShowAddAssistant(prev => ({ ...prev, [networkKey]: true }))}
                    className="btn-secondary flex items-center gap-2 w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add an existing Assistant
                  </button>
                            <button
                              onClick={() => setShowCreateAssistant(prev => ({ ...prev, [networkKey]: true }))}
                              className="btn-primary flex items-center gap-2 w-full"
                            >
                              <Plus className="w-4 h-4" />
                              Create new Pool-Assistant
                            </button>
                          </div>
                ) : (
                          <div className="p-3 bg-dark-800 rounded border border-secondary-700 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Assistant Address (0x...) *"
                                value={newAssistant[networkKey]?.address || ''}
                                onChange={async (e) => {
                                  const address = e.target.value;
                                  setNewAssistant(prev => ({ 
                                    ...prev, 
                                    [networkKey]: { ...prev[networkKey], address }
                                  }));
                                  
                                  // Clear alreadyExists flag initially
                                  setNewAssistant(prev => ({
                                    ...prev,
                                    [networkKey]: {
                                      ...prev[networkKey],
                                      alreadyExists: false
                                    }
                                  }));
                                  
                                  // Auto-detect assistant when address is valid
                                  if (address && validateContractAddress(address)) {
                                    try {
                                      // Get the appropriate provider for this network
                                      const networkProvider = getProvider(networkKey);
                                      console.log(`Auto-detecting assistant on ${networkKey} using provider:`, networkProvider.connection.url);
                                      
                                      const result = await autoDetectAssistant(networkProvider, address, networkKey, {}, settings);
                                      if (result.success) {
                                        // Generate unique assistant key
                                        const generatedKey = generateAssistantKey(result.assistantConfig, networkKey);
                                        
                                        // Check if assistant already exists AFTER detection
                                        const assistantExists = isAssistantAlreadyExists(networkKey, address);
                                        
                                        // If assistant exists, check if data needs updating
                                        let needsUpdate = false;
                                        let fieldDifferences = {};
                                        if (assistantExists) {
                                          // Get existing assistant data for comparison
                                          const existingAssistants = getAssistantContractsWithSettings();
                                          const existingAssistant = Object.values(existingAssistants).find(assistant => 
                                            assistant.address.toLowerCase() === address.toLowerCase()
                                          );
                                          
                                          if (existingAssistant) {
                                            const comparison = compareAssistantData(existingAssistant, result.assistantConfig);
                                            needsUpdate = comparison.hasDifferences;
                                            fieldDifferences = comparison.differences;
                                          }
                                        }
                                        
                                        setNewAssistant(prev => ({
                                          ...prev,
                                          [networkKey]: {
                                            ...prev[networkKey],
                                            ...result.assistantConfig,
                                            key: generatedKey,
                                            alreadyExists: assistantExists,
                                            needsUpdate: needsUpdate,
                                            fieldDifferences: fieldDifferences,
                                            upToDate: assistantExists && !needsUpdate
                                          }
                                        }));
                                        
                                        if (assistantExists) {
                                          if (needsUpdate) {
                                            toast.error(`Assistant detected but data differs from settings. You can update with current on-chain data.`);
                                            console.log(`⚠️ Assistant detected but data differs from settings: ${address}`);
                                          } else {
                                            toast.error(`Assistant detected and matches existing settings`);
                                            console.log(`⚠️ Assistant detected and matches existing settings: ${address}`);
                                          }
                                        } else {
                                          toast.success(`Detected ${result.assistantConfig.type} assistant with key: ${generatedKey}`);
                                          console.log(`✅ Successfully detected ${result.assistantConfig.type} assistant with key: ${generatedKey}`);
                                        }
                                      }
                                    } catch (error) {
                                      console.warn('Assistant auto-detection failed:', error);
                                      // Don't show error toast for auto-detection failures
                                    }
                                  }
                                }}
                        className={`input-field text-sm ${
                                  newAssistant[networkKey]?.address && !validateContractAddress(newAssistant[networkKey]?.address)
                            ? 'border-error-500'
                            : newAssistant[networkKey]?.fieldDifferences?.address
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Bridge Address (0x...) *"
                                value={newAssistant[networkKey]?.bridgeAddress || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], bridgeAddress: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                                  newAssistant[networkKey]?.bridgeAddress && !validateContractAddress(newAssistant[networkKey]?.bridgeAddress)
                            ? 'border-error-500'
                            : newAssistant[networkKey]?.fieldDifferences?.bridgeAddress
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Assistant Key (e.g., CUSTOM_USDT_IMPORT_ASSISTANT) *"
                                value={newAssistant[networkKey]?.key || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], key: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newAssistant[networkKey]?.fieldDifferences?.key
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                      <select
                                value={newAssistant[networkKey]?.type || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], type: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newAssistant[networkKey]?.fieldDifferences?.type
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      >
                        <option value="">Select Type *</option>
                        <option value="import">Import Assistant</option>
                        <option value="import_wrapper">Import Wrapper Assistant</option>
                        <option value="export">Export Assistant</option>
                        <option value="export_wrapper">Export Wrapper Assistant</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Share Symbol (e.g., P3DEA) *"
                                value={newAssistant[networkKey]?.shareSymbol || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], shareSymbol: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newAssistant[networkKey]?.fieldDifferences?.shareSymbol
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Share Name (e.g., P3D export assistant share) *"
                                value={newAssistant[networkKey]?.shareName || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], shareName: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          newAssistant[networkKey]?.fieldDifferences?.shareName
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Manager Address (0x...) *"
                                value={newAssistant[networkKey]?.managerAddress || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], managerAddress: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                                  newAssistant[networkKey]?.managerAddress && !validateContractAddress(newAssistant[networkKey]?.managerAddress)
                            ? 'border-error-500'
                            : newAssistant[networkKey]?.fieldDifferences?.managerAddress
                            ? 'border-yellow-500 bg-yellow-50/10'
                            : ''
                        }`}
                      />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                              value={newAssistant[networkKey]?.description || ''}
                              onChange={(e) => setNewAssistant(prev => ({ 
                                ...prev, 
                                [networkKey]: { ...prev[networkKey], description: e.target.value }
                              }))}
                      className="input-field text-sm"
                    />
                    </div>
                    
                    {/* Creation Date (Read-only) */}
                    {newAssistant[networkKey]?.createdAt && (
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-center gap-2 p-2 bg-dark-700 rounded border border-secondary-600">
                          <span className="text-xs text-secondary-400">Created:</span>
                          <span className="text-xs text-white">
                            {new Date(newAssistant[networkKey].createdAt * 1000).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <button
                                onClick={() => handleAddAssistant(networkKey)}
                        disabled={
                          !newAssistant[networkKey]?.address ||
                          !newAssistant[networkKey]?.bridgeAddress ||
                          !newAssistant[networkKey]?.key ||
                          !newAssistant[networkKey]?.type ||
                          !newAssistant[networkKey]?.shareSymbol ||
                          !newAssistant[networkKey]?.shareName ||
                          !newAssistant[networkKey]?.managerAddress ||
                          !validateContractAddress(newAssistant[networkKey]?.address) ||
                          !validateContractAddress(newAssistant[networkKey]?.bridgeAddress) ||
                          !validateContractAddress(newAssistant[networkKey]?.managerAddress) ||
                          (newAssistant[networkKey]?.alreadyExists && !newAssistant[networkKey]?.needsUpdate)
                        }
                        className="btn-primary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                                  setShowAddAssistant(prev => ({ ...prev, [networkKey]: false }));
                                  setNewAssistant(prev => ({ ...prev, [networkKey]: {} }));
                        }}
                        className="btn-outline px-3"
                      >
                        Cancel
                      </button>
                    </div>
                            {(newAssistant[networkKey]?.address && !validateContractAddress(newAssistant[networkKey]?.address)) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid assistant address
                      </p>
                    )}
                            {(newAssistant[networkKey]?.bridgeAddress && !validateContractAddress(newAssistant[networkKey]?.bridgeAddress)) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid bridge address
                      </p>
                            )}
                            {(newAssistant[networkKey]?.managerAddress && !validateContractAddress(newAssistant[networkKey]?.managerAddress)) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid manager address
                      </p>
                            )}
                            {newAssistant[networkKey]?.alreadyExists && !newAssistant[networkKey]?.needsUpdate && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        The assistant already exists in the settings
                      </p>
                            )}
                            {newAssistant[networkKey]?.alreadyExists && newAssistant[networkKey]?.needsUpdate && (
                      <p className="text-warning-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Assistant data differs from settings. Click "Add" to update with current on-chain data.
                      </p>
                            )}
                          </div>
                    )}
                  </div>
                )}
              </div>

                  {/* Network Info */}
                  <div className="mt-4 pt-4 border-t border-secondary-800">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-secondary-400">Chain ID:</span>
                        <span className="text-white ml-2">{networkConfig.id}</span>
                      </div>
                      <div>
                        <span className="text-secondary-400">Explorer:</span>
                        <a
                          href={networkConfig.explorer}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-500 hover:text-primary-400 ml-2 flex items-center gap-1"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            </div>

            {/* Global Settings */}
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <Settings className="w-5 h-5 text-primary-500" />
                <h3 className="text-lg font-semibold text-white">Global Settings</h3>
              </div>

              {/* History Search Depth */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-secondary-300">
                    History Search Depth
                  </label>
                  <span className="text-xs text-secondary-400">
                    Time range for detecting transfer events
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <select
                    value={getHistorySearchDepth()}
                    onChange={(e) => updateHistorySearchDepth(parseFloat(e.target.value))}
                    className="flex-1 input-field"
                  >
                    <option value={0.25}>15 minutes</option>
                    <option value={0.5}>30 minutes</option>
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={6}>6 hours</option>
                    <option value={12}>12 hours</option>
                    <option value={24}>1 day</option>
                    <option value={48}>2 days</option>
                    <option value={168}>1 week</option>
                    <option value={336}>2 weeks</option>
                  </select>
                </div>
                
                  <p className="text-xs text-secondary-400 mt-1">
                    💡 This determines how far back to search for transfer events when detecting fraud and matching claims with transfers.
                  </p>
                </div>

                {/* Claim Search Depth */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-secondary-300">
                      Claim Search Depth
                    </label>
                    <span className="text-xs text-secondary-400">
                      Time range for fetching claims
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <select
                      value={getClaimSearchDepth()}
                      onChange={(e) => updateClaimSearchDepth(parseFloat(e.target.value))}
                      className="flex-1 input-field"
                    >
                      <option value={0.25}>15 minutes</option>
                      <option value={0.5}>30 minutes</option>
                      <option value={1}>1 hour</option>
                      <option value={2}>2 hours</option>
                      <option value={6}>6 hours</option>
                      <option value={12}>12 hours</option>
                      <option value={24}>1 day</option>
                      <option value={48}>2 days</option>
                      <option value={168}>1 week</option>
                      <option value={336}>2 weeks</option>
                    </select>
                  </div>
                  
                  <p className="text-xs text-secondary-400 mt-1">
                    💡 This determines how far back to fetch claims. The number of claims fetched is calculated based on network activity (claims per block ratio).
                  </p>
                </div>
              </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-secondary-800 bg-dark-800">
            <button
              onClick={handleResetSettings}
              className="btn-secondary flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="btn-primary flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Create New Assistant Dialog */}
      {Object.entries(NETWORKS).map(([networkKey, networkConfig]) => (
        showCreateAssistant[networkKey] && (
          <CreateNewAssistant
            key={networkKey}
            networkKey={networkKey}
            onClose={() => setShowCreateAssistant(prev => ({ ...prev, [networkKey]: false }))}
            onAssistantCreated={(assistantAddress, assistantConfig) => 
              handleAssistantCreated(networkKey, assistantAddress, assistantConfig)
            }
          />
        )
      ))}

      {/* Create New Bridge Dialog */}
      {Object.entries(NETWORKS).map(([networkKey, networkConfig]) => (
        showCreateBridge[networkKey] && (
          <CreateNewBridge
            key={networkKey}
            networkKey={networkKey}
            onClose={() => setShowCreateBridge(prev => ({ ...prev, [networkKey]: false }))}
            onBridgeCreated={(bridgeAddress, bridgeConfig) => 
              handleBridgeCreated(networkKey, bridgeAddress, bridgeConfig)
            }
          />
        )
      ))}
    </AnimatePresence>
  );
};

export default SettingsDialog; 