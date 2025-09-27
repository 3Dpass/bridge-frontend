import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useWeb3 } from '../contexts/Web3Context';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import Deposit from './Deposit';
import Withdraw from './Withdraw';
import WithdrawManagementFee from './WithdrawManagementFee';
import WithdrawSuccessFee from './WithdrawSuccessFee';
import AssignNewManager from './AssignNewManager';

const AssistantsList = () => {
  const { getAssistantContractsWithSettings, getAllNetworksWithSettings } = useSettings();
  const { account } = useWeb3();
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState({});
  const [shareTokenSupplies, setShareTokenSupplies] = useState({});
  const [foreignTokenBalances, setForeignTokenBalances] = useState({});
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [selectedAssistant, setSelectedAssistant] = useState(null);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showWithdrawManagementFeeDialog, setShowWithdrawManagementFeeDialog] = useState(false);
  const [showWithdrawSuccessFeeDialog, setShowWithdrawSuccessFeeDialog] = useState(false);
  const [showAssignNewManagerDialog, setShowAssignNewManagerDialog] = useState(false);

  // Helper function to check if an address is a known precompile
  const isKnownPrecompile = useCallback((address) => {
    const precompileAddresses = [
      '0x0000000000000000000000000000000000000802', // P3D precompile
      '0x0000000000000000000000000000000000000808', // Batch precompile
      '0xfBFBfbFA000000000000000000000000000000de', // Foreign token precompile
    ];
    return precompileAddresses.includes(address.toLowerCase());
  }, []);

  const getTokenBalance = useCallback(async (contractAddress, tokenAddress, networkKey) => {
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      return '0';
    }
    
    try {
      // Get the network-specific provider
      const networks = getAllNetworksWithSettings();
      const networkConfig = networks[networkKey];
      if (!networkConfig || !networkConfig.rpcUrl) {
        console.warn(`No RPC URL found for network: ${networkKey}`);
        return '0';
      }

      const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      
      // For native tokens, check against known native token addresses from settings
      const isNativeToken = Object.values(networks).some(network => {
        if (network.tokens) {
          return Object.values(network.tokens).some(token => 
            token.isNative && token.address.toLowerCase() === tokenAddress.toLowerCase()
          );
        }
        return false;
      });

      if (isNativeToken) {
        const balance = await networkProvider.getBalance(contractAddress);
        return balance.toString();
      }
      
      // Check if the contract exists by getting its code
      const code = await networkProvider.getCode(tokenAddress);
      if (code === '0x') {
        console.warn(`No contract found at token address: ${tokenAddress} on ${networkKey}`, {
          networkKey,
          chainId: networkConfig.id,
          isKnownPrecompile: isKnownPrecompile(tokenAddress)
        });
        return '0';
      }
      
      // For ERC20 tokens
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        networkProvider
      );
      
      const balance = await tokenContract.balanceOf(contractAddress);
      return balance.toString();
    } catch (error) {
      console.warn(`Error getting token balance for ${tokenAddress} on ${networkKey}:`, error.message);
      return '0';
    }
  }, [getAllNetworksWithSettings, isKnownPrecompile]);

  const getTokenTotalSupply = useCallback(async (tokenAddress, networkKey) => {
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      return '0';
    }
    
    try {
      // Get the network-specific provider
      const networks = getAllNetworksWithSettings();
      const networkConfig = networks[networkKey];
      if (!networkConfig || !networkConfig.rpcUrl) {
        console.warn(`No RPC URL found for network: ${networkKey}`);
        return '0';
      }

      const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      
      // For native tokens, we can't get total supply
      const isNativeToken = Object.values(networks).some(network => {
        if (network.tokens) {
          return Object.values(network.tokens).some(token => 
            token.isNative && token.address.toLowerCase() === tokenAddress.toLowerCase()
          );
        }
        return false;
      });

      if (isNativeToken) {
        return '0';
      }
      
      // Check if the contract exists by calling a simple method first
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function totalSupply() view returns (uint256)'],
        networkProvider
      );
      
      // Try to get the code at the address to see if it's a contract
      const code = await networkProvider.getCode(tokenAddress);
      if (code === '0x') {
        console.warn(`No contract found at address: ${tokenAddress} on ${networkKey}`, {
          networkKey,
          chainId: networkConfig.id,
          isKnownPrecompile: isKnownPrecompile(tokenAddress)
        });
        return '0';
      }
      
      const totalSupply = await tokenContract.totalSupply();
      return totalSupply.toString();
    } catch (error) {
      console.warn(`Error getting token total supply for ${tokenAddress} on ${networkKey}:`, error.message);
      return '0';
    }
  }, [getAllNetworksWithSettings, isKnownPrecompile]);

  const getForeignTokenBalance = useCallback(async (assistant, contractAddress, tokenAddress, networkKey) => {
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      return '0';
    }
    
    try {
      // Get the network-specific provider
      const networks = getAllNetworksWithSettings();
      const networkConfig = networks[networkKey];
      if (!networkConfig || !networkConfig.rpcUrl) {
        console.warn(`No RPC URL found for network: ${networkKey}`);
        return '0';
      }

      const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      
      // For native tokens, check against known native token addresses from settings
      const isNativeToken = Object.values(networks).some(network => {
        if (network.tokens) {
          return Object.values(network.tokens).some(token => 
            token.isNative && token.address.toLowerCase() === tokenAddress.toLowerCase()
          );
        }
        return false;
      });

      if (isNativeToken) {
        const balance = await networkProvider.getBalance(contractAddress);
        return balance.toString();
      }
      
      // Check if the contract exists by getting its code
      const code = await networkProvider.getCode(tokenAddress);
      if (code === '0x') {
        console.warn(`No contract found at foreign token address: ${tokenAddress} on ${networkKey}`, {
          networkKey,
          chainId: networkConfig.id,
          isKnownPrecompile: isKnownPrecompile(tokenAddress)
        });
        return '0';
      }
      
      // For Import Wrapper assistants, use IPrecompileERC20 interface
      if (assistant.type === 'import_wrapper') {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          [
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
          ],
          networkProvider
        );
        
        const balance = await tokenContract.balanceOf(contractAddress);
        return balance.toString();
      }
      
      // For Import assistants, use regular ERC20 interface
      if (assistant.type === 'import') {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          [
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
          ],
          networkProvider
        );
        
        const balance = await tokenContract.balanceOf(contractAddress);
        return balance.toString();
      }
      
      return '0';
    } catch (error) {
      console.warn(`Error getting foreign token balance for ${tokenAddress} on ${networkKey}:`, error.message);
      return '0';
    }
  }, [getAllNetworksWithSettings, isKnownPrecompile]);

  const getStakeTokenAddress = useCallback((assistant) => {
    // Try to find the stake token address from the bridge configuration
    const networks = getAllNetworksWithSettings();
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            return bridge.stakeTokenAddress;
          }
        }
      }
    }
    return null;
  }, [getAllNetworksWithSettings]);

  const loadAssistants = useCallback(() => {
    try {
      const assistantContracts = getAssistantContractsWithSettings();
      const networks = getAllNetworksWithSettings();
      
      const assistantsList = Object.entries(assistantContracts).map(([key, assistant]) => {
        // Find the network this assistant belongs to
        const network = Object.values(networks).find(net => 
          net.assistants && net.assistants[key]
        );
        
        return {
          key,
          ...assistant,
          network: network?.name || 'Unknown',
          networkSymbol: network?.symbol || 'Unknown'
        };
      });

      setAssistants(assistantsList);
      setLoading(false);
    } catch (error) {
      console.error('Error loading assistants:', error);
      setLoading(false);
    }
  }, [getAssistantContractsWithSettings, getAllNetworksWithSettings]);

  const getForeignTokenAddress = useCallback((assistant) => {
    // Try to find the foreign token address from the bridge configuration
    const networks = getAllNetworksWithSettings();
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            return bridge.foreignTokenAddress;
          }
        }
      }
    }
    return null;
  }, [getAllNetworksWithSettings]);

  const getForeignTokenSymbol = useCallback((assistant) => {
    // Try to find the foreign token symbol from the bridge configuration
    const networks = getAllNetworksWithSettings();
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            return bridge.foreignTokenSymbol;
          }
        }
      }
    }
    return 'Unknown';
  }, [getAllNetworksWithSettings]);

  const loadBalances = useCallback(async () => {
    console.log('🔍 Loading balances for all networks...');

    const newBalances = {};
    const newShareTokenSupplies = {};
    const newForeignTokenBalances = {};
    
    const networks = getAllNetworksWithSettings();

    for (const assistant of assistants) {
      try {
        console.log(`🔍 Processing assistant: ${assistant.key}`, {
          type: assistant.type,
          network: assistant.network,
          bridgeAddress: assistant.bridgeAddress,
          assistantAddress: assistant.address
        });

        // Validate assistant has required addresses
        if (!assistant.bridgeAddress || !assistant.address) {
          console.warn(`Assistant ${assistant.key} missing required addresses:`, {
            bridgeAddress: assistant.bridgeAddress,
            address: assistant.address
          });
          continue;
        }

        // Determine which network this assistant belongs to
        const assistantNetworkKey = Object.keys(networks).find(networkKey => {
          const network = networks[networkKey];
          return network.assistants && network.assistants[assistant.key];
        });

        if (!assistantNetworkKey) {
          console.warn(`Could not determine network for assistant ${assistant.key}`);
          continue;
        }

        console.log(`🔍 Assistant ${assistant.key} belongs to network: ${assistantNetworkKey}`);

        // Get stake token balance
        const stakeTokenAddress = assistant.stakeTokenAddress || getStakeTokenAddress(assistant);
        if (stakeTokenAddress) {
          const stakeTokenBalance = await getTokenBalance(
            assistant.bridgeAddress, 
            stakeTokenAddress,
            assistantNetworkKey
          );
          
          newBalances[assistant.key] = {
            stakeTokenBalance
          };
        } else {
          console.warn(`No stake token address found for assistant ${assistant.key}`);
          newBalances[assistant.key] = {
            stakeTokenBalance: '0'
          };
        }
        
        // Get share token total supply instead of balance
        const shareTokenTotalSupply = await getTokenTotalSupply(assistant.address, assistantNetworkKey);
        newShareTokenSupplies[assistant.key] = {
          shareTokenTotalSupply
        };

        // Get foreign token balance for import assistants
        if (assistant.type === 'import' || assistant.type === 'import_wrapper') {
          const foreignTokenAddress = getForeignTokenAddress(assistant);
          if (foreignTokenAddress) {
            const foreignTokenBalance = await getForeignTokenBalance(
              assistant,
              assistant.address, // Assistant contract holds the foreign tokens
              foreignTokenAddress,
              assistantNetworkKey
            );
            newForeignTokenBalances[assistant.key] = {
              foreignTokenBalance
            };
          } else {
            console.warn(`No foreign token address found for assistant ${assistant.key}`);
            newForeignTokenBalances[assistant.key] = {
              foreignTokenBalance: '0'
            };
          }
        }
      } catch (error) {
        console.error(`Error loading balances for ${assistant.key}:`, error);
        newBalances[assistant.key] = {
          stakeTokenBalance: '0'
        };
        newShareTokenSupplies[assistant.key] = {
          shareTokenTotalSupply: '0'
        };
        if (assistant.type === 'import' || assistant.type === 'import_wrapper') {
          newForeignTokenBalances[assistant.key] = {
            foreignTokenBalance: '0'
          };
        }
      }
    }

    setBalances(newBalances);
    setShareTokenSupplies(newShareTokenSupplies);
    setForeignTokenBalances(newForeignTokenBalances);
  }, [assistants, getTokenBalance, getTokenTotalSupply, getStakeTokenAddress, getForeignTokenAddress, getForeignTokenBalance, getAllNetworksWithSettings]);

  useEffect(() => {
    loadAssistants();
  }, [loadAssistants]);

  useEffect(() => {
    if (assistants.length > 0) {
      loadBalances();
    }
  }, [assistants, loadBalances]);

  const formatBalance = (balance, decimals = 18) => {
    try {
      const formatted = ethers.utils.formatUnits(balance, decimals);
      return parseFloat(formatted).toFixed(6);
    } catch (error) {
      return '0.000000';
    }
  };

  const getTokenSymbol = useCallback((assistant) => {
    // Try to find the stake token symbol from the bridge configuration
    const networks = getAllNetworksWithSettings();
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            return bridge.stakeTokenSymbol;
          }
        }
      }
    }
    return 'Unknown';
  }, [getAllNetworksWithSettings]);

  const copyToClipboard = useCallback(async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(text);
      toast.success(`${label} copied to clipboard!`);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy address');
    }
  }, []);

  // Network switching functions
  const getRequiredNetwork = useCallback((assistant) => {
    const networksWithSettings = getAllNetworksWithSettings();
    
    console.log('🔍 getRequiredNetwork called for assistant:', assistant.address);
    console.log('🔍 Available networks:', Object.keys(networksWithSettings));
    
    for (const networkKey in networksWithSettings) {
      const networkConfig = networksWithSettings[networkKey];
      console.log('🔍 Checking network:', networkKey, {
        hasBridges: !!networkConfig.bridges,
        bridgeCount: networkConfig.bridges ? Object.keys(networkConfig.bridges).length : 0
      });
      
      if (networkConfig && networkConfig.bridges) {
        for (const bridgeKey in networkConfig.bridges) {
          const bridge = networkConfig.bridges[bridgeKey];
          console.log('🔍 Checking bridge:', {
            bridgeAddress: bridge.address,
            assistantBridgeAddress: assistant.bridgeAddress,
            networkName: networkConfig.name,
            networkId: networkConfig.id,
            matches: bridge.address === assistant.bridgeAddress
          });
          
          if (bridge.address === assistant.bridgeAddress) {
            const result = {
              ...networkConfig,
              chainId: networkConfig.id,
              bridgeAddress: bridge.address,
              assistantType: assistant.type
            };
            console.log('✅ Found required network:', result);
            return result;
          }
        }
      }
    }
    console.log('❌ No required network found for assistant:', assistant.address);
    return null;
  }, [getAllNetworksWithSettings]);

  const checkNetwork = useCallback(async () => {
    try {
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainIdNumber = parseInt(currentChainId, 16);
      console.log('🔍 Current chain ID:', currentChainIdNumber);
      return currentChainIdNumber;
    } catch (error) {
      console.error('Error checking network:', error);
      return null;
    }
  }, []);

  const switchToRequiredNetwork = useCallback(async (requiredNetwork) => {
    try {
      console.log('🔄 Switching to network:', requiredNetwork.name, 'Chain ID:', requiredNetwork.chainId);
      
      const chainIdHex = `0x${requiredNetwork.chainId.toString(16)}`;
      
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        console.log('✅ Network switched successfully');
        return true;
      } catch (switchError) {
        console.log('⚠️ Network not added, attempting to add it...');
        
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainIdHex,
                chainName: requiredNetwork.name,
                nativeCurrency: requiredNetwork.nativeCurrency,
                rpcUrls: [requiredNetwork.rpcUrl],
                blockExplorerUrls: [requiredNetwork.explorer],
              }],
            });
            console.log('✅ Network added and switched successfully');
            return true;
          } catch (addError) {
            console.error('❌ Failed to add network:', addError);
            return false;
          }
        } else {
          console.error('❌ Failed to switch network:', switchError);
          return false;
        }
      }
    } catch (error) {
      console.error('❌ Network switching error:', error);
      return false;
    }
  }, []);

  const handleDeposit = useCallback(async (assistant) => {
    console.log('🔘 Deposit button clicked for assistant:', assistant.address);
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetwork(assistant);
    if (!requiredNetwork) {
      toast.error('Could not determine required network for this assistant');
      return;
    }
    
    const currentChainId = await checkNetwork();
    if (currentChainId !== requiredNetwork.chainId) {
      console.log('🚨 NETWORK SWITCHING WILL BE TRIGGERED NOW!');
      console.log('🔄 Wrong network detected, switching automatically...');
      toast(`Switching to ${requiredNetwork.name} network...`);
      const switchSuccess = await switchToRequiredNetwork(requiredNetwork);
      console.log('🔍 Network switch result:', switchSuccess);
      if (!switchSuccess) {
        toast.error('Failed to switch to the required network');
        return;
      }
      // Wait a moment for the network to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setSelectedAssistant(assistant);
    setShowDepositDialog(true);
  }, [getRequiredNetwork, checkNetwork, switchToRequiredNetwork]);

  const handleWithdraw = useCallback(async (assistant) => {
    console.log('🔘 Withdraw button clicked for assistant:', assistant.address);
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetwork(assistant);
    if (!requiredNetwork) {
      toast.error('Could not determine required network for this assistant');
      return;
    }
    
    const currentChainId = await checkNetwork();
    if (currentChainId !== requiredNetwork.chainId) {
      console.log('🚨 NETWORK SWITCHING WILL BE TRIGGERED NOW!');
      console.log('🔄 Wrong network detected, switching automatically...');
      toast(`Switching to ${requiredNetwork.name} network...`);
      const switchSuccess = await switchToRequiredNetwork(requiredNetwork);
      console.log('🔍 Network switch result:', switchSuccess);
      if (!switchSuccess) {
        toast.error('Failed to switch to the required network');
        return;
      }
      // Wait a moment for the network to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setSelectedAssistant(assistant);
    setShowWithdrawDialog(true);
  }, [getRequiredNetwork, checkNetwork, switchToRequiredNetwork]);

  const handleWithdrawManagementFee = useCallback(async (assistant) => {
    console.log('🔘 Withdraw Management Fee button clicked for assistant:', assistant.address);
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetwork(assistant);
    if (!requiredNetwork) {
      toast.error('Could not determine required network for this assistant');
      return;
    }
    
    const currentChainId = await checkNetwork();
    if (currentChainId !== requiredNetwork.chainId) {
      console.log('🚨 NETWORK SWITCHING WILL BE TRIGGERED NOW!');
      console.log('🔄 Wrong network detected, switching automatically...');
      toast(`Switching to ${requiredNetwork.name} network...`);
      const switchSuccess = await switchToRequiredNetwork(requiredNetwork);
      console.log('🔍 Network switch result:', switchSuccess);
      if (!switchSuccess) {
        toast.error('Failed to switch to the required network');
        return;
      }
      // Wait a moment for the network to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setSelectedAssistant(assistant);
    setShowWithdrawManagementFeeDialog(true);
  }, [getRequiredNetwork, checkNetwork, switchToRequiredNetwork]);

  const handleWithdrawSuccessFee = useCallback(async (assistant) => {
    console.log('🔘 Withdraw Success Fee button clicked for assistant:', assistant.address);
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetwork(assistant);
    if (!requiredNetwork) {
      toast.error('Could not determine required network for this assistant');
      return;
    }
    
    const currentChainId = await checkNetwork();
    if (currentChainId !== requiredNetwork.chainId) {
      console.log('🚨 NETWORK SWITCHING WILL BE TRIGGERED NOW!');
      console.log('🔄 Wrong network detected, switching automatically...');
      toast(`Switching to ${requiredNetwork.name} network...`);
      const switchSuccess = await switchToRequiredNetwork(requiredNetwork);
      console.log('🔍 Network switch result:', switchSuccess);
      if (!switchSuccess) {
        toast.error('Failed to switch to the required network');
        return;
      }
      // Wait a moment for the network to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setSelectedAssistant(assistant);
    setShowWithdrawSuccessFeeDialog(true);
  }, [getRequiredNetwork, checkNetwork, switchToRequiredNetwork]);

  const handleAssignNewManager = useCallback(async (assistant) => {
    console.log('🔘 Assign New Manager button clicked for assistant:', assistant.address);
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetwork(assistant);
    if (!requiredNetwork) {
      toast.error('Could not determine required network for this assistant');
      return;
    }
    
    const currentChainId = await checkNetwork();
    if (currentChainId !== requiredNetwork.chainId) {
      console.log('🚨 NETWORK SWITCHING WILL BE TRIGGERED NOW!');
      console.log('🔄 Wrong network detected, switching automatically...');
      toast(`Switching to ${requiredNetwork.name} network...`);
      const switchSuccess = await switchToRequiredNetwork(requiredNetwork);
      console.log('🔍 Network switch result:', switchSuccess);
      if (!switchSuccess) {
        toast.error('Failed to switch to the required network');
        return;
      }
      // Wait a moment for the network to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setSelectedAssistant(assistant);
    setShowAssignNewManagerDialog(true);
  }, [getRequiredNetwork, checkNetwork, switchToRequiredNetwork]);

  const handleCloseDialogs = useCallback(() => {
    setShowDepositDialog(false);
    setShowWithdrawDialog(false);
    setShowWithdrawManagementFeeDialog(false);
    setShowWithdrawSuccessFeeDialog(false);
    setShowAssignNewManagerDialog(false);
    setSelectedAssistant(null);
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p className="text-secondary-400 mt-4">Loading liquidity pools...</p>
      </div>
    );
  }

  if (assistants.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🏦</div>
        <h3 className="text-xl font-semibold text-white mb-2">No Liquidity Pools Found</h3>
        <p className="text-secondary-400">
          No assistant contracts are configured. Check your settings to add bridge assistants.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        {assistants.map((assistant, index) => (
          <motion.div
            key={assistant.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {assistant.description || assistant.key}
                </h3>
                <p className="text-secondary-400 text-sm">
                  {assistant.network} • {assistant.type}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-secondary-500 mb-1">Contract</div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-secondary-300 font-mono">
                    {assistant.address.slice(0, 6)}...{assistant.address.slice(-4)}
                  </div>
                  <button
                    onClick={() => copyToClipboard(assistant.address, 'Assistant contract address')}
                    className="p-1 hover:bg-dark-700 rounded transition-colors"
                    title="Copy contract address"
                  >
                    {copiedAddress === assistant.address ? (
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-secondary-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className={`grid gap-4 ${
              (assistant.type === 'import' || assistant.type === 'import_wrapper') 
                ? 'grid-cols-1 md:grid-cols-3' 
                : 'grid-cols-1 md:grid-cols-2'
            }`}>
              {/* Stake Token Balance */}
              <div className="bg-dark-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-secondary-400">Stake Token Balance</span>
                  <span className="text-xs text-secondary-500">
                    {getTokenSymbol(assistant)}
                  </span>
                </div>
                <div className="text-xl font-semibold text-white">
                  {balances[assistant.key]?.stakeTokenBalance 
                    ? formatBalance(balances[assistant.key].stakeTokenBalance)
                    : '0.000000'
                  }
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-xs text-secondary-500">
                    Bridge: {assistant.bridgeAddress?.slice(0, 6)}...{assistant.bridgeAddress?.slice(-4)}
                  </div>
                  <button
                    onClick={() => copyToClipboard(assistant.bridgeAddress, 'Bridge contract address')}
                    className="p-1 hover:bg-dark-700 rounded transition-colors"
                    title="Copy bridge address"
                  >
                    {copiedAddress === assistant.bridgeAddress ? (
                      <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-secondary-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Share Token Total Supply */}
              <div className="bg-dark-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-secondary-400">Share Token Total Supply</span>
                  <span className="text-xs text-secondary-500">
                    {assistant.shareSymbol || 'Shares'}
                  </span>
                </div>
                <div className="text-xl font-semibold text-white">
                  {shareTokenSupplies[assistant.key]?.shareTokenTotalSupply 
                    ? formatBalance(shareTokenSupplies[assistant.key].shareTokenTotalSupply)
                    : '0.000000'
                  }
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-xs text-secondary-500">
                    Assistant: {assistant.address?.slice(0, 6)}...{assistant.address?.slice(-4)}
                  </div>
                  <button
                    onClick={() => copyToClipboard(assistant.address, 'Assistant contract address')}
                    className="p-1 hover:bg-dark-700 rounded transition-colors"
                    title="Copy assistant address"
                  >
                    {copiedAddress === assistant.address ? (
                      <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-secondary-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Foreign Token Balance - Only for Import Assistants */}
              {(assistant.type === 'import' || assistant.type === 'import_wrapper') && (
                <div className="bg-dark-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-secondary-400">Foreign Token Balance</span>
                    <span className="text-xs text-secondary-500">
                      {getForeignTokenSymbol(assistant)}
                    </span>
                  </div>
                  <div className="text-xl font-semibold text-white">
                    {foreignTokenBalances[assistant.key]?.foreignTokenBalance 
                      ? formatBalance(foreignTokenBalances[assistant.key].foreignTokenBalance)
                      : '0.000000'
                    }
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-xs text-secondary-500">
                      Assistant: {assistant.address?.slice(0, 6)}...{assistant.address?.slice(-4)}
                    </div>
                    <button
                      onClick={() => copyToClipboard(assistant.address, 'Assistant contract address')}
                      className="p-1 hover:bg-dark-700 rounded transition-colors"
                      title="Copy assistant address"
                    >
                      {copiedAddress === assistant.address ? (
                        <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3 text-secondary-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {assistant.managerAddress && (
              <div className="mt-4 pt-4 border-t border-dark-700">
                <div className="text-xs text-secondary-500 mb-1">Manager</div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-secondary-300 font-mono">
                    {assistant.managerAddress.slice(0, 6)}...{assistant.managerAddress.slice(-4)}
                  </div>
                  <button
                    onClick={() => copyToClipboard(assistant.managerAddress, 'Manager address')}
                    className="p-1 hover:bg-dark-700 rounded transition-colors"
                    title="Copy manager address"
                  >
                    {copiedAddress === assistant.managerAddress ? (
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-secondary-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 pt-4 border-t border-dark-700">
              <div className="flex gap-3">
                <button
                  onClick={() => handleDeposit(assistant)}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
                >
                  Deposit
                </button>
                <button
                  onClick={() => handleWithdraw(assistant)}
                  className="flex-1 bg-secondary-600 hover:bg-secondary-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
                >
                  Withdraw
                </button>
              </div>
              
              {/* Manager Buttons - Only show if user is the manager */}
              {assistant.managerAddress && account && assistant.managerAddress.toLowerCase() === account.toLowerCase() && (
                <div className="mt-3 pt-3 border-t border-dark-600">
                  <div className="text-xs text-secondary-500 mb-2">Manager Actions</div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleWithdrawManagementFee(assistant)}
                        className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-3 rounded-md text-xs font-medium transition-colors"
                      >
                        Withdraw Management Fee
                      </button>
                      <button
                        onClick={() => handleWithdrawSuccessFee(assistant)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded-md text-xs font-medium transition-colors"
                      >
                        Withdraw Success Fee
                      </button>
                    </div>
                    <button
                      onClick={() => handleAssignNewManager(assistant)}
                      className="w-full bg-secondary-600 hover:bg-secondary-700 text-white py-2 px-3 rounded-md text-xs font-medium transition-colors"
                    >
                      Assign New Manager
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Dialogs */}
      {showDepositDialog && selectedAssistant && (
        <Deposit
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={() => {
            handleCloseDialogs();
            loadBalances(); // Refresh balances after successful deposit
          }}
        />
      )}

      {showWithdrawDialog && selectedAssistant && (
        <Withdraw
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={() => {
            handleCloseDialogs();
            loadBalances(); // Refresh balances after successful withdraw
          }}
        />
      )}

      {showWithdrawManagementFeeDialog && selectedAssistant && (
        <WithdrawManagementFee
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={() => {
            handleCloseDialogs();
            loadBalances(); // Refresh balances after successful fee withdrawal
          }}
        />
      )}

      {showWithdrawSuccessFeeDialog && selectedAssistant && (
        <WithdrawSuccessFee
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={() => {
            handleCloseDialogs();
            loadBalances(); // Refresh balances after successful fee withdrawal
          }}
        />
      )}

      {showAssignNewManagerDialog && selectedAssistant && (
        <AssignNewManager
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={() => {
            handleCloseDialogs();
            loadAssistants(); // Refresh assistants list after successful manager assignment
          }}
        />
      )}
    </div>
  );
};

export default AssistantsList;
