import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { getNetworkWithSettings } from '../utils/settings';
import { NETWORKS } from '../config/networks';
import { COUNTERSTAKE_FACTORY_ABI, FACTORY_ABI } from '../contracts/abi';
import { 
  X, 
  CheckCircle, 
  Coins,
  ArrowRightLeft,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';

// Constants
const DEFAULT_COUNTERSTAKE_COEF = '160'; // 1.6%
const DEFAULT_RATIO = '110'; // 1.1%
const DEFAULT_LARGE_THRESHOLD = '10000'; // 10k tokens
const DEFAULT_CHALLENGING_PERIODS = [14*3600, 3*24*3600, 7*24*3600, 30*24*3600]; // [14h, 3d, 7d, 30d]
const DEFAULT_LARGE_CHALLENGING_PERIODS = [1*7*24*3600, 30*24*3600, 60*24*3600]; // [1week, 30days, 60days]
const GAS_LIMIT = 5000000;

const CreateNewBridge = ({ networkKey, onClose, onBridgeCreated }) => {
  const { signer, account } = useWeb3();
  const { settings } = useSettings();
  const [isCreating, setIsCreating] = useState(false);
  const [bridgeType, setBridgeType] = useState('');
  const [homeNetwork, setHomeNetwork] = useState('');
  const [foreignNetwork, setForeignNetwork] = useState('');
  const [homeAsset, setHomeAsset] = useState('');
  const [foreignAsset, setForeignAsset] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [stakeToken, setStakeToken] = useState('');
  const [oracleAddress, setOracleAddress] = useState('');
  const [counterstakeCoef, setCounterstakeCoef] = useState(DEFAULT_COUNTERSTAKE_COEF);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [largeThreshold, setLargeThreshold] = useState(DEFAULT_LARGE_THRESHOLD);
  const [challengingPeriods, setChallengingPeriods] = useState(DEFAULT_CHALLENGING_PERIODS);
  const [largeChallengingPeriods, setLargeChallengingPeriods] = useState(DEFAULT_LARGE_CHALLENGING_PERIODS);

  const [createdBridgeAddress, setCreatedBridgeAddress] = useState('');

  const networkConfig = NETWORKS[networkKey];
  const isHybridNetwork = networkConfig?.erc20Precompile;

  // Get factory address from settings or config
  const getFactoryAddress = () => {
    const settingsFactory = settings[networkKey]?.contracts?.counterstakeFactory;
    const configFactory = networkConfig?.contracts?.counterstakeFactory;
    return settingsFactory || configFactory;
  };

  // Get network name from network key
  const getNetworkName = (networkKey) => {
    const network = getNetworkWithSettings(networkKey);
    return network?.name || networkKey;
  };

  // Get available oracles for this network
  const getAvailableOracles = useCallback(() => {
    const networkWithSettings = getNetworkWithSettings(networkKey);
    const oracles = networkWithSettings?.oracles || {};
    
    return Object.entries(oracles).map(([oracleKey, oracleConfig]) => ({
      key: oracleKey,
      address: oracleConfig.address,
      name: oracleConfig.name,
      description: oracleConfig.description
    }));
  }, [networkKey]);

  // Get available networks (excluding current network)
  const getAvailableNetworks = useCallback(() => {
    return Object.entries(NETWORKS)
      .filter(([key, config]) => key !== networkKey)
      .map(([key, config]) => ({
        key,
        name: config.name,
        symbol: config.symbol,
        erc20Precompile: config.erc20Precompile
      }));
  }, [networkKey]);

  // Get available networks for Home Network selection (excluding current network)
  const getAvailableHomeNetworks = useCallback(() => {
    return Object.entries(NETWORKS)
      .filter(([key, config]) => key !== networkKey)
      .map(([key, config]) => ({
        key,
        name: config.name,
        symbol: config.symbol,
        erc20Precompile: config.erc20Precompile
      }));
  }, [networkKey]);

  // Get available tokens for a network (excluding assistant share tokens)
  const getAvailableTokens = useCallback((networkKey) => {
    const networkConfig = NETWORKS[networkKey];
    if (!networkConfig?.tokens) return [];
    
    // Get assistant addresses to exclude
    const assistantAddresses = new Set();
    if (networkConfig.assistants) {
      Object.values(networkConfig.assistants).forEach(assistant => {
        if (assistant.address) {
          assistantAddresses.add(assistant.address.toLowerCase());
        }
      });
    }
    
    return Object.entries(networkConfig.tokens)
      .filter(([key, tokenConfig]) => {
        // Exclude tokens that have the same address as an assistant (assistant share tokens)
        return !assistantAddresses.has(tokenConfig.address.toLowerCase());
      })
      .map(([key, tokenConfig]) => ({
        key,
        address: tokenConfig.address,
        symbol: tokenConfig.symbol,
        name: tokenConfig.name,
        decimals: tokenConfig.decimals,
        isPrecompile: tokenConfig.isPrecompile,
        isNative: tokenConfig.isNative
      }));
  }, []);

  // Get available stake tokens for the current network (excluding assistant share tokens)
  const getAvailableStakeTokens = useCallback(() => {
    const networkWithSettings = getNetworkWithSettings(networkKey);
    const tokens = networkWithSettings?.tokens || {};
    
    // Get assistant addresses to exclude
    const assistantAddresses = new Set();
    if (networkWithSettings.assistants) {
      Object.values(networkWithSettings.assistants).forEach(assistant => {
        if (assistant.address) {
          assistantAddresses.add(assistant.address.toLowerCase());
        }
      });
    }
    
    return Object.entries(tokens)
      .filter(([key, tokenConfig]) => {
        // Only include native or precompile tokens, and exclude assistant share tokens
        return (tokenConfig.isNative || tokenConfig.isPrecompile) && 
               !assistantAddresses.has(tokenConfig.address.toLowerCase());
      })
      .map(([key, tokenConfig]) => ({
        key,
        address: tokenConfig.address,
        symbol: tokenConfig.symbol,
        name: tokenConfig.name,
        decimals: tokenConfig.decimals,
        isPrecompile: tokenConfig.isPrecompile,
        isNative: tokenConfig.isNative
      }));
  }, [networkKey]);

  // Get available non-native precompiles for Import Wrapper bridges (excluding assistant share tokens)
  const getAvailableNonNativePrecompiles = useCallback(() => {
    const networkWithSettings = getNetworkWithSettings(networkKey);
    const tokens = networkWithSettings?.tokens || {};
    
    // Get assistant addresses to exclude
    const assistantAddresses = new Set();
    if (networkWithSettings.assistants) {
      Object.values(networkWithSettings.assistants).forEach(assistant => {
        if (assistant.address) {
          assistantAddresses.add(assistant.address.toLowerCase());
        }
      });
    }
    
    return Object.entries(tokens)
      .filter(([key, tokenConfig]) => {
        // Only include non-native precompiles and exclude assistant share tokens
        return tokenConfig.isPrecompile && 
               !tokenConfig.isNative && 
               !assistantAddresses.has(tokenConfig.address.toLowerCase());
      })
      .map(([key, tokenConfig]) => ({
        key,
        address: tokenConfig.address,
        symbol: tokenConfig.symbol,
        name: tokenConfig.name,
        decimals: tokenConfig.decimals,
        isPrecompile: tokenConfig.isPrecompile,
        isNative: tokenConfig.isNative
      }));
  }, [networkKey]);

  // Auto-determine bridge type based on network configuration
  useEffect(() => {
    if (isHybridNetwork) {
      // For hybrid networks (like 3DPass), default to import_wrapper
      setBridgeType('import_wrapper');
    } else {
      // For regular EVM networks, default to export
      setBridgeType('export');
    }
  }, [isHybridNetwork]);

  // Auto-set home network based on current network and bridge type
  useEffect(() => {
    if (bridgeType === 'export' || bridgeType === 'export_wrapper') {
      // For export bridges: home network is current network
      setHomeNetwork(networkKey);
    } else if (bridgeType === 'import' || bridgeType === 'import_wrapper') {
      // For import bridges: foreign network is current network
      setForeignNetwork(networkKey);
    }
  }, [networkKey, bridgeType]);

  // Auto-set stake token based on network
  useEffect(() => {
    const stakeTokens = getAvailableStakeTokens();
    if (stakeTokens.length > 0) {
      // Prefer native token as stake token
      const nativeToken = stakeTokens.find(token => token.isNative);
      if (nativeToken) {
        setStakeToken(nativeToken.address);
      } else {
        setStakeToken(stakeTokens[0].address);
      }
    }
  }, [getAvailableStakeTokens]);

  // Auto-set oracle if only one available
  useEffect(() => {
    const oracles = getAvailableOracles();
    if (oracles.length === 1) {
      setOracleAddress(oracles[0].address);
    }
  }, [getAvailableOracles]);

  // Create bridge contract
  const handleCreateBridge = async () => {
    if (!signer || !account) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!bridgeType || !stakeToken) {
      toast.error('Please fill in all required fields');
      return;
    }

    if ((bridgeType === 'import' || bridgeType === 'import_wrapper') && !oracleAddress) {
      toast.error('Oracle address is required for import bridges');
      return;
    }

    // Auto-set networks and assets based on bridge type
    let finalHomeNetwork, finalForeignNetwork, finalHomeAsset, finalForeignAsset;
    
    if (bridgeType === 'export' || bridgeType === 'export_wrapper') {
      // Export bridges: home = current network, foreign = user selected
      finalHomeNetwork = getNetworkName(networkKey);
      finalForeignNetwork = getNetworkName(foreignNetwork);
      finalHomeAsset = stakeToken; // Home asset is the stake token
      finalForeignAsset = foreignAsset; // User selects foreign asset
    } else if (bridgeType === 'import') {
      // Import bridges: home = user selected, foreign = current network
      finalHomeNetwork = getNetworkName(homeNetwork);
      finalForeignNetwork = getNetworkName(networkKey);
      finalHomeAsset = homeAsset; // User selects home asset
      finalForeignAsset = stakeToken; // Foreign asset is the stake token
    } else if (bridgeType === 'import_wrapper') {
      // Import wrapper bridges: home = user selected, foreign = current network
      finalHomeNetwork = getNetworkName(homeNetwork);
      finalForeignNetwork = getNetworkName(networkKey);
      finalHomeAsset = homeAsset; // User selects home asset
      finalForeignAsset = foreignAsset; // User selects foreign asset (non-native precompile)
    }

    console.log('Final Network/Asset Assignment:');
    console.log('  Home Network:', finalHomeNetwork, '(from key:', bridgeType === 'export' || bridgeType === 'export_wrapper' ? networkKey : homeNetwork, ')');
    console.log('  Foreign Network:', finalForeignNetwork, '(from key:', bridgeType === 'import' || bridgeType === 'import_wrapper' ? networkKey : foreignNetwork, ')');
    console.log('  Home Asset:', finalHomeAsset);
    console.log('  Foreign Asset:', finalForeignAsset);

    // Validate required fields based on bridge type
    if (bridgeType === 'import') {
      if (!finalHomeNetwork || !finalForeignNetwork || !finalHomeAsset || !tokenName.trim() || !tokenSymbol.trim()) {
        toast.error('Please fill in all required fields including token name and symbol');
        return;
      }
    } else if (bridgeType === 'import_wrapper') {
      if (!finalHomeNetwork || !finalForeignNetwork || !finalHomeAsset || !finalForeignAsset) {
        toast.error('Please fill in all required fields including foreign asset');
        return;
      }
    } else if (bridgeType === 'export' || bridgeType === 'export_wrapper') {
      if (!finalForeignNetwork || !finalForeignAsset) {
        toast.error('Please fill in all required fields including foreign network and asset');
        return;
      }
    }

    const factoryAddress = getFactoryAddress();
    if (!factoryAddress) {
      toast.error('Counterstake factory address not found');
      return;
    }

    setIsCreating(true);
    try {
      // Use the correct ABI based on network type
      const factoryABI = isHybridNetwork ? COUNTERSTAKE_FACTORY_ABI : FACTORY_ABI;
      const factoryContract = new ethers.Contract(factoryAddress, factoryABI, signer);
      
      console.log('=== Bridge Creation Parameters ===');
      console.log('Network:', networkKey, '(Hybrid:', isHybridNetwork, ')');
      console.log('Bridge Type:', bridgeType);
      console.log('Factory Address:', factoryAddress);
      console.log('Factory ABI Type:', isHybridNetwork ? 'COUNTERSTAKE_FACTORY_ABI' : 'FACTORY_ABI');
      console.log('Account:', account);
      
      let tx;
      
      if (bridgeType === 'export') {
        // Create export bridge
        // For export bridges: foreign_network, foreign_asset, tokenAddress (stake token)
        const exportParams = {
          foreign_network: finalForeignNetwork,
          foreign_asset: finalForeignAsset,
          tokenAddress: finalHomeAsset,
          counterstake_coef100: parseInt(counterstakeCoef),
          ratio100: parseInt(ratio),
          large_threshold: ethers.utils.parseEther(largeThreshold),
          challenging_periods: challengingPeriods,
          large_challenging_periods: largeChallengingPeriods,
          gasLimit: GAS_LIMIT
        };
        
        console.log('Creating Export Bridge with parameters:', exportParams);
        
        tx = await factoryContract.createExport(
          finalForeignNetwork, // foreign_network
          finalForeignAsset, // foreign_asset
          finalHomeAsset, // tokenAddress (stake token)
          parseInt(counterstakeCoef), // counterstake_coef100
          parseInt(ratio), // ratio100
          ethers.utils.parseEther(largeThreshold), // large_threshold
          challengingPeriods, // challenging_periods
          largeChallengingPeriods, // large_challenging_periods
          { gasLimit: GAS_LIMIT }
        );
      } else if (bridgeType === 'import') {
        // Create import bridge
        // For import bridges: home_network, home_asset, stakeTokenAddr
        const importParams = {
          home_network: finalHomeNetwork,
          home_asset: finalHomeAsset,
          name: tokenName.trim(),
          symbol: tokenSymbol.trim(),
          stakeTokenAddr: stakeToken,
          oracleAddr: oracleAddress,
          counterstake_coef100: parseInt(counterstakeCoef),
          ratio100: parseInt(ratio),
          large_threshold: ethers.utils.parseEther(largeThreshold),
          challenging_periods: challengingPeriods,
          large_challenging_periods: largeChallengingPeriods,
          gasLimit: GAS_LIMIT
        };
        
        console.log('Creating Import Bridge with parameters:', importParams);
        
        tx = await factoryContract.createImport(
          finalHomeNetwork, // home_network
          finalHomeAsset, // home_asset
          tokenName.trim(), // name (new token name)
          tokenSymbol.trim(), // symbol (new token symbol)
          stakeToken, // stakeTokenAddr
          oracleAddress, // oracleAddr
          parseInt(counterstakeCoef), // counterstake_coef100
          parseInt(ratio), // ratio100
          ethers.utils.parseEther(largeThreshold), // large_threshold
          challengingPeriods, // challenging_periods
          largeChallengingPeriods, // large_challenging_periods
          { gasLimit: GAS_LIMIT }
        );
      } else if (bridgeType === 'import_wrapper') {
        // Create import wrapper bridge
        // For import wrapper: home_network, home_asset, precompileAddress, stakeTokenAddr, oracleAddr
        const importWrapperParams = {
          home_network: finalHomeNetwork,
          home_asset: finalHomeAsset,
          precompileAddress: finalForeignAsset,
          stakeTokenAddr: stakeToken,
          oracleAddr: oracleAddress,
          counterstake_coef100: parseInt(counterstakeCoef),
          ratio100: parseInt(ratio),
          large_threshold: ethers.utils.parseEther(largeThreshold),
          challenging_periods: challengingPeriods,
          large_challenging_periods: largeChallengingPeriods,
          gasLimit: GAS_LIMIT
        };
        
        console.log('Creating Import Wrapper Bridge with parameters:', importWrapperParams);
        
        tx = await factoryContract.createImportWrapper(
          finalHomeNetwork, // home_network
          finalHomeAsset, // home_asset
          finalForeignAsset, // precompileAddress
          stakeToken, // stakeTokenAddr
          oracleAddress, // oracleAddr
          parseInt(counterstakeCoef), // counterstake_coef100
          parseInt(ratio), // ratio100
          ethers.utils.parseEther(largeThreshold), // large_threshold
          challengingPeriods, // challenging_periods
          largeChallengingPeriods, // large_challenging_periods
          { gasLimit: GAS_LIMIT }
        );
      } else if (bridgeType === 'export_wrapper') {
        // Create export wrapper bridge
        // For export wrapper: foreign_network, foreign_asset, precompileAddress, stakeTokenAddr (NO oracle)
        const exportWrapperParams = {
          foreign_network: finalForeignNetwork,
          foreign_asset: finalForeignAsset,
          precompileAddress: finalHomeAsset,
          stakeTokenAddr: finalHomeAsset,
          counterstake_coef100: parseInt(counterstakeCoef),
          ratio100: parseInt(ratio),
          large_threshold: ethers.utils.parseEther(largeThreshold),
          challenging_periods: challengingPeriods,
          large_challenging_periods: largeChallengingPeriods,
          gasLimit: GAS_LIMIT
        };
        
        console.log('Creating Export Wrapper Bridge with parameters:', exportWrapperParams);
        
        tx = await factoryContract.createExportWrapper(
          finalForeignNetwork, // foreign_network
          finalForeignAsset, // foreign_asset
          finalHomeAsset, // precompileAddress
          finalHomeAsset, // stakeTokenAddr
          parseInt(counterstakeCoef), // counterstake_coef100
          parseInt(ratio), // ratio100
          ethers.utils.parseEther(largeThreshold), // large_threshold
          challengingPeriods, // challenging_periods
          largeChallengingPeriods, // large_challenging_periods
          { gasLimit: GAS_LIMIT }
        );
      }

      toast.loading('Creating bridge contract...');
      
      // Wait for transaction confirmation
      console.log('Transaction sent, waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt.transactionHash);
      
      // Check if transaction failed
      if (receipt.status === 0) {
        throw new Error('Transaction failed during execution');
      }
      
      // Find the bridge address from events
      let bridgeAddress;
      const eventMap = {
        'export': 'NewExport',
        'import': 'NewImport',
        'import_wrapper': 'NewImportWrapper',
        'export_wrapper': 'NewExportWrapper'
      };
      
      const eventName = eventMap[bridgeType];
      if (eventName) {
        const event = receipt.events.find(e => e.event === eventName);
        if (event && event.args && event.args.contractAddress) {
          bridgeAddress = event.args.contractAddress;
        }
      }
      
      if (!bridgeAddress) {
        throw new Error(`Failed to find bridge address in transaction events for ${bridgeType}`);
      }

      setCreatedBridgeAddress(bridgeAddress);
      
      toast.success(`Bridge created successfully: ${bridgeAddress}`);
      
      if (onBridgeCreated) {
        const bridgeConfig = {
          address: bridgeAddress,
          type: bridgeType,
          homeNetwork: finalHomeNetwork,
          foreignNetwork: finalForeignNetwork,
          homeAsset: bridgeType === 'export' || bridgeType === 'export_wrapper' ? stakeToken : homeAsset,
          stakeToken,
          counterstakeCoef: parseInt(counterstakeCoef),
          ratio: parseInt(ratio),
          largeThreshold: ethers.utils.parseEther(largeThreshold),
          challengingPeriods,
          largeChallengingPeriods
        };

        // Add bridge-type specific fields
        if (bridgeType === 'import') {
          bridgeConfig.tokenName = tokenName.trim();
          bridgeConfig.tokenSymbol = tokenSymbol.trim();
          bridgeConfig.oracleAddress = oracleAddress;
        } else if (bridgeType === 'import_wrapper') {
          bridgeConfig.foreignAsset = foreignAsset;
          bridgeConfig.oracleAddress = oracleAddress;
        } else {
          bridgeConfig.foreignAsset = foreignAsset;
        }

        onBridgeCreated(bridgeAddress, bridgeConfig);
      }
      
    } catch (error) {
      console.error('Error creating bridge:', error);
      
      // Dismiss any loading toasts first
      toast.dismiss();
      
      // Handle different types of errors gracefully
      if (error.code === 4001 || 
          error.code === 'ACTION_REJECTED' || 
          error.message?.includes('User denied transaction') ||
          error.message?.includes('user rejected transaction') ||
          error.message?.includes('User rejected')) {
        // User cancelled the transaction in MetaMask
        toast.error('Transaction cancelled by user');
      } else if (error.code === -32603 || 
                 error.message?.includes('insufficient funds') ||
                 error.message?.includes('insufficient balance')) {
        // Insufficient funds
        toast.error('Insufficient funds for transaction. Please check your wallet balance.');
      } else if (error.message?.includes('gas') || 
                 error.message?.includes('Gas') ||
                 error.code === -32000) {
        // Gas related errors
        toast.error('Transaction failed due to gas issues. Please try again or increase gas limit.');
      } else if (error.message?.includes('revert') || 
                 error.message?.includes('execution reverted')) {
        // Contract revert
        toast.error('Transaction failed. Please check your inputs and try again.');
      } else if (error.message?.includes('network') || 
                 error.message?.includes('Network')) {
        // Network related errors
        toast.error('Network error. Please check your connection and try again.');
      } else if (error.message?.includes('timeout') || 
                 error.message?.includes('Timeout')) {
        // Timeout errors
        toast.error('Transaction timed out. Please try again.');
      } else if (error.message?.includes('nonce')) {
        // Nonce errors
        toast.error('Transaction nonce error. Please try again.');
      } else {
        // Generic error - show a more user-friendly message
        const errorMessage = error.message || 'Unknown error occurred';
        console.error('Unhandled error details:', {
          code: error.code,
          message: error.message,
          reason: error.reason,
          action: error.action
        });
        toast.error(`Failed to create bridge: ${errorMessage}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const availableNetworks = getAvailableNetworks();
  const availableOracles = getAvailableOracles();
  const availableStakeTokens = getAvailableStakeTokens();

  // Get available bridge types based on network configuration
  const getAvailableBridgeTypes = () => {
    const currentNetworkName = networkConfig?.name || 'this network';
    
    if (isHybridNetwork) {
      return [
        { value: 'import_wrapper', label: 'Import Wrapper', description: `Import external tokens to ${currentNetworkName}` },
        { value: 'export_wrapper', label: 'Export Wrapper', description: `Export ${currentNetworkName} tokens to external networks` }
      ];
    } else {
      return [
        { value: 'export', label: 'Export', description: `Export tokens from ${currentNetworkName} to external networks` },
        { value: 'import', label: 'Import', description: `Import tokens from external networks to ${currentNetworkName}` }
      ];
    }
  };

  const availableBridgeTypes = getAvailableBridgeTypes();

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
          className="bg-dark-900 border border-secondary-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-secondary-800">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-white">Create New Bridge Instance</h2>
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
              {/* Network Info */}
              <div className="flex items-center gap-3 p-3 bg-dark-800 rounded border border-secondary-700">
                <Coins className="w-5 h-5 text-primary-500" />
                <div>
                  <h3 className="text-white font-medium">{networkConfig.name}</h3>
                  <p className="text-secondary-400 text-sm">
                    {isHybridNetwork ? 'Hybrid Network' : 'Regular EVM Network'}
                  </p>
                </div>
              </div>

              {/* Bridge Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-secondary-300">
                  Bridge Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableBridgeTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setBridgeType(type.value)}
                      className={`p-3 rounded border text-left transition-colors ${
                        bridgeType === type.value
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-secondary-700 hover:border-secondary-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {type.value.includes('import') ? (
                          <ArrowDown className="w-4 h-4 text-blue-500" />
                        ) : (
                          <ArrowUp className="w-4 h-4 text-green-500" />
                        )}
                        <span className="font-medium text-white">{type.label}</span>
                      </div>
                      <p className="text-xs text-secondary-400">{type.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Import Wrapper Specific Layout */}
              {bridgeType === 'import_wrapper' ? (
                <>
                  {/* Row 1: Home Network | Home Asset */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-secondary-300">
                        Home Network *
                      </label>
                      <select
                        value={homeNetwork}
                        onChange={(e) => setHomeNetwork(e.target.value)}
                        className="w-full input-field"
                      >
                        <option value="">Select home network...</option>
                        {getAvailableHomeNetworks().map((network) => (
                          <option key={network.key} value={network.key}>
                            {network.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-secondary-400 text-xs mt-1">
                        Select the source network where tokens will be imported from.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-secondary-300">
                        Home Asset *
                      </label>
                      <select
                        value={homeAsset}
                        onChange={(e) => setHomeAsset(e.target.value)}
                        className="w-full input-field"
                      >
                        <option value="">Select home asset...</option>
                        {homeNetwork && getAvailableTokens(homeNetwork).map((token) => (
                          <option key={token.key} value={token.address}>
                            {token.symbol} - {token.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Foreign Asset | Stake Token */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-secondary-300">
                        Foreign Asset *
                      </label>
                      <select
                        value={foreignAsset}
                        onChange={(e) => setForeignAsset(e.target.value)}
                        className="w-full input-field"
                      >
                        <option value="">Select foreign asset...</option>
                        {getAvailableNonNativePrecompiles().map((token) => (
                          <option key={token.key} value={token.address}>
                            {token.symbol} - {token.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-secondary-400 text-xs mt-1">
                        Select a wrapped asset that will be minted/burned (e.g., wUSDT, wUSDC). 
                        Make sure you have the rights to transfer the asset's ownership to the bridge after its creation.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-secondary-300">
                        Stake Token *
                      </label>
                      <select
                        value={stakeToken}
                        onChange={(e) => setStakeToken(e.target.value)}
                        className="w-full input-field"
                      >
                        <option value="">Select stake token...</option>
                        {availableStakeTokens.map((token) => (
                          <option key={token.key} value={token.address}>
                            {token.symbol} - {token.name} {token.isNative ? '(Native)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Oracle Address */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-secondary-300">
                      Oracle Address *
                    </label>
                    <select
                      value={oracleAddress}
                      onChange={(e) => setOracleAddress(e.target.value)}
                      className="w-full input-field"
                    >
                      <option value="">Select oracle...</option>
                      {availableOracles.map((oracle) => (
                        <option key={oracle.key} value={oracle.address}>
                          {oracle.name} ({oracle.address.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                    {oracleAddress && (
                      <p className="text-secondary-400 text-xs mt-1">
                        Selected: {availableOracles.find(o => o.address === oracleAddress)?.description || oracleAddress}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Other Bridge Types Layout */}
                  {(bridgeType === 'export' || bridgeType === 'export_wrapper') ? (
                    <>
                      {/* Export/Export Wrapper Layout */}
                      {/* Row 1: Foreign Network | Foreign Asset */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-secondary-300">
                            Foreign Network *
                          </label>
                          <select
                            value={foreignNetwork}
                            onChange={(e) => setForeignNetwork(e.target.value)}
                            className="w-full input-field"
                          >
                            <option value="">Select foreign network...</option>
                            {availableNetworks.map((network) => (
                              <option key={network.key} value={network.key}>
                                {network.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-secondary-400 text-xs mt-1">
                            Select the destination network where tokens will be exported to.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-secondary-300">
                            Foreign Asset *
                          </label>
                          <select
                            value={foreignAsset}
                            onChange={(e) => setForeignAsset(e.target.value)}
                            className="w-full input-field"
                          >
                            <option value="">Select foreign asset...</option>
                            {foreignNetwork && getAvailableTokens(foreignNetwork).map((token) => (
                              <option key={token.key} value={token.address}>
                                {token.symbol} - {token.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Stake Token */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-secondary-300">
                          Stake Token *
                        </label>
                        <select
                          value={stakeToken}
                          onChange={(e) => setStakeToken(e.target.value)}
                          className="w-full input-field"
                        >
                          <option value="">Select stake token...</option>
                          {availableStakeTokens.map((token) => (
                            <option key={token.key} value={token.address}>
                              {token.symbol} - {token.name} {token.isNative ? '(Native)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Regular Import Layout */}
                      {/* Row 1: Home Network | Home Asset */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-secondary-300">
                            Home Network *
                          </label>
                          <select
                            value={homeNetwork}
                            onChange={(e) => setHomeNetwork(e.target.value)}
                            className="w-full input-field"
                          >
                            <option value="">Select home network...</option>
                            {getAvailableHomeNetworks().map((network) => (
                              <option key={network.key} value={network.key}>
                                {network.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-secondary-400 text-xs mt-1">
                            Select the source network where tokens will be imported from.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-secondary-300">
                            Home Asset *
                          </label>
                          <select
                            value={homeAsset}
                            onChange={(e) => setHomeAsset(e.target.value)}
                            className="w-full input-field"
                          >
                            <option value="">Select home asset...</option>
                            {homeNetwork && getAvailableTokens(homeNetwork).map((token) => (
                              <option key={token.key} value={token.address}>
                                {token.symbol} - {token.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Token Name | Token Symbol */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-secondary-300">
                            Token Name *
                          </label>
                          <input
                            type="text"
                            value={tokenName}
                            onChange={(e) => setTokenName(e.target.value)}
                            placeholder="e.g., Wrapped USDT"
                            className="w-full input-field"
                          />
                          <p className="text-secondary-400 text-xs mt-1">
                            Name for the new ERC20 token that will be created
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-secondary-300">
                            Token Symbol *
                          </label>
                          <input
                            type="text"
                            value={tokenSymbol}
                            onChange={(e) => setTokenSymbol(e.target.value)}
                            placeholder="e.g., wUSDT"
                            className="w-full input-field"
                          />
                          <p className="text-secondary-400 text-xs mt-1">
                            Symbol for the new ERC20 token that will be created
                          </p>
                        </div>
                      </div>

                      {/* Row 3: Stake Token */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-secondary-300">
                          Stake Token *
                        </label>
                        <select
                          value={stakeToken}
                          onChange={(e) => setStakeToken(e.target.value)}
                          className="w-full input-field"
                        >
                          <option value="">Select stake token...</option>
                          {availableStakeTokens.map((token) => (
                            <option key={token.key} value={token.address}>
                              {token.symbol} - {token.name} {token.isNative ? '(Native)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {/* Oracle Selection - Only for Import Bridges */}
                  {bridgeType === 'import' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-secondary-300">
                        Oracle Address *
                      </label>
                      <select
                        value={oracleAddress}
                        onChange={(e) => setOracleAddress(e.target.value)}
                        className="w-full input-field"
                      >
                        <option value="">Select oracle...</option>
                        {availableOracles.map((oracle) => (
                          <option key={oracle.key} value={oracle.address}>
                            {oracle.name} ({oracle.address.slice(0, 8)}...)
                          </option>
                        ))}
                      </select>
                      {oracleAddress && (
                        <p className="text-secondary-400 text-xs mt-1">
                          Selected: {availableOracles.find(o => o.address === oracleAddress)?.description || oracleAddress}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Bridge Configuration */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Bridge Configuration</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Counterstake Coefficient
                    </label>
                    <input
                      type="number"
                      value={counterstakeCoef}
                      onChange={(e) => setCounterstakeCoef(e.target.value)}
                      placeholder="160"
                      className="w-full input-field text-sm"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      {(parseInt(counterstakeCoef) / 100).toFixed(2)}%
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Ratio
                    </label>
                    <input
                      type="number"
                      value={ratio}
                      onChange={(e) => setRatio(e.target.value)}
                      placeholder="110"
                      className="w-full input-field text-sm"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      {(parseInt(ratio) / 100).toFixed(2)}%
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-secondary-300">
                    Large Threshold
                  </label>
                  <input
                    type="number"
                    value={largeThreshold}
                    onChange={(e) => setLargeThreshold(e.target.value)}
                    placeholder="10000"
                    className="w-full input-field text-sm"
                  />
                  <p className="text-secondary-400 text-xs mt-1">
                    {largeThreshold} tokens
                  </p>
                </div>

                {/* Challenging Periods Configuration */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium text-white">Challenging Periods</h4>
                  
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Small Claims Challenging Periods (seconds)
                    </label>
                    <input
                      type="text"
                      value={challengingPeriods.join(', ')}
                      onChange={(e) => {
                        const periods = e.target.value.split(',')
                          .map(p => parseInt(p.trim()))
                          .filter(p => !isNaN(p) && p > 0);
                        if (periods.length > 0) {
                          setChallengingPeriods(periods);
                        }
                      }}
                      placeholder="50400, 259200, 604800, 2592000"
                      className="w-full input-field text-sm"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      Comma-separated values in seconds. Default: 14h, 3d, 7d, 30d
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Large Claims Challenging Periods (seconds)
                    </label>
                    <input
                      type="text"
                      value={largeChallengingPeriods.join(', ')}
                      onChange={(e) => {
                        const periods = e.target.value.split(',')
                          .map(p => parseInt(p.trim()))
                          .filter(p => !isNaN(p) && p > 0);
                        if (periods.length > 0) {
                          setLargeChallengingPeriods(periods);
                        }
                      }}
                      placeholder="604800, 2592000, 5184000"
                      className="w-full input-field text-sm"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      Comma-separated values in seconds. Default: 1week, 30days, 60days
                    </p>
                  </div>
                </div>
              </div>

              {/* Create Button */}
              {!createdBridgeAddress && (
                <button
                  onClick={handleCreateBridge}
                  disabled={
                    isCreating || 
                    !bridgeType || 
                    !stakeToken ||
                    (bridgeType === 'import' && (!homeNetwork || !homeAsset || !tokenName.trim() || !tokenSymbol.trim() || !oracleAddress)) ||
                    (bridgeType === 'import_wrapper' && (!homeNetwork || !homeAsset || !foreignAsset || !oracleAddress)) ||
                    ((bridgeType === 'export' || bridgeType === 'export_wrapper') && (!foreignNetwork || !foreignAsset))
                  }
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating Bridge...
                    </>
                  ) : (
                    'Create Bridge'
                  )}
                </button>
              )}

              {/* Created Bridge Info */}
              {createdBridgeAddress && (
                <div className="p-3 bg-green-900/20 border border-green-700 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-400 font-medium">Bridge Created Successfully</span>
                  </div>
                  <div className="text-sm text-secondary-300">
                    <div>Address: {createdBridgeAddress}</div>
                    <div>Type: {bridgeType}</div>
                    <div>Home Network: {bridgeType === 'export' || bridgeType === 'export_wrapper' ? getNetworkName(networkKey) : getNetworkName(homeNetwork)}</div>
                    <div>Foreign Network: {bridgeType === 'import' || bridgeType === 'import_wrapper' ? getNetworkName(networkKey) : getNetworkName(foreignNetwork)}</div>
                  </div>
                </div>
              )}

            </div>
          </div>
          
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

CreateNewBridge.propTypes = {
  networkKey: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onBridgeCreated: PropTypes.func
};

export default CreateNewBridge;
