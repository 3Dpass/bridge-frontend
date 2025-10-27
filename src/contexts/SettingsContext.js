import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { NETWORKS, getBridgeInstances, P3D_PRECOMPILE_ADDRESS } from '../config/networks';

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize settings from localStorage or defaults
  const initializeSettings = useCallback(() => {
    try {
      const savedSettings = localStorage.getItem('bridgeSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      } else {
        // Initialize with default network config
        const defaultSettings = {
          // Global settings - search depth removed as unified fetcher gets all events
        };
        Object.keys(NETWORKS).forEach(networkKey => {
          const network = NETWORKS[networkKey];
          defaultSettings[networkKey] = {
            rpcUrl: network.rpcUrl,
            contracts: { ...network.contracts },
            tokens: { ...network.tokens },
            customRpc: false,
            customContracts: false,
            customTokens: false,
          };
        });
        setSettings(defaultSettings);
      }
      setIsInitialized(true);
    } catch (error) {
      console.error('Error initializing settings:', error);
      // Fallback to defaults
      const defaultSettings = {
        // Global settings
        historySearchDepth: 1, // Default to 1 hour
        claimSearchDepth: 1, // Default to 1 hour for claim search
      };
      Object.keys(NETWORKS).forEach(networkKey => {
        const network = NETWORKS[networkKey];
        defaultSettings[networkKey] = {
          rpcUrl: network.rpcUrl,
          contracts: { ...network.contracts },
          tokens: { ...network.tokens },
          isEVM: network.isEVM,
          oracles: { ...network.oracles },
          createdAt: network.createdAt,
          customRpc: false,
          customContracts: false,
          customTokens: false,
          customIsEVM: false,
          customOracles: false,
          customCreatedAt: false,
        };
      });
      setSettings(defaultSettings);
      setIsInitialized(true);
    }
  }, []);

  // Save settings to localStorage and update state
  const saveSettings = useCallback(async (newSettings) => {
    try {
      localStorage.setItem('bridgeSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
      return { success: true };
    } catch (error) {
      console.error('Error saving settings:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Update a specific network setting
  const updateNetworkSetting = useCallback((networkKey, field, value) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        [field]: value,
      }
    }));
  }, []);

  // Update contract address for a network
  const updateContractAddress = useCallback((networkKey, contractType, address) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        contracts: {
          ...prev[networkKey]?.contracts,
          [contractType]: address,
        }
      }
    }));
  }, []);

  // Update isEVM setting for a network
  const updateIsEVMSetting = useCallback((networkKey, isEVM) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        isEVM: isEVM,
        customIsEVM: true,
      }
    }));
  }, []);

  // Update oracles for a network
  const updateOracles = useCallback((networkKey, oracles) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        oracles: oracles,
        customOracles: true,
      }
    }));
  }, []);

  // Add or update a specific oracle for a network
  const updateOracle = useCallback((networkKey, oracleKey, oracleConfig) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        oracles: {
          ...prev[networkKey]?.oracles,
          [oracleKey]: oracleConfig,
        },
        customOracles: true,
      }
    }));
  }, []);

  // Remove a specific oracle from a network
  const removeOracle = useCallback((networkKey, oracleKey) => {
    setSettings(prev => {
      const newOracles = { ...prev[networkKey]?.oracles };
      delete newOracles[oracleKey];
      
      return {
        ...prev,
        [networkKey]: {
          ...prev[networkKey],
          oracles: newOracles,
          customOracles: Object.keys(newOracles).length > 0,
        }
      };
    });
  }, []);

  // Update createdAt for a network
  const updateCreatedAt = useCallback((networkKey, createdAt) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        createdAt: createdAt,
        customCreatedAt: true,
      }
    }));
  }, []);

  // Update token configuration for a network
  const updateTokenConfig = useCallback((networkKey, tokenSymbol, tokenConfig) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        tokens: {
          ...prev[networkKey]?.tokens,
          [tokenSymbol]: {
            address: tokenConfig.address,
            symbol: tokenConfig.symbol,
            name: tokenConfig.name,
            decimals: tokenConfig.decimals,
            standard: tokenConfig.standard || 'ERC20',
            isNative: tokenConfig.isNative || false,
            isPrecompile: tokenConfig.isPrecompile || false,
            isTestToken: tokenConfig.isTestToken || false,
            assetId: tokenConfig.assetId || null,
          },
        },
        customTokens: true,
      }
    }));
  }, []);

  // Add a new custom token to a network
  const addCustomToken = useCallback((networkKey, tokenSymbol, tokenConfig) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        tokens: {
          ...prev[networkKey]?.tokens,
          [tokenSymbol]: {
            address: tokenConfig.address,
            symbol: tokenConfig.symbol,
            name: tokenConfig.name,
            decimals: tokenConfig.decimals,
            standard: tokenConfig.standard || 'ERC20',
            isNative: tokenConfig.isNative || false,
            isPrecompile: NETWORKS[networkKey]?.erc20Precompile ? (tokenConfig.isPrecompile || false) : false,
            isTestToken: tokenConfig.isTestToken || false,
            ...(NETWORKS[networkKey]?.erc20Precompile && { assetId: tokenConfig.assetId || null }),
          },
        },
        customTokens: true,
      }
    }));
  }, []);

  // Remove a custom token from a network
  const removeCustomToken = useCallback((networkKey, tokenSymbol) => {
    setSettings(prev => {
      const newTokens = { ...prev[networkKey]?.tokens };
      delete newTokens[tokenSymbol];
      
      return {
        ...prev,
        [networkKey]: {
          ...prev[networkKey],
          tokens: newTokens,
          // Keep customTokens setting as is - don't change it when removing tokens
          // The user should control this setting explicitly
        }
      };
    });
  }, []);



  // Add or update a custom bridge instance for a specific network
  const addCustomBridgeInstanceForNetwork = useCallback((networkKey, bridgeKey, bridgeConfig) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        bridges: {
          ...prev[networkKey]?.bridges,
          [bridgeKey]: bridgeConfig,
        },
        customBridges: true,
      }
    }));
  }, []);

  // Remove a custom bridge instance for a specific network
  const removeCustomBridgeInstanceForNetwork = useCallback((networkKey, bridgeKey) => {
    setSettings(prev => {
      const newBridges = { ...prev[networkKey]?.bridges };
      delete newBridges[bridgeKey];
      
      // Check if there are any remaining custom bridges
      const hasCustomBridges = Object.keys(newBridges).length > 0;
      
      return {
        ...prev,
        [networkKey]: {
          ...prev[networkKey],
          bridges: newBridges,
          customBridges: hasCustomBridges,
        }
      };
    });
  }, []);

  // Add or update a custom assistant contract for a specific network
  const addCustomAssistantContractForNetwork = useCallback((networkKey, assistantKey, assistantConfig) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        assistants: {
          ...prev[networkKey]?.assistants,
          [assistantKey]: assistantConfig,
        },
        customAssistants: true,
      }
    }));
  }, []);

  // Remove a custom assistant contract for a specific network
  const removeCustomAssistantContractForNetwork = useCallback((networkKey, assistantKey) => {
    setSettings(prev => {
      const newAssistants = { ...prev[networkKey]?.assistants };
      delete newAssistants[assistantKey];
      
      // Check if there are any remaining custom assistants
      const hasCustomAssistants = Object.keys(newAssistants).length > 0;
      
      return {
        ...prev,
        [networkKey]: {
          ...prev[networkKey],
          assistants: newAssistants,
          customAssistants: hasCustomAssistants,
        }
      };
    });
  }, []);

  // Update manager address for an assistant
  const updateAssistantManager = useCallback((assistantAddress, newManagerAddress) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      
      // Find the network and assistant that contains this assistant address
      for (const networkKey in newSettings) {
        const networkSettings = newSettings[networkKey];
        if (networkSettings?.assistants) {
          for (const assistantKey in networkSettings.assistants) {
            const assistant = networkSettings.assistants[assistantKey];
            if (assistant.address === assistantAddress) {
              // Update the manager address
              newSettings[networkKey] = {
                ...networkSettings,
                assistants: {
                  ...networkSettings.assistants,
                  [assistantKey]: {
                    ...assistant,
                    managerAddress: newManagerAddress
                  }
                },
                customAssistants: true
              };
              
              // Save to localStorage
              try {
                localStorage.setItem('bridgeSettings', JSON.stringify(newSettings));
              } catch (error) {
                console.error('Error saving updated manager address to localStorage:', error);
              }
              
              return newSettings;
            }
          }
        }
      }
      
      return prev;
    });
  }, []);

  // Reset settings to defaults
  const resetSettings = useCallback(() => {
    try {
      localStorage.removeItem('bridgeSettings');
      const defaultSettings = {
        // Global settings
        historySearchDepth: 1, // Default to 1 hour
        claimSearchDepth: 1, // Default to 1 hour for claim search
      };
      Object.keys(NETWORKS).forEach(networkKey => {
        const network = NETWORKS[networkKey];
        defaultSettings[networkKey] = {
          rpcUrl: network.rpcUrl,
          contracts: { ...network.contracts },
          tokens: { ...network.tokens },
          isEVM: network.isEVM,
          oracles: { ...network.oracles },
          createdAt: network.createdAt,
          customRpc: false,
          customContracts: false,
          customTokens: false,
          customIsEVM: false,
          customOracles: false,
          customCreatedAt: false,
        };
      });
      setSettings(defaultSettings);
      return { success: true };
    } catch (error) {
      console.error('Error resetting settings:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Reset settings for a specific network
  const resetNetworkSettings = useCallback((networkKey) => {
    try {
      const network = NETWORKS[networkKey];
      if (!network) return { success: false, error: 'Network not found' };

      setSettings(prev => ({
        ...prev,
        [networkKey]: {
          rpcUrl: network.rpcUrl,
          contracts: { ...network.contracts },
          tokens: { ...network.tokens },
          isEVM: network.isEVM,
          oracles: { ...network.oracles },
          createdAt: network.createdAt,
          customRpc: false,
          customContracts: false,
          customTokens: false,
          customIsEVM: false,
          customOracles: false,
          customCreatedAt: false,
        }
      }));
      return { success: true };
    } catch (error) {
      console.error('Error resetting network settings:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Get network configuration with custom settings applied
  const getNetworkWithSettings = useCallback((networkKey) => {
    const defaultNetwork = NETWORKS[networkKey];
    
    if (!defaultNetwork) {
      return null;
    }

    if (!settings[networkKey]) {
      return defaultNetwork;
    }

    const networkSettings = settings[networkKey];
    const customNetwork = { ...defaultNetwork };

    // Apply custom RPC URL if enabled
    if (networkSettings.customRpc && networkSettings.rpcUrl) {
      customNetwork.rpcUrl = networkSettings.rpcUrl;
    }

    // Apply custom contract addresses if enabled
    if (networkSettings.customContracts && networkSettings.contracts) {
      customNetwork.contracts = {
        ...customNetwork.contracts,
        ...networkSettings.contracts,
      };
    }

    // Apply custom tokens if enabled
    if (networkSettings.customTokens && networkSettings.tokens) {
      customNetwork.tokens = {
        ...customNetwork.tokens,
        ...networkSettings.tokens,
      };
    }

    // Apply custom isEVM if enabled
    if (networkSettings.customIsEVM !== undefined) {
      customNetwork.isEVM = networkSettings.isEVM;
    }

    // Apply custom oracles if enabled
    if (networkSettings.customOracles && networkSettings.oracles) {
      customNetwork.oracles = {
        ...customNetwork.oracles,
        ...networkSettings.oracles,
      };
    }

    // Apply custom createdAt if enabled
    if (networkSettings.customCreatedAt !== undefined) {
      customNetwork.createdAt = networkSettings.createdAt;
    }

    return customNetwork;
  }, [settings]);

  // Get all networks with custom settings applied
  const getAllNetworksWithSettings = useCallback(() => {
    const customNetworks = {};
    
    Object.keys(NETWORKS).forEach(networkKey => {
      customNetworks[networkKey] = getNetworkWithSettings(networkKey);
    });

    return customNetworks;
  }, [getNetworkWithSettings]);

  // Get bridge instances with custom settings applied and structure compatibility
  const getBridgeInstancesWithSettings = useCallback(() => {
    const customBridgeInstances = { ...getBridgeInstances() };
    
    // Add custom bridges from each network's settings
    Object.entries(settings).forEach(([networkKey, networkSettings]) => {
      if (networkSettings?.bridges) {
        Object.assign(customBridgeInstances, networkSettings.bridges);
      }
    });

    return customBridgeInstances;
  }, [settings]);

  // Get assistant contracts with custom settings applied and structure compatibility
  const getAssistantContractsWithSettings = useCallback(() => {
    const customAssistantContracts = {};
    const seenAddresses = new Set();
    
    // First, add default assistants from network configuration
    Object.entries(NETWORKS).forEach(([networkKey, network]) => {
      if (network.assistants) {
        Object.entries(network.assistants).forEach(([assistantKey, assistant]) => {
          if (assistant && assistant.address && assistant.bridgeAddress) {
            customAssistantContracts[assistantKey] = {
              ...assistant,
              networkKey: networkKey
            };
            seenAddresses.add(assistant.address.toLowerCase());
          }
        });
      }
    });
    
    // Then, override with custom assistants from settings (this will replace duplicates)
    Object.entries(settings).forEach(([networkKey, networkSettings]) => {
      if (networkSettings?.assistants) {
        Object.entries(networkSettings.assistants).forEach(([assistantKey, assistant]) => {
          // Only add if it's a valid assistant with required fields
          if (assistant && assistant.address && assistant.bridgeAddress) {
            const addressLower = assistant.address.toLowerCase();
            
            // If we've seen this address before, replace the existing entry
            if (seenAddresses.has(addressLower)) {
              // Find and remove the existing entry with this address
              Object.keys(customAssistantContracts).forEach(key => {
                if (customAssistantContracts[key].address.toLowerCase() === addressLower) {
                  delete customAssistantContracts[key];
                }
              });
            }
            
            // Add the assistant with network information preserved
            customAssistantContracts[assistantKey] = {
              ...assistant,
              networkKey: networkKey // The network where this assistant is defined
            };
            seenAddresses.add(addressLower);
          }
        });
      }
    });

    console.log('🔍 getAssistantContractsWithSettings result:', {
      totalAssistants: Object.keys(customAssistantContracts).length,
      assistants: Object.keys(customAssistantContracts),
      seenAddresses: Array.from(seenAddresses),
      assistantDetails: Object.entries(customAssistantContracts).map(([key, assistant]) => ({
        key,
        address: assistant.address,
        type: assistant.type,
        bridgeAddress: assistant.bridgeAddress,
        description: assistant.description,
        networkKey: assistant.networkKey
      }))
    });

    return customAssistantContracts;
  }, [settings]);

  // Get available tokens for a network with custom settings applied
  const getNetworkTokens = useCallback((networkKey) => {
    const network = getNetworkWithSettings(networkKey);
    return network ? network.tokens : {};
  }, [getNetworkWithSettings]);

  // Get a specific token for a network with custom settings applied
  const getNetworkToken = useCallback((networkKey, tokenSymbol) => {
    const tokens = getNetworkTokens(networkKey);
    return tokens[tokenSymbol] || null;
  }, [getNetworkTokens]);

  // Check if network has custom settings
  const hasCustomSettings = useCallback((networkKey) => {
    if (!settings[networkKey]) {
      return false;
    }

    const networkSettings = settings[networkKey];
    return networkSettings.customRpc || networkSettings.customContracts || networkSettings.customTokens;
  }, [settings]);

  // Get all custom tokens across all networks
  const getAllCustomTokens = useCallback(() => {
    const customTokens = {};
    
    Object.keys(settings).forEach(networkKey => {
      if (settings[networkKey] && settings[networkKey].customTokens && settings[networkKey].tokens) {
        customTokens[networkKey] = settings[networkKey].tokens;
      }
    });
    
    return customTokens;
  }, [settings]);

  // Get all custom bridge instances
  const getAllCustomBridgeInstances = useCallback(() => {
    return settings.bridgeInstances || {};
  }, [settings]);

  // Get all custom assistant contracts
  const getAllCustomAssistantContracts = useCallback(() => {
    return settings.assistantContracts || {};
  }, [settings]);

  // Check if bridge instances have custom settings
  const hasCustomBridgeInstances = useCallback(() => {
    return settings.bridgeInstances && Object.keys(settings.bridgeInstances).length > 0;
  }, [settings]);

  // Check if assistant contracts have custom settings
  const hasCustomAssistantContracts = useCallback(() => {
    return settings.assistantContracts && Object.keys(settings.assistantContracts).length > 0;
  }, [settings]);

  // Get P3D precompile address constant
  const getP3DPrecompileAddress = useCallback(() => {
    return P3D_PRECOMPILE_ADDRESS;
  }, []);

  // Check if a token is a 3DPass precompile
  const is3DPassPrecompile = useCallback((tokenAddress) => {
    if (!tokenAddress) return false;
    
    // P3D precompile
    if (tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
      return true;
    }
    
    // Check if it's a known token from configuration
    const network = getNetworkWithSettings('THREEDPASS');
    if (network && network.tokens) {
      for (const [, token] of Object.entries(network.tokens)) {
        if (token.address.toLowerCase() === tokenAddress.toLowerCase()) {
          return true;
        }
      }
    }
    
    // Other 3DPass ERC20 precompiles (start with 0xFBFBFBFA)
    return tokenAddress.toLowerCase().startsWith('0xfbfbfbfa');
  }, [getNetworkWithSettings]);

  // Check if a token is the P3D precompile specifically
  const isP3DPrecompile = useCallback((tokenAddress) => {
    return tokenAddress && tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
  }, []);

  // Get 3DPass token by address
  const get3DPassTokenByAddress = useCallback((tokenAddress) => {
    if (!tokenAddress) return null;
    
    const network = getNetworkWithSettings('THREEDPASS');
    if (!network || !network.tokens) return null;
    
    const address = tokenAddress.toLowerCase();
    
    // Check if it's P3D
    if (address === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
      return network.tokens.P3D;
    }
    
    // Check other tokens by address
    for (const [, token] of Object.entries(network.tokens)) {
      if (token.address.toLowerCase() === address) {
        return token;
      }
    }
    
    return null;
  }, [getNetworkWithSettings]);

  // Get 3DPass token by symbol
  const get3DPassTokenBySymbol = useCallback((symbol) => {
    if (!symbol) return null;
    
    const network = getNetworkWithSettings('THREEDPASS');
    if (!network || !network.tokens) return null;
    
    return network.tokens[symbol] || null;
  }, [getNetworkWithSettings]);

  // Validate token configuration
  const validateTokenConfig = useCallback((tokenConfig) => {
    if (!tokenConfig) return false;
    
    const requiredFields = ['address', 'symbol', 'name', 'decimals'];
    for (const field of requiredFields) {
      if (!tokenConfig[field]) return false;
    }
    
    // Validate decimals is a number
    if (isNaN(parseInt(tokenConfig.decimals))) return false;
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenConfig.address)) return false;
    
    return true;
  }, []);

  // Get token type description
  const getTokenTypeDescription = useCallback((tokenConfig) => {
    if (!tokenConfig) return 'Unknown';
    
    if (tokenConfig.isNative) return 'Native Token';
    if (tokenConfig.isPrecompile) return 'Precompile Token';
    if (tokenConfig.isTestToken) return 'Test Token';
    return tokenConfig.standard || 'ERC20';
  }, []);

  // Get 3DPass token asset ID
  const get3DPassTokenAssetId = useCallback((tokenAddress) => {
    const token = get3DPassTokenByAddress(tokenAddress);
    return token ? token.assetId : null;
  }, [get3DPassTokenByAddress]);

  // Get 3DPass token decimals
  const get3DPassTokenDecimals = useCallback((tokenAddress) => {
    const token = get3DPassTokenByAddress(tokenAddress);
    return token ? token.decimals : null;
  }, [get3DPassTokenByAddress]);

  // Get 3DPass token decimals display multiplier
  const get3DPassTokenDecimalsDisplayMultiplier = useCallback((tokenAddress) => {
    const token = get3DPassTokenByAddress(tokenAddress);
    return token ? token.decimalsDisplayMultiplier : null;
  }, [get3DPassTokenByAddress]);

  // Get token by address across all networks (for P3D tokens that exist on multiple networks)
  const getTokenByAddress = useCallback((tokenAddress) => {
    if (!tokenAddress) return null;
    
    const address = tokenAddress.toLowerCase();
    
    // First, search through custom settings
    for (const [, network] of Object.entries(settings)) {
      if (network && network.tokens) {
        for (const [, token] of Object.entries(network.tokens)) {
          if (token.address && token.address.toLowerCase() === address) {
            return token;
          }
        }
      }
    }
    
    // If not found in custom settings, search through default network configurations
    for (const [, network] of Object.entries(NETWORKS)) {
      if (network && network.tokens) {
        for (const [, token] of Object.entries(network.tokens)) {
          if (token.address && token.address.toLowerCase() === address) {
            return token;
          }
        }
      }
      
      // Also check nativeCurrency for tokens like P3D on 3DPass
      if (network.nativeCurrency && network.nativeCurrency.symbol) {
        const nativeToken = {
          address: network.nativeCurrency.symbol === 'P3D' ? P3D_PRECOMPILE_ADDRESS : '0x0000000000000000000000000000000000000000',
          symbol: network.nativeCurrency.symbol,
          name: network.nativeCurrency.name,
          decimals: network.nativeCurrency.decimals,
          isNative: true,
          ...network.nativeCurrency // Include any additional properties like decimalsDisplayMultiplier
        };
        
        if (nativeToken.address && nativeToken.address.toLowerCase() === address) {
          return nativeToken;
        }
      }
    }
    
    return null;
  }, [settings]);

  // Get token decimals display multiplier across all networks
  const getTokenDecimalsDisplayMultiplier = useCallback((tokenAddress) => {
    const token = getTokenByAddress(tokenAddress);
    return token ? token.decimalsDisplayMultiplier : null;
  }, [getTokenByAddress]);

  // Get all 3DPass tokens
  const getAll3DPassTokens = useCallback(() => {
    const network = getNetworkWithSettings('THREEDPASS');
    return network ? network.tokens : {};
  }, [getNetworkWithSettings]);

  // Get all 3DPass token addresses
  const getAll3DPassTokenAddresses = useCallback(() => {
    const tokens = getAll3DPassTokens();
    return Object.values(tokens).map(token => token.address);
  }, [getAll3DPassTokens]);

  // Get all 3DPass token symbols
  const getAll3DPassTokenSymbols = useCallback(() => {
    const tokens = getAll3DPassTokens();
    return Object.keys(tokens);
  }, [getAll3DPassTokens]);

  // Get bridge instances by network with structure compatibility
  const getBridgeInstancesByNetwork = useCallback((networkSymbol) => {
    const bridgeInstances = getBridgeInstancesWithSettings();
    return Object.values(bridgeInstances).filter(bridge => {
      return bridge.homeNetwork === networkSymbol || bridge.foreignNetwork === networkSymbol;
    });
  }, [getBridgeInstancesWithSettings]);

  // Get assistant contracts by network with structure compatibility
  const getAssistantContractsByNetwork = useCallback((networkSymbol) => {
    const assistantContracts = getAssistantContractsWithSettings();
    const networkConfig = NETWORKS[networkSymbol];
    
    if (!networkConfig) return [];
    
    // Get assistants that belong to this specific network
    const networkAssistants = networkConfig.assistants || {};
    const networkAssistantKeys = Object.keys(networkAssistants);
    
    return Object.entries(assistantContracts).filter(([key, assistant]) => {
      return networkAssistantKeys.includes(key);
    }).map(([key, assistant]) => assistant);
  }, [getAssistantContractsWithSettings]);

  // Get bridge instances by type with structure compatibility
  const getBridgeInstancesByType = useCallback((type) => {
    const bridgeInstances = getBridgeInstancesWithSettings();
    return Object.values(bridgeInstances).filter(bridge => bridge.type === type);
  }, [getBridgeInstancesWithSettings]);

  // Get assistant contracts by type with structure compatibility
  const getAssistantContractsByType = useCallback((type) => {
    const assistantContracts = getAssistantContractsWithSettings();
    return Object.values(assistantContracts).filter(assistant => assistant.type === type);
  }, [getAssistantContractsWithSettings]);

  // Get bridge instance by address with structure compatibility
  const getBridgeInstanceByAddress = useCallback((address) => {
    const bridgeInstances = getBridgeInstancesWithSettings();
    return Object.values(bridgeInstances).find(bridge => bridge.address === address);
  }, [getBridgeInstancesWithSettings]);

  // Get assistant contract by address with structure compatibility
  const getAssistantContractByAddress = useCallback((address) => {
    const assistantContracts = getAssistantContractsWithSettings();
    return Object.values(assistantContracts).find(assistant => assistant.address === address);
  }, [getAssistantContractsWithSettings]);

  // Get assistant contract for a specific bridge with structure compatibility
  const getAssistantContractForBridge = useCallback((bridgeAddress) => {
    const assistantContracts = getAssistantContractsWithSettings();
    return Object.values(assistantContracts).find(assistant => assistant.bridgeAddress === bridgeAddress);
  }, [getAssistantContractsWithSettings]);

  // Check if a bridge instance is for 3DPass network
  const is3DPassBridge = useCallback((bridgeInstance) => {
    if (!bridgeInstance) return false;
    
    return bridgeInstance.homeNetwork === '3DPass' || bridgeInstance.foreignNetwork === '3DPass';
  }, []);

  // Check if an assistant contract is for 3DPass network
  const is3DPassAssistant = useCallback((assistantContract) => {
    if (!assistantContract) return false;
    
    // For simplified structure, check if assistant is deployed on 3DPass
    // This would need to be determined by the bridge address or deployment location
    return false; // TODO: Implement proper 3DPass detection for simplified structure
  }, []);

  // Get stake token symbol for a bridge instance
  const getStakeTokenSymbol = useCallback((bridgeInstance) => {
    if (!bridgeInstance) return null;
    return bridgeInstance.stakeTokenSymbol;
  }, []);

  // Get stake token address for a bridge instance
  const getStakeTokenAddress = useCallback((bridgeInstance) => {
    if (!bridgeInstance) return null;
    return bridgeInstance.stakeTokenAddress;
  }, []);

  // Initialize on mount

  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  const value = {
    // State
    settings,
    isInitialized,
    
    // Actions
    saveSettings,
    updateNetworkSetting,
    updateContractAddress,
    updateIsEVMSetting,
    updateOracles,
    updateOracle,
    removeOracle,
    updateCreatedAt,
    updateTokenConfig,
    addCustomToken,
    removeCustomToken,
    addCustomBridgeInstanceForNetwork,
    removeCustomBridgeInstanceForNetwork,
    addCustomAssistantContractForNetwork,
    removeCustomAssistantContractForNetwork,
    updateAssistantManager,
    resetSettings,
    resetNetworkSettings,
    
    // Utilities
    getNetworkWithSettings,
    getAllNetworksWithSettings,
    getBridgeInstancesWithSettings,
    getAssistantContractsWithSettings,
    getNetworkTokens,
    getNetworkToken,
    hasCustomSettings,
    getAllCustomTokens,
    getAllCustomBridgeInstances,
    getAllCustomAssistantContracts,
    hasCustomBridgeInstances,
    hasCustomAssistantContracts,
    
    // Bridge and Assistant utilities with structure compatibility
    getBridgeInstancesByNetwork,
    getAssistantContractsByNetwork,
    getBridgeInstancesByType,
    getAssistantContractsByType,
    getBridgeInstanceByAddress,
    getAssistantContractByAddress,
    getAssistantContractForBridge,
    is3DPassBridge,
    is3DPassAssistant,
    
    // Stake token utilities
    getStakeTokenSymbol,
    getStakeTokenAddress,
    
    // 3DPass specific utilities
    getP3DPrecompileAddress,
    is3DPassPrecompile,
    isP3DPrecompile,
    get3DPassTokenByAddress,
    get3DPassTokenBySymbol,
    get3DPassTokenAssetId,
    get3DPassTokenDecimals,
    get3DPassTokenDecimalsDisplayMultiplier,
    getTokenByAddress,
    getTokenDecimalsDisplayMultiplier,
    getAll3DPassTokens,
    getAll3DPassTokenAddresses,
    getAll3DPassTokenSymbols,
    
    // Token validation utilities
    validateTokenConfig,
    getTokenTypeDescription,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}; 