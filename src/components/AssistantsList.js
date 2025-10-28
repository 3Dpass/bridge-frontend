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
import { IPRECOMPILE_ERC20_ABI } from '../contracts/abi';
import { switchNetwork } from '../utils/network-switcher';

const AssistantsList = () => {
  const { getAssistantContractsWithSettings, getAllNetworksWithSettings, get3DPassTokenDecimalsDisplayMultiplier } = useSettings();
  const { account } = useWeb3();
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState({});
  const [shareTokenSupplies, setShareTokenSupplies] = useState({});
  const [foreignTokenBalances, setForeignTokenBalances] = useState({});
  const [assistantFees, setAssistantFees] = useState({});
  const [assistantManagers, setAssistantManagers] = useState({});
  const [assistantValidation, setAssistantValidation] = useState({});
  const [showInvalidAssistants, setShowInvalidAssistants] = useState(false);
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

  const getTokenDecimalsFromSettings = useCallback((tokenAddress, networkKey) => {
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      return 18; // Default decimals
    }
    
    try {
      const networks = getAllNetworksWithSettings();
      
      // Check if it's a native token first
      for (const network of Object.values(networks)) {
        if (network.tokens) {
          for (const token of Object.values(network.tokens)) {
            if (token.isNative && token.address.toLowerCase() === tokenAddress.toLowerCase()) {
              return token.decimals || 18;
            }
          }
        }
      }
      
      // Check if it's a regular token in the network
      const networkConfig = networks[networkKey];
      if (networkConfig && networkConfig.tokens) {
        for (const token of Object.values(networkConfig.tokens)) {
          if (token.address.toLowerCase() === tokenAddress.toLowerCase()) {
            return token.decimals || 18;
          }
        }
      }
      
      // Check all networks for the token
      for (const network of Object.values(networks)) {
        if (network.tokens) {
          for (const token of Object.values(network.tokens)) {
            if (token.address.toLowerCase() === tokenAddress.toLowerCase()) {
              return token.decimals || 18;
            }
          }
        }
      }
      
      console.warn(`Token decimals not found in settings for: ${tokenAddress} on ${networkKey}`);
      return 18; // Default decimals
    } catch (error) {
      console.warn(`Error getting token decimals from settings for ${tokenAddress}:`, error.message);
      return 18; // Default decimals
    }
  }, [getAllNetworksWithSettings]);

  const formatBalance = useCallback((balance, decimals = 18, tokenAddress = null) => {
    try {
      const formatted = ethers.utils.formatUnits(balance, decimals);
      const number = parseFloat(formatted);
      
      // Check if this is a P3D token and apply decimalsDisplayMultiplier
      if (tokenAddress) {
        const decimalsDisplayMultiplier = get3DPassTokenDecimalsDisplayMultiplier(tokenAddress);
        console.log(`🔍 formatBalance P3D check:`, {
          tokenAddress,
          decimalsDisplayMultiplier,
          originalNumber: number,
          hasMultiplier: !!decimalsDisplayMultiplier
        });
        if (decimalsDisplayMultiplier) {
          // Apply the multiplier: 0.000001 * 1000000 = 1.0
          const multipliedNumber = number * decimalsDisplayMultiplier;
          console.log(`🔍 P3D multiplier applied:`, {
            originalNumber: number,
            multiplier: decimalsDisplayMultiplier,
            result: multipliedNumber
          });
          return multipliedNumber.toFixed(6).replace(/\.?0+$/, '') || '0';
        }
      }
      
      // Cap the displayed decimals to not exceed the token's actual decimals
      const maxTokenDecimals = Math.min(12, decimals);
      
      // Dynamic decimal adjustment based on number magnitude
      let displayDecimals;
      if (number === 0) {
        displayDecimals = 6; // Show 6 decimals for zero
      } else if (number < 0.000001) {
        displayDecimals = maxTokenDecimals; // Show full precision for very small numbers
      } else if (number < 0.0001) {
        displayDecimals = Math.min(10, maxTokenDecimals); // Show up to 10 decimals
      } else if (number < 0.01) {
        displayDecimals = Math.min(8, maxTokenDecimals); // Show up to 8 decimals
      } else if (number < 1) {
        displayDecimals = Math.min(6, maxTokenDecimals); // Show up to 6 decimals
      } else if (number < 100) {
        displayDecimals = Math.min(4, maxTokenDecimals); // Show up to 4 decimals
      } else if (number < 10000) {
        displayDecimals = Math.min(2, maxTokenDecimals); // Show up to 2 decimals
      } else {
        displayDecimals = 0; // Show no decimals for large numbers
      }
      
      // Format with calculated decimals and remove trailing zeros
      const formattedNumber = number.toFixed(displayDecimals);
      // Convert back to number and then to string to remove trailing zeros
      // but ensure we don't get scientific notation for very small numbers
      const cleanNumber = parseFloat(formattedNumber);
      return cleanNumber.toFixed(displayDecimals).replace(/\.?0+$/, '') || '0';
    } catch (error) {
      return '0.000000';
    }
  }, [get3DPassTokenDecimalsDisplayMultiplier]);

  const getForeignTokenBalance = useCallback(async (assistant, contractAddress, tokenAddress, networkKey) => {
    console.log(`🔍 getForeignTokenBalance called:`, {
      assistantType: assistant.type,
      contractAddress,
      tokenAddress,
      networkKey
    });
    
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      console.log(`🔍 No token address provided, returning 0`);
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
      console.log(`🔍 Network provider created for ${networkKey}:`, {
        rpcUrl: networkConfig.rpcUrl,
        chainId: networkConfig.id
      });
      
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
        console.log(`🔍 Creating Import Wrapper token contract with IPRECOMPILE_ERC20_ABI:`, {
          tokenAddress,
          contractAddress,
          networkKey,
          abiLength: IPRECOMPILE_ERC20_ABI.length
        });
        
        const tokenContract = new ethers.Contract(
          tokenAddress,
          IPRECOMPILE_ERC20_ABI,
          networkProvider
        );
        
        console.log(`🔍 Getting balance for Import Wrapper assistant...`);
        
        // Try to get additional token info for debugging
        try {
          const name = await tokenContract.name();
          const symbol = await tokenContract.symbol();
          const decimals = await tokenContract.decimals();
          const totalSupply = await tokenContract.totalSupply();
          
          console.log(`🔍 Token info for Import Wrapper:`, {
            name,
            symbol,
            decimals: decimals.toString(),
            totalSupply: totalSupply.toString(),
            contractAddress,
            tokenAddress
          });
        } catch (tokenInfoError) {
          console.warn(`⚠️ Could not get token info:`, tokenInfoError.message);
        }
        
        const balance = await tokenContract.balanceOf(contractAddress);
        
        // Get the correct decimals for formatting
        const decimals = await tokenContract.decimals();
        const formattedBalance = formatBalance(balance, decimals);
        
        console.log(`🔍 Import Wrapper balance result:`, {
          balance: balance.toString(),
          decimals: decimals.toString(),
          formatted: formattedBalance,
          isZero: balance.isZero(),
          contractAddress,
          tokenAddress
        });
        return balance.toString();
      }
      
      // For Import assistants, use regular ERC20 interface
      if (assistant.type === 'import') {
        console.log(`🔍 Creating Import token contract with ERC20 ABI:`, {
          tokenAddress,
          contractAddress,
          networkKey
        });
        
        const tokenContract = new ethers.Contract(
          tokenAddress,
          [
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
          ],
          networkProvider
        );
        
        console.log(`🔍 Getting balance for Import assistant...`);
        const balance = await tokenContract.balanceOf(contractAddress);
        console.log(`🔍 Import balance result:`, {
          balance: balance.toString(),
          formatted: formatBalance(balance)
        });
        return balance.toString();
      }
      
      return '0';
    } catch (error) {
      console.warn(`Error getting foreign token balance for ${tokenAddress} on ${networkKey}:`, error.message);
      return '0';
    }
  }, [getAllNetworksWithSettings, isKnownPrecompile, formatBalance]);

  const getForeignTokenDecimals = useCallback(async (assistant, tokenAddress, networkKey) => {
    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      return 18; // Default decimals
    }
    
    try {
      // Get the network-specific provider
      const networks = getAllNetworksWithSettings();
      const networkConfig = networks[networkKey];
      if (!networkConfig || !networkConfig.rpcUrl) {
        console.warn(`No RPC URL found for network: ${networkKey}`);
        return 18; // Default decimals
      }

      const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      
      // For Import Wrapper assistants, use IPrecompileERC20 interface
      if (assistant.type === 'import_wrapper') {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          IPRECOMPILE_ERC20_ABI,
          networkProvider
        );
        
        const decimals = await tokenContract.decimals();
        return decimals;
      }
      
      // For Import assistants, use regular ERC20 interface
      if (assistant.type === 'import') {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          [
            'function decimals() view returns (uint8)'
          ],
          networkProvider
        );
        
        const decimals = await tokenContract.decimals();
        return decimals;
      }
      
      return 18; // Default decimals
    } catch (error) {
      console.warn(`Error getting foreign token decimals for ${tokenAddress} on ${networkKey}:`, error.message);
      return 18; // Default decimals
    }
  }, [getAllNetworksWithSettings]);

  const getAssistantFees = useCallback(async (assistant, networkKey) => {
    try {
      // Get the network-specific provider
      const networks = getAllNetworksWithSettings();
      const networkConfig = networks[networkKey];
      if (!networkConfig || !networkConfig.rpcUrl) {
        console.warn(`No RPC URL found for network: ${networkKey}`);
        return { managementFee: 0, successFee: 0, swapFee: 0 };
      }

      const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      
      // Create contract instance with fee-related functions
      const assistantContract = new ethers.Contract(
        assistant.address,
        [
          'function management_fee10000() view returns (uint16)',
          'function success_fee10000() view returns (uint16)',
          'function swap_fee10000() view returns (uint16)'
        ],
        networkProvider
      );
      
      const [managementFee10000, successFee10000, swapFee10000] = await Promise.all([
        assistantContract.management_fee10000().catch(() => 0),
        assistantContract.success_fee10000().catch(() => 0),
        assistantContract.swap_fee10000().catch(() => 0)
      ]);
      
      // Convert from basis points (10000 = 100%) to percentage
      const managementFee = (managementFee10000 / 100).toFixed(2);
      const successFee = (successFee10000 / 100).toFixed(2);
      const swapFee = (swapFee10000 / 100).toFixed(2);
      
      console.log(`🔍 Fees for ${assistant.key}:`, {
        managementFee,
        successFee,
        swapFee,
        managementFee10000,
        successFee10000,
        swapFee10000
      });
      
      return { managementFee, successFee, swapFee };
    } catch (error) {
      console.warn(`Error getting fees for ${assistant.key}:`, error.message);
      return { managementFee: 0, successFee: 0, swapFee: 0 };
    }
  }, [getAllNetworksWithSettings]);

  const getAssistantManager = useCallback(async (assistant, networkKey) => {
    try {
      // Get the network-specific provider
      const networks = getAllNetworksWithSettings();
      const networkConfig = networks[networkKey];
      if (!networkConfig || !networkConfig.rpcUrl) {
        console.warn(`No RPC URL found for network: ${networkKey}`);
        return null;
      }

      const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      
      // Create contract instance with manager function
      const assistantContract = new ethers.Contract(
        assistant.address,
        [
          'function managerAddress() view returns (address)'
        ],
        networkProvider
      );
      
      const managerAddress = await assistantContract.managerAddress();
      
      console.log(`🔍 Manager for ${assistant.key}:`, {
        managerAddress,
        isZero: managerAddress === '0x0000000000000000000000000000000000000000'
      });
      
      // Return null if manager address is zero address
      return managerAddress === '0x0000000000000000000000000000000000000000' ? null : managerAddress;
    } catch (error) {
      console.warn(`Error getting manager for ${assistant.key}:`, error.message);
      return null;
    }
  }, [getAllNetworksWithSettings]);

  const validateAssistantState = useCallback((stakeTokenBalance, shareTokenSupply) => {
    try {
      const stakeBalance = ethers.BigNumber.from(stakeTokenBalance || '0');
      const shareSupply = ethers.BigNumber.from(shareTokenSupply || '0');
      
      // Assistant is invalid if: Stake Token Balance > 0 AND Share Token Supply = 0
      const isValid = !(stakeBalance.gt(0) && shareSupply.eq(0));
      
      console.log(`🔍 Assistant validation:`, {
        stakeBalance: stakeBalance.toString(),
        shareSupply: shareSupply.toString(),
        isValid,
        reason: isValid ? 'Valid state' : 'Invalid: Has stake tokens but no share tokens'
      });
      
      return isValid;
    } catch (error) {
      console.warn('Error validating assistant state:', error);
      return true; // Default to valid if validation fails
    }
  }, []);

  // Filter assistants based on validation status
  const getFilteredAssistants = useCallback(() => {
    if (showInvalidAssistants) {
      return assistants; // Show all assistants
    }
    
    // Filter out invalid assistants (but show loading/unknown status)
    return assistants.filter(assistant => {
      const isValid = assistantValidation[assistant.key];
      return isValid !== false; // Show valid assistants and those with undefined status (loading)
    });
  }, [assistants, assistantValidation, showInvalidAssistants]);

  // Count invalid assistants
  const getInvalidAssistantsCount = useCallback(() => {
    return assistants.filter(assistant => {
      const isValid = assistantValidation[assistant.key];
      return isValid === false;
    }).length;
  }, [assistants, assistantValidation]);

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
        // Get network information from the preserved networkKey
        const network = assistant.networkKey ? networks[assistant.networkKey] : null;
        
        console.log(`🔍 Network detection for assistant ${key}:`, {
          assistantKey: key,
          assistantAddress: assistant.address,
          bridgeAddress: assistant.bridgeAddress,
          networkKey: assistant.networkKey,
          foundNetwork: network?.name || 'Unknown',
          networkSymbol: network?.symbol || 'Unknown'
        });
        
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
    console.log('🔍 Loading balances for all networks...', {
      assistantsCount: assistants.length,
      timestamp: new Date().toISOString()
    });

    const newBalances = {};
    const newShareTokenSupplies = {};
    const newForeignTokenBalances = {};
    const newAssistantFees = {};
    const newAssistantManagers = {};
    const newAssistantValidation = {};
    
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

        // Get the network key from the assistant (preserved from settings)
        const assistantNetworkKey = assistant.networkKey;

        if (!assistantNetworkKey) {
          console.warn(`No network key found for assistant ${assistant.key}`, {
            assistantKey: assistant.key,
            assistantAddress: assistant.address,
            bridgeAddress: assistant.bridgeAddress,
            availableNetworks: Object.keys(networks)
          });
          continue;
        }

        console.log(`🔍 Assistant ${assistant.key} belongs to network: ${assistantNetworkKey}`);

        // Get stake token balance
        const stakeTokenAddress = assistant.stakeTokenAddress || getStakeTokenAddress(assistant);
        if (stakeTokenAddress) {
          const stakeTokenBalance = await getTokenBalance(
            assistant.address, 
            stakeTokenAddress,
            assistantNetworkKey
          );
          
          // Get stake token decimals from settings
          const stakeTokenDecimals = getTokenDecimalsFromSettings(stakeTokenAddress, assistantNetworkKey);
          
          newBalances[assistant.key] = {
            stakeTokenBalance,
            stakeTokenDecimals
          };
        } else {
          console.warn(`No stake token address found for assistant ${assistant.key}`);
          newBalances[assistant.key] = {
            stakeTokenBalance: '0',
            stakeTokenDecimals: 18
          };
        }
        
        // Get share token total supply instead of balance
        const shareTokenTotalSupply = await getTokenTotalSupply(assistant.address, assistantNetworkKey);
        // Get share token decimals from settings
        const shareTokenDecimals = getTokenDecimalsFromSettings(assistant.address, assistantNetworkKey);
        newShareTokenSupplies[assistant.key] = {
          shareTokenTotalSupply,
          shareTokenDecimals
        };

        // Get assistant fees
        const fees = await getAssistantFees(assistant, assistantNetworkKey);
        newAssistantFees[assistant.key] = fees;

        // Get assistant manager
        const managerAddress = await getAssistantManager(assistant, assistantNetworkKey);
        newAssistantManagers[assistant.key] = managerAddress;

        // Validate assistant state
        const stakeTokenBalance = newBalances[assistant.key]?.stakeTokenBalance || '0';
        const shareTokenSupply = newShareTokenSupplies[assistant.key]?.shareTokenTotalSupply || '0';
        const isValid = validateAssistantState(stakeTokenBalance, shareTokenSupply);
        newAssistantValidation[assistant.key] = isValid;

        // Get foreign token balance for import assistants only
        if (assistant.type === 'import' || assistant.type === 'import_wrapper') {
          const foreignTokenAddress = getForeignTokenAddress(assistant);
          console.log(`🔍 Foreign token address for ${assistant.key}:`, {
            assistantType: assistant.type,
            bridgeAddress: assistant.bridgeAddress,
            foreignTokenAddress,
            hasForeignTokenAddress: !!foreignTokenAddress,
            assistantAddress: assistant.address,
            networkKey: assistantNetworkKey
          });
          
          if (foreignTokenAddress) {
            // For all assistant types, fetch foreign token balance from the assistant address
            const balanceContractAddress = assistant.address;
            
            console.log(`🔍 Using contract address for balance check:`, {
              assistantType: assistant.type,
              balanceContractAddress,
              assistantAddress: assistant.address,
              bridgeAddress: assistant.bridgeAddress
            });
            
            const foreignTokenBalance = await getForeignTokenBalance(
              assistant,
              balanceContractAddress,
              foreignTokenAddress,
              assistantNetworkKey
            );
            // Get decimals for proper formatting
            const foreignTokenDecimals = await getForeignTokenDecimals(assistant, foreignTokenAddress, assistantNetworkKey);
            
            console.log(`🔍 Foreign token balance for ${assistant.key}:`, {
              foreignTokenAddress,
              assistantAddress: assistant.address,
              balance: foreignTokenBalance,
              decimals: foreignTokenDecimals,
              formatted: formatBalance(foreignTokenBalance, foreignTokenDecimals)
            });
            newForeignTokenBalances[assistant.key] = {
              foreignTokenBalance,
              decimals: foreignTokenDecimals
            };
          } else {
            console.warn(`No foreign token address found for assistant ${assistant.key}`, {
              assistantType: assistant.type,
              bridgeAddress: assistant.bridgeAddress,
              networks: Object.keys(networks)
            });
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
        newAssistantFees[assistant.key] = {
          managementFee: '0.00',
          successFee: '0.00',
          swapFee: '0.00'
        };
        newAssistantManagers[assistant.key] = null;
        newAssistantValidation[assistant.key] = true; // Default to valid on error
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
    setAssistantFees(newAssistantFees);
    setAssistantManagers(newAssistantManagers);
    setAssistantValidation(newAssistantValidation);
    
    console.log('✅ Balance loading completed:', {
      balancesCount: Object.keys(newBalances).length,
      shareTokenSuppliesCount: Object.keys(newShareTokenSupplies).length,
      foreignTokenBalancesCount: Object.keys(newForeignTokenBalances).length,
      timestamp: new Date().toISOString()
    });
  }, [assistants, getTokenBalance, getTokenTotalSupply, getStakeTokenAddress, getForeignTokenAddress, getForeignTokenBalance, getForeignTokenDecimals, getAssistantFees, getAssistantManager, validateAssistantState, getTokenDecimalsFromSettings, getAllNetworksWithSettings, formatBalance]);

  useEffect(() => {
    loadAssistants();
  }, [loadAssistants]);

  useEffect(() => {
    if (assistants.length > 0) {
      loadBalances();
    }
  }, [assistants, loadBalances]);


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
    console.log('🔄 Switching to network:', requiredNetwork.name, 'Chain ID:', requiredNetwork.chainId);

    const success = await switchNetwork(requiredNetwork);

    if (success) {
      console.log('✅ Network switched successfully');
    } else {
      console.error('❌ Network switching failed');
    }

    return success;
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

  const filteredAssistants = getFilteredAssistants();
  const invalidCount = getInvalidAssistantsCount();

  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        {filteredAssistants.map((assistant, index) => (
          <motion.div
            key={assistant.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {assistant.description || assistant.key}
                </h3>
                <p className="text-secondary-400 text-sm">
                  {assistant.network} • {assistant.type}
                </p>
                </div>
                {/* Validation Status Indicator */}
                <div className="flex-shrink-0 mt-1">
                  {assistantValidation[assistant.key] === undefined ? (
                    <div className="flex items-center gap-1 text-secondary-400" title="Validating state...">
                      <div className="w-4 h-4 border-2 border-secondary-400 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : assistantValidation[assistant.key] ? (
                    <div className="flex items-center gap-1 text-green-400" title="Valid state">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-400" title="Invalid state: Has stake tokens but no share tokens">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
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
                    ? formatBalance(balances[assistant.key].stakeTokenBalance, balances[assistant.key].stakeTokenDecimals || 18, assistant.stakeTokenAddress || getStakeTokenAddress(assistant))
                    : '0.000000'
                  }
                </div>
              </div>

              {/* Share Token Total Supply */}
              <div className="bg-dark-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-secondary-400">Share Token Supply</span>
                  <span className="text-xs text-secondary-500">
                    {assistant.shareSymbol || 'Shares'}
                  </span>
                </div>
                <div className={`text-xl font-semibold ${
                  assistantValidation[assistant.key] === false && 
                  shareTokenSupplies[assistant.key]?.shareTokenTotalSupply === '0' 
                    ? 'text-red-400' 
                    : 'text-white'
                }`}>
                  {shareTokenSupplies[assistant.key]?.shareTokenTotalSupply 
                    ? formatBalance(shareTokenSupplies[assistant.key].shareTokenTotalSupply, shareTokenSupplies[assistant.key].shareTokenDecimals || 18, assistant.address)
                    : '0.000000'
                  }
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
                      ? formatBalance(foreignTokenBalances[assistant.key].foreignTokenBalance, foreignTokenBalances[assistant.key].decimals || 18, getForeignTokenAddress(assistant))
                      : '0.000000'
                    }
                  </div>
                </div>
              )}
            </div>

            {/* Fee Information */}
            <div className="mt-4 pt-4 border-t border-dark-700">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-xs text-secondary-400 mb-1">Management Fee</div>
                  <div className="text-sm font-semibold text-white">
                    {assistantFees[assistant.key]?.managementFee || '0.00'}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-secondary-400 mb-1">Success Fee</div>
                  <div className="text-sm font-semibold text-white">
                    {assistantFees[assistant.key]?.successFee || '0.00'}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-secondary-400 mb-1">Swap Fee</div>
                  <div className="text-sm font-semibold text-white">
                    {assistantFees[assistant.key]?.swapFee || '0.00'}%
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-dark-700">
              <div className="flex items-center gap-6">
                {/* Bridge Address */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-secondary-400">Bridge:</span>
                  <div className="text-sm text-secondary-300 font-mono">
                    {assistant.bridgeAddress?.slice(0, 6)}...{assistant.bridgeAddress?.slice(-4)}
                    </div>
                    <button
                    onClick={() => copyToClipboard(assistant.bridgeAddress, 'Bridge contract address')}
                      className="p-1 hover:bg-dark-700 rounded transition-colors"
                    title="Copy bridge address"
                    >
                    {copiedAddress === assistant.bridgeAddress ? (
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

                {/* Manager Address */}
                {assistantManagers[assistant.key] && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-secondary-400">Manager:</span>
                  <div className="text-sm text-secondary-300 font-mono">
                      {assistantManagers[assistant.key].slice(0, 6)}...{assistantManagers[assistant.key].slice(-4)}
                  </div>
                  <button
                      onClick={() => copyToClipboard(assistantManagers[assistant.key], 'Manager address')}
                    className="p-1 hover:bg-dark-700 rounded transition-colors"
                    title="Copy manager address"
                  >
                      {copiedAddress === assistantManagers[assistant.key] ? (
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
            )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 pt-4 border-t border-dark-700">
              <div className="flex gap-3">
                <button
                  onClick={() => handleDeposit(assistant)}
                  disabled={assistantValidation[assistant.key] === false}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    assistantValidation[assistant.key] === false
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-primary-600 hover:bg-primary-700 text-white'
                  }`}
                >
                  Deposit
                </button>
                <button
                  onClick={() => handleWithdraw(assistant)}
                  disabled={assistantValidation[assistant.key] === false}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    assistantValidation[assistant.key] === false
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-secondary-600 hover:bg-secondary-700 text-white'
                  }`}
                >
                  Withdraw
                </button>
              </div>
              
              {/* Manager Buttons - Only show if user is the manager */}
              {assistantManagers[assistant.key] && account && assistantManagers[assistant.key].toLowerCase() === account.toLowerCase() && (
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

      {/* Show Invalid Assistants Toggle */}
      {invalidCount > 0 && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setShowInvalidAssistants(!showInvalidAssistants)}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-secondary-300 hover:text-white rounded-md text-sm font-medium transition-colors"
          >
            {showInvalidAssistants ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Hide Invalid Assistants
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Show Invalid Assistants ({invalidCount})
              </>
            )}
          </button>
        </div>
      )}

      {/* Dialogs */}
      {showDepositDialog && selectedAssistant && (
        <Deposit
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={async () => {
            handleCloseDialogs();
            // Wait a moment for blockchain state to update
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('🔄 Refreshing balances after successful deposit...');
            loadBalances(); // Refresh balances after successful deposit
          }}
        />
      )}

      {showWithdrawDialog && selectedAssistant && (
        <Withdraw
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={async () => {
            handleCloseDialogs();
            // Wait a moment for blockchain state to update
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('🔄 Refreshing balances after successful withdraw...');
            loadBalances(); // Refresh balances after successful withdraw
          }}
        />
      )}

      {showWithdrawManagementFeeDialog && selectedAssistant && (
        <WithdrawManagementFee
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={async () => {
            handleCloseDialogs();
            // Wait a moment for blockchain state to update
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('🔄 Refreshing balances after successful management fee withdrawal...');
            loadBalances(); // Refresh balances after successful fee withdrawal
          }}
        />
      )}

      {showWithdrawSuccessFeeDialog && selectedAssistant && (
        <WithdrawSuccessFee
          assistant={selectedAssistant}
          onClose={handleCloseDialogs}
          onSuccess={async () => {
            handleCloseDialogs();
            // Wait a moment for blockchain state to update
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('🔄 Refreshing balances after successful success fee withdrawal...');
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
