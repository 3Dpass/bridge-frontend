import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { autoDetectToken, isNativeToken } from '../utils/token-detector';
import { autoDetectBridge } from '../utils/bridge-detector';
import { autoDetectAssistant } from '../utils/assistant-detector';
import { updateBridgeInfoFromRegistry, hasBridgesRegistry } from '../utils/update-bridge-info';
import { getProvider, updateProviderSettings } from '../utils/provider-manager';
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
  Search
} from 'lucide-react';
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
    resetSettings,
    validateTokenConfig,
    getBridgeInstancesWithSettings,
    getAssistantContractsWithSettings
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

  // Update provider manager when settings change
  useEffect(() => {
    updateProviderSettings(settings);
  }, [settings]);

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
    };

    if (!validateTokenConfig(tokenConfig)) {
      toast.error('Invalid token configuration');
      return;
    }

    addCustomToken(networkKey, token.symbol, tokenConfig);

    setNewToken(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddToken(prev => ({ ...prev, [networkKey]: false }));
    setDetectedTokens(prev => ({ ...prev, [networkKey]: false }));
    toast.success(`Token ${token.symbol} added successfully`);
  };

  // Handle removing a token
  const handleRemoveToken = (networkKey, tokenSymbol) => {
    removeCustomToken(networkKey, tokenSymbol);
    toast.success(`Token ${tokenSymbol} removed successfully`);
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

    addCustomBridgeInstanceForNetwork(networkKey, bridge.key, {
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
    });

    setNewBridge(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddBridge(prev => ({ ...prev, [networkKey]: false }));
    toast.success(`Bridge ${bridge.key} added successfully`);
  };

  // Handle removing a bridge instance
  const handleRemoveBridge = (networkKey, bridgeKey) => {
    removeCustomBridgeInstanceForNetwork(networkKey, bridgeKey);
    toast.success(`Bridge ${bridgeKey} removed successfully`);
  };

  // Handle adding a new assistant contract
  const handleAddAssistant = (networkKey) => {
    const assistant = newAssistant[networkKey];
    if (!assistant || !assistant.key || !assistant.address || !assistant.type || !assistant.bridgeAddress) {
      toast.error('Please fill in all assistant fields');
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

    addCustomAssistantContractForNetwork(networkKey, assistant.key, {
      address: assistant.address,
      type: assistant.type,
      bridgeAddress: assistant.bridgeAddress,
      description: assistant.description || `${assistant.type} Assistant`,
      shareSymbol: assistant.shareSymbol || `${assistant.type.toUpperCase()}A`,
      shareName: assistant.shareName || `${assistant.type} assistant share`
    });

    setNewAssistant(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddAssistant(prev => ({ ...prev, [networkKey]: false }));
    toast.success(`Assistant ${assistant.key} added successfully`);
  };

  // Handle removing an assistant contract
  const handleRemoveAssistant = (networkKey, assistantKey) => {
    removeCustomAssistantContractForNetwork(networkKey, assistantKey);
    toast.success(`Assistant ${assistantKey} removed successfully`);
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
        // Update bridges
        Object.entries(result.bridges).forEach(([bridgeKey, bridgeConfig]) => {
          addCustomBridgeInstanceForNetwork(networkKey, bridgeKey, bridgeConfig);
        });

        // Update assistants
        Object.entries(result.assistants).forEach(([assistantKey, assistantConfig]) => {
          addCustomAssistantContractForNetwork(networkKey, assistantKey, assistantConfig);
        });

        // Update tokens
        Object.entries(result.discoveredTokens).forEach(([tokenKey, tokenConfig]) => {
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
                        <Search className="w-4 h-4" />
                        Discover from Registry
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
                        value={settings[networkKey]?.rpcUrl || ''}
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
                        onClick={() => copyToClipboard(settings[networkKey]?.rpcUrl, 'RPC URL')}
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
                    
                    {/* Provider Info */}
                    <div className="mt-2 p-2 bg-dark-700 rounded border border-secondary-600">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-secondary-400">Current Provider:</span>
                        <span className="text-secondary-300 font-mono">
                          {(() => {
                            try {
                              const provider = getProvider(networkKey);
                              const url = provider.connection.url;
                              return url.includes('127.0.0.1') ? 'Local (127.0.0.1)' : 'Remote';
                            } catch (error) {
                              return 'Default';
                            }
                          })()}
                        </span>
                      </div>
                      <div className="text-xs text-secondary-500 mt-1 break-all">
                        {(() => {
                          try {
                            const provider = getProvider(networkKey);
                            return provider.connection.url;
                          } catch (error) {
                            return NETWORKS[networkKey]?.rpcUrl || 'Unknown';
                          }
                        })()}
                      </div>
                    </div>
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
                            {settings[networkKey]?.customTokens && (
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
                            Add Custom Token
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
                                
                                // Auto-detect token when address is valid
                                if (address && validateTokenAddress(address)) {
                                  try {
                                    // Get the appropriate provider for this network
                                    const networkProvider = getProvider(networkKey);
                                    console.log(`Auto-detecting token on ${networkKey} using provider:`, networkProvider.connection.url);
                                    
                                    const result = await autoDetectToken(networkProvider, address, networkKey);
                                    if (result.success) {
                                      setNewToken(prev => ({
                                        ...prev,
                                        [networkKey]: {
                                          ...prev[networkKey],
                                          ...result.tokenInfo
                                        }
                                      }));
                                      setDetectedTokens(prev => ({
                                        ...prev,
                                        [networkKey]: true
                                      }));
                                      toast.success(`Detected ${result.tokenInfo.symbol} token`);
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
                                className="w-full input-field text-sm"
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
                              className="w-full input-field text-sm"
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
                                className="btn-primary px-3 flex-1 sm:flex-none"
                              >
                                Add
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
                                <button
                                  onClick={() => handleRemoveBridge(networkKey, bridgeKey)}
                                  className="btn-error px-1 py-0.5"
                                  title="Remove bridge"
                                >
                                  <Trash2 className="w-3 h-3" />
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
                              <button
                            onClick={() => setShowAddBridge(prev => ({ ...prev, [networkKey]: true }))}
                    className="btn-secondary flex items-center gap-2 w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add Custom Bridge Instance
                  </button>
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
                          
                          // Auto-detect bridge when a valid address is entered
                          if (address && validateContractAddress(address)) {
                            console.log(`🔍 Auto-detecting bridge at: ${address} on network: ${networkKey}`);
                            try {
                              // Get the appropriate provider for this network
                              const networkProvider = getProvider(networkKey);
                              const providerUrl = networkProvider.connection.url;
                              console.log(`Using provider for ${networkKey}:`, providerUrl);
                              
                              // Show which provider is being used
                              toast.loading(`Detecting bridge using ${providerUrl.includes('127.0.0.1') ? 'local' : 'remote'} provider...`);
                              
                              const result = await autoDetectBridge(networkProvider, address, networkKey, settings);
                              console.log('Bridge detection result:', result);
                              console.log('Bridge config details:', result.bridgeConfig);
                              
                              if (result.success) {
                                // Generate unique bridge key
                                const generatedKey = generateBridgeKey(result.bridgeConfig, networkKey);
                                
                                setNewBridge(prev => ({
                                  ...prev,
                                  [networkKey]: {
                                    ...prev[networkKey],
                                    ...result.bridgeConfig,
                                    key: generatedKey
                                  }
                                }));
                                
                                toast.success(`Detected ${result.bridgeType} bridge with key: ${generatedKey}`);
                                console.log(`✅ Successfully detected ${result.bridgeType} bridge with key: ${generatedKey}`);
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
                          !newBridge[networkKey]?.key ? 'border-error-500' : ''
                        }`}
                      />
                      <select
                                value={newBridge[networkKey]?.type || ''}
                                onChange={(e) => setNewBridge(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], type: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                          !newBridge[networkKey]?.type ? 'border-error-500' : ''
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
                        className="input-field text-sm"
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
                        className="input-field text-sm"
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
                          !newBridge[networkKey]?.homeTokenAddress || (newBridge[networkKey]?.homeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.homeTokenAddress))
                            ? 'border-error-500'
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
                          !newBridge[networkKey]?.homeTokenSymbol ? 'border-error-500' : ''
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
                          !newBridge[networkKey]?.foreignTokenAddress || (newBridge[networkKey]?.foreignTokenAddress && !validateTokenAddress(newBridge[networkKey]?.foreignTokenAddress))
                            ? 'border-error-500'
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
                          !newBridge[networkKey]?.foreignTokenSymbol ? 'border-error-500' : ''
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
                          !newBridge[networkKey]?.stakeTokenAddress || (newBridge[networkKey]?.stakeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.stakeTokenAddress))
                            ? 'border-error-500'
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
                        className="input-field text-sm"
                      />
                    </div>
                    
                    {/* Description */}
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
                    
                    {/* Address validation error messages */}
                    {newBridge[networkKey]?.homeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.homeTokenAddress) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid home token address
                      </p>
                    )}
                    {newBridge[networkKey]?.foreignTokenAddress && !validateTokenAddress(newBridge[networkKey]?.foreignTokenAddress) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid foreign token address
                      </p>
                    )}
                    {newBridge[networkKey]?.stakeTokenAddress && !validateTokenAddress(newBridge[networkKey]?.stakeTokenAddress) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid stake token address
                      </p>
                    )}
                    {(!newBridge[networkKey]?.homeTokenAddress || !newBridge[networkKey]?.foreignTokenAddress || !newBridge[networkKey]?.stakeTokenAddress) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        All token addresses are required
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
                                  !validateTokenAddress(newBridge[networkKey]?.stakeTokenAddress)
                                }
                        className="btn-primary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add
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
                            {!newBridge[networkKey]?.address && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Bridge address is required
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
                                {assistantConfig.type} Assistant
                              </span>
                              {settings[networkKey]?.assistants?.[assistantKey] && (
                                <span className="px-1 py-0.5 bg-yellow-600 text-white text-xs rounded-full">Custom</span>
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
                                <button
                                  onClick={() => handleRemoveAssistant(networkKey, assistantKey)}
                                  className="btn-error px-1 py-0.5"
                                  title="Remove assistant"
                                >
                                  <Trash2 className="w-3 h-3" />
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
                          <button
                            onClick={() => setShowAddAssistant(prev => ({ ...prev, [networkKey]: true }))}
                    className="btn-secondary flex items-center gap-2 w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add Custom Assistant Contract
                  </button>
                ) : (
                          <div className="p-3 bg-dark-800 rounded border border-secondary-700 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Assistant Key (e.g., CUSTOM_USDT_IMPORT_ASSISTANT)"
                                value={newAssistant[networkKey]?.key || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], key: e.target.value }
                                }))}
                        className="input-field text-sm"
                      />
                      <select
                                value={newAssistant[networkKey]?.type || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], type: e.target.value }
                                }))}
                        className="input-field text-sm"
                      >
                        <option value="">Select Type</option>
                        <option value="import">Import Assistant</option>
                        <option value="export">Export Assistant</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Assistant Address (0x...)"
                                value={newAssistant[networkKey]?.address || ''}
                                onChange={async (e) => {
                                  const address = e.target.value;
                                  setNewAssistant(prev => ({ 
                                    ...prev, 
                                    [networkKey]: { ...prev[networkKey], address }
                                  }));
                                  
                                  // Auto-detect assistant when address is valid
                                  if (address && validateContractAddress(address)) {
                                    try {
                                      // Get the appropriate provider for this network
                                      const networkProvider = getProvider(networkKey);
                                      console.log(`Auto-detecting assistant on ${networkKey} using provider:`, networkProvider.connection.url);
                                      
                                      const result = await autoDetectAssistant(networkProvider, address, networkKey);
                                      if (result.success) {
                                        setNewAssistant(prev => ({
                                          ...prev,
                                          [networkKey]: {
                                            ...prev[networkKey],
                                            ...result.assistantConfig
                                          }
                                        }));
                                        toast.success(`Detected ${result.assistantConfig.type} assistant`);
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
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Bridge Address (0x...)"
                                value={newAssistant[networkKey]?.bridgeAddress || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], bridgeAddress: e.target.value }
                                }))}
                        className={`input-field text-sm ${
                                  newAssistant[networkKey]?.bridgeAddress && !validateContractAddress(newAssistant[networkKey]?.bridgeAddress)
                            ? 'border-error-500'
                            : ''
                        }`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Share Symbol (e.g., P3DEA)"
                                value={newAssistant[networkKey]?.shareSymbol || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], shareSymbol: e.target.value }
                                }))}
                        className="input-field text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Share Name (e.g., P3D export assistant share)"
                                value={newAssistant[networkKey]?.shareName || ''}
                                onChange={(e) => setNewAssistant(prev => ({ 
                                  ...prev, 
                                  [networkKey]: { ...prev[networkKey], shareName: e.target.value }
                                }))}
                        className="input-field text-sm"
                      />
                    </div>
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
                    <div className="flex gap-2">
                      <button
                                onClick={() => handleAddAssistant(networkKey)}
                        className="btn-primary px-3"
                      >
                        Add
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




              {/* Help Section */}
              <div className="card bg-secondary-900/50">
                <h4 className="text-sm font-semibold text-white mb-2">Need Help?</h4>
                <div className="text-xs text-secondary-400 space-y-1">
                  <p>• Use custom RPC URLs for better performance or privacy</p>
                  <p>• Custom contract addresses allow you to use your own deployments</p>
                  <p>• Add custom tokens to support additional ERC-20 tokens</p>
                  <p>• Configure custom bridge instances for each network</p>
                  <p>• Set up assistant contracts for automated bridge operations per network</p>
                  <p>• Bridge and assistant management is now network-specific</p>
                  <p>• Settings are saved locally in your browser</p>
                  <p>• Reset to defaults if you encounter issues</p>
                </div>
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
    </AnimatePresence>
  );
};

export default SettingsDialog; 