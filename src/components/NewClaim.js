import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { 
  get3DPassTokenMetadata, 
  get3DPassTokenBalance,
  approve3DPassToken,
  get3DPassTokenAllowance,
  getTokenSymbolFromPrecompile
} from '../utils/threedpass';
import { 
  COUNTERSTAKE_ABI
} from '../contracts/abi';
import { NETWORKS } from '../config/networks';
import { 
  X, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  Info,
  ExternalLink,
  Coins,
  ChevronDown,
  ChevronUp,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { getReliableTimestamp } from '../utils/time';

// Safely convert to EIP-55 checksum if it's an EVM address
const toChecksumAddress = (address) => {
  try {
    return ethers.utils.getAddress(address);
  } catch (e) {
    return address;
  }
};

// Helper functions to get network and token configuration
const getNetworkConfig = (networkId) => {
  return Object.values(NETWORKS).find(network => network.id === networkId);
};

const getTokenDecimals = (networkId, tokenAddress) => {
  const networkConfig = getNetworkConfig(networkId);
  if (!networkConfig || !networkConfig.tokens) return 18; // Default fallback
  
  const token = Object.values(networkConfig.tokens).find(t => 
    t.address?.toLowerCase() === tokenAddress?.toLowerCase()
  );
  return token?.decimals || 18; // Default fallback
};

const getStakeTokenDecimals = (networkId) => {
  const networkConfig = getNetworkConfig(networkId);
  if (!networkConfig) return 18; // Default fallback
  
  // For 3DPass, P3D has 18 decimals
  if (networkId === NETWORKS.THREEDPASS.id) {
    return 18;
  }
  
  // For Ethereum, USDT has 6 decimals
  if (networkId === NETWORKS.ETHEREUM.id) {
    return 6;
  }
  
  return 18; // Default fallback
};

// Helper function to get display multiplier for stake token
const getStakeTokenDisplayMultiplier = (networkId) => {
  const networkConfig = getNetworkConfig(networkId);
  if (!networkConfig) return 1; // Default fallback
  
  // For 3DPass, P3D has display multiplier
  if (networkId === NETWORKS.THREEDPASS.id) {
    return networkConfig.nativeCurrency?.decimalsDisplayMultiplier || 1;
  }
  
  return 1; // Default fallback for other networks
};

// Helper function to format stake token amount for display
const formatStakeTokenForDisplay = (amount, networkId) => {
  const multiplier = getStakeTokenDisplayMultiplier(networkId);
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) return amount;
  return (numericAmount * multiplier).toString();
};

// Helper function to check if this is a third-party claim
const checkThirdPartyClaim = (account, recipientAddress, reward) => {
  if (!account || !recipientAddress) return false;
  
  // Third-party claim condition: signer != recipient AND reward > 0
  const isDifferentRecipient = account.toLowerCase() !== recipientAddress.toLowerCase();
  const hasReward = parseFloat(reward || '0') > 0;
  
  return isDifferentRecipient && hasReward;
};

// Get maximum allowance value (2^256 - 1)
const getMaxAllowance = () => {
  return ethers.constants.MaxUint256;
};

const NewClaim = ({ isOpen, onClose, selectedToken = null, selectedTransfer = null, onClaimSubmitted = null }) => {
  const { account, provider, network, isConnected, signer } = useWeb3();
  const { getBridgeInstancesWithSettings, getNetworkWithSettings } = useSettings();
  
  // Form state
  const [formData, setFormData] = useState({
    tokenAddress: '',
    amount: '',
    reward: '',
    txid: '',
    txts: '', // Will be set with reliable external timestamp
    senderAddress: '',
    recipientAddress: '',
    data: '0x'
  });
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [tokenMetadata, setTokenMetadata] = useState(null);
  const [tokenBalance, setTokenBalance] = useState('0');
  const [stakeTokenBalance, setStakeTokenBalance] = useState('0');
  const [isLoadingStakeBalance, setIsLoadingStakeBalance] = useState(false);
  const [selectedBridge, setSelectedBridge] = useState(null);
  const [requiredStake, setRequiredStake] = useState('0');
  const [allowance, setAllowance] = useState('0');
  const [needsApproval, setNeedsApproval] = useState(true);
  const [availableTokens, setAvailableTokens] = useState([]);
  const [isThirdPartyClaim, setIsThirdPartyClaim] = useState(false);
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [useMaxAllowance, setUseMaxAllowance] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  
  // Custom control state for transaction details
  const [customControls, setCustomControls] = useState({
    amount: false,
    reward: false,
    txid: false,
    txts: false,
    data: false,
    senderAddress: false,
    recipientAddress: false
  });

  // Initialize form when component mounts or token changes
  useEffect(() => {
    if (isOpen) {
      // Add a small delay to ensure network switch has completed
      const timer = setTimeout(async () => {
        if (selectedTransfer) {
          // Pre-fill form with transfer data
          console.log('🔍 Pre-filling form with transfer data:', selectedTransfer);
          
          // Use reliable external timestamp for both Expatriation and Repatriation claims
          const calculateTxts = async () => {
            const reliableTimestamp = await getReliableTimestamp();
            
            console.log('🔍 Using reliable external timestamp:', {
              reliableTimestamp: reliableTimestamp,
              reliableDate: new Date(reliableTimestamp * 1000).toISOString(),
              transferTimestamp: selectedTransfer.timestamp,
              blockTimestamp: selectedTransfer.blockTimestamp,
              blockNumber: selectedTransfer.blockNumber
            });
            
            console.log(`🔍 Using reliable timestamp: ${reliableTimestamp} (${new Date(reliableTimestamp * 1000).toISOString()})`);
            return reliableTimestamp;
          };
          
          const txtsValue = await calculateTxts();
          // Determine the correct token address based on the transfer type
          let tokenAddress = '';
          
          // For repatriation claims, we always want the homeTokenAddress (token on Ethereum side)
          // regardless of current network detection, because repatriation claims are created on Ethereum
          if (selectedTransfer.eventType === 'NewRepatriation') {
            // Repatriation: use homeTokenAddress (USDT on Ethereum)
            tokenAddress = selectedTransfer.homeTokenAddress || selectedTransfer.fromTokenAddress || '';
            console.log('🔍 Repatriation detected - using homeTokenAddress:', tokenAddress);
          } else if (network?.id === NETWORKS.THREEDPASS.id) {
            // On 3DPass: use foreignTokenAddress (token on 3DPass side)
            tokenAddress = selectedTransfer.foreignTokenAddress || selectedTransfer.toTokenAddress || '';
          } else if (network?.id === NETWORKS.ETHEREUM.id) {
            // On Ethereum: for repatriation claims, use homeTokenAddress (token on Ethereum side)
            // This is the token that will be claimed (USDT on Ethereum)
            tokenAddress = selectedTransfer.homeTokenAddress || selectedTransfer.fromTokenAddress || '';
          } else {
            // Fallback: try both
            tokenAddress = selectedTransfer.foreignTokenAddress || selectedTransfer.homeTokenAddress || selectedTransfer.toTokenAddress || '';
          }
          
          console.log('🔍 Setting token address for network:', {
            networkId: network?.id,
            networkName: network?.name,
            foreignTokenAddress: selectedTransfer.foreignTokenAddress,
            homeTokenAddress: selectedTransfer.homeTokenAddress,
            fromTokenAddress: selectedTransfer.fromTokenAddress,
            toTokenAddress: selectedTransfer.toTokenAddress,
            selectedTokenAddress: tokenAddress,
            transferReward: selectedTransfer.reward,
            fullTransfer: selectedTransfer
          });
          
          // Get the correct token decimals for formatting
          const tokenDecimals = getTokenDecimals(network?.id, tokenAddress);
          console.log('🔍 Using token decimals for formatting:', {
            tokenAddress,
            networkId: network?.id,
            tokenDecimals
          });
          
          setFormData(prev => ({
            ...prev,
            tokenAddress: tokenAddress.toLowerCase(),
            amount: selectedTransfer.amount ? 
              (typeof selectedTransfer.amount === 'string' ? 
                (selectedTransfer.amount.startsWith('0x') ? 
                  ethers.utils.formatUnits(selectedTransfer.amount, tokenDecimals) : 
                  selectedTransfer.amount) : 
               ethers.utils.formatUnits(selectedTransfer.amount, tokenDecimals)) : '',
            reward: (() => {
              const rewardValue = selectedTransfer.reward ? 
                (typeof selectedTransfer.reward === 'string' ? 
                  (selectedTransfer.reward.startsWith('0x') ? 
                    ethers.utils.formatUnits(selectedTransfer.reward, tokenDecimals) : 
                    selectedTransfer.reward) : 
                 ethers.utils.formatUnits(selectedTransfer.reward, tokenDecimals)) : '0';
              console.log('🔍 Pre-filling reward from transfer:', {
                originalReward: selectedTransfer.reward,
                formattedReward: rewardValue,
                tokenDecimals
              });
              return rewardValue;
            })(),
            txid: selectedTransfer.txid || selectedTransfer.transactionHash || '',
            txts: txtsValue,
            senderAddress: toChecksumAddress(selectedTransfer.fromAddress || selectedTransfer.senderAddress || ''),
            recipientAddress: toChecksumAddress(selectedTransfer.toAddress || selectedTransfer.recipientAddress || account || ''),
            data: selectedTransfer.data || '0x'
          }));
        } else if (selectedToken) {
          const reliableTimestamp = await getReliableTimestamp();
          setFormData(prev => ({
            ...prev,
            tokenAddress: selectedToken.address,
            recipientAddress: toChecksumAddress(account || ''),
            senderAddress: '', // Don't pre-fill sender address for manual claims
            txts: reliableTimestamp // Use reliable external timestamp
          }));
        } else if (account) {
          // If no selected token but account is available, still set the recipient address
          const reliableTimestamp = await getReliableTimestamp();
          setFormData(prev => ({
            ...prev,
            recipientAddress: toChecksumAddress(account),
            senderAddress: '', // Don't pre-fill sender address for manual claims
            txts: reliableTimestamp // Use reliable external timestamp
          }));
        }
        // Reset approval state when form opens or token changes
        setNeedsApproval(true);
        
        // Reset custom controls when dialog opens
        setCustomControls({
          amount: false,
          reward: false, // Disable reward editing by default
          txid: false,
          txts: false,
          data: false,
          senderAddress: false,
          recipientAddress: false
        });
        
        // Reset transaction details visibility when dialog opens
        setShowTransactionDetails(false);
      }, 1000); // Wait 1 second for network switch to complete
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedToken, selectedTransfer, account, provider, getNetworkWithSettings, network?.id, network?.name]);

  // Load available tokens from bridge configurations
  const loadAvailableTokens = useCallback(async () => {
    if (!provider) return;

    try {
      const tokens = [];
      const allBridges = getBridgeInstancesWithSettings();
      
      console.log('🔍 All bridges from settings:', Object.keys(allBridges));
      console.log('🔍 Bridge details:', Object.values(allBridges).map(b => ({
        type: b.type,
        homeNetwork: b.homeNetwork,
        foreignNetwork: b.foreignNetwork,
        homeTokenAddress: b.homeTokenAddress,
        foreignTokenAddress: b.foreignTokenAddress
      })));
      
      // Get unique token addresses from all bridges
      const tokenAddresses = new Set();
      
      Object.values(allBridges).forEach(bridge => {
        console.log('🔍 Processing bridge:', {
          type: bridge.type,
          homeNetwork: bridge.homeNetwork,
          foreignNetwork: bridge.foreignNetwork,
          homeTokenAddress: bridge.homeTokenAddress,
          foreignTokenAddress: bridge.foreignTokenAddress,
          currentNetwork: network?.name,
          currentNetworkId: network?.id
        });
        
        // For export bridges: 
        // - On 3DPass: foreignTokenAddress is the token on 3DPass side (where we are)
        // - On Ethereum: homeTokenAddress is the token on Ethereum side (where we are for repatriation claims)
        if (bridge.type === 'export') {
          if (network?.id === NETWORKS.THREEDPASS.id) {
            // On 3DPass: load foreignTokenAddress (token on 3DPass side)
            if (bridge.foreignTokenAddress) {
              tokenAddresses.add(bridge.foreignTokenAddress.toLowerCase());
              console.log('✅ Added export bridge foreign token (3DPass):', bridge.foreignTokenAddress);
            }
          } else {
            // On Ethereum: load homeTokenAddress (token on Ethereum side)
            if (bridge.homeTokenAddress) {
              tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
              console.log('✅ Added export bridge home token (Ethereum):', bridge.homeTokenAddress);
            }
          }
        }
        // For import wrapper bridges: 
        // - On 3DPass: foreignTokenAddress is the token on 3DPass side (where we are)
        // - On Ethereum: homeTokenAddress is the token on Ethereum side (where we are for repatriation claims)
        else if (bridge.type === 'import_wrapper') {
          console.log('🔍 Found import_wrapper bridge, checking token addresses:', {
            bridgeType: bridge.type,
            homeTokenAddress: bridge.homeTokenAddress,
            foreignTokenAddress: bridge.foreignTokenAddress,
            hasHomeToken: !!bridge.homeTokenAddress,
            hasForeignToken: !!bridge.foreignTokenAddress,
            currentNetwork: network?.name,
            currentNetworkId: network?.id
          });
          
          if (network?.id === NETWORKS.THREEDPASS.id) {
            // On 3DPass: use foreignTokenAddress (token on 3DPass side)
            if (bridge.foreignTokenAddress) {
              tokenAddresses.add(bridge.foreignTokenAddress.toLowerCase());
              console.log('✅ Added import_wrapper bridge foreign token (3DPass):', bridge.foreignTokenAddress);
            } else {
              console.log('❌ Import_wrapper bridge has no foreignTokenAddress');
            }
          } else if (network?.id === NETWORKS.ETHEREUM.id) {
            // On Ethereum: use homeTokenAddress (token on Ethereum side for repatriation claims)
            if (bridge.homeTokenAddress) {
              tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
              console.log('✅ Added import_wrapper bridge home token (Ethereum):', bridge.homeTokenAddress);
            } else {
              console.log('❌ Import_wrapper bridge has no homeTokenAddress');
            }
          }
        }
        // For import bridges: homeTokenAddress is the token on Ethereum side (where we are for repatriation claims)
        else if (bridge.type === 'import') {
          console.log('🔍 Found import bridge, checking homeTokenAddress:', {
            bridgeType: bridge.type,
            homeTokenAddress: bridge.homeTokenAddress,
            hasHomeToken: !!bridge.homeTokenAddress,
            currentNetwork: network?.name,
            currentNetworkId: network?.id
          });
          if (bridge.homeTokenAddress) {
            tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
            console.log('✅ Added import bridge token:', bridge.homeTokenAddress);
          } else {
            console.log('❌ Import bridge has no homeTokenAddress');
          }
        } else {
          console.log('❌ Bridge not processed:', {
            type: bridge.type,
            hasForeignToken: !!bridge.foreignTokenAddress,
            hasHomeToken: !!bridge.homeTokenAddress,
            foreignToken: bridge.foreignTokenAddress,
            homeToken: bridge.homeTokenAddress,
            currentNetwork: network?.name,
            currentNetworkId: network?.id
          });
        }
      });

      console.log('🔍 Found token addresses from bridges:', Array.from(tokenAddresses));

      // Load metadata for each unique token address
      for (const address of tokenAddresses) {
        try {
          // For 3DPass network, use 3DPass token metadata
          if (network?.id === NETWORKS.THREEDPASS.id) {
            const metadata = await get3DPassTokenMetadata(provider, address);
            tokens.push(metadata);
          } else {
            // For other networks (like Ethereum), use standard ERC20 metadata
            const tokenContract = new ethers.Contract(address, [
              'function symbol() view returns (string)',
              'function name() view returns (string)',
              'function decimals() view returns (uint8)'
            ], provider);
            
            const [symbol, name, decimals] = await Promise.all([
              tokenContract.symbol(),
              tokenContract.name(),
              tokenContract.decimals()
            ]);
            
            tokens.push({
              address,
              symbol,
              name,
              decimals
            });
          }
        } catch (error) {
          console.warn(`Failed to load metadata for ${address}:`, error);
        }
      }

      console.log('🔍 Loaded tokens from bridges:', tokens.map(t => ({ symbol: t.symbol, address: t.address })));
      console.log('🔍 Token addresses found:', Array.from(tokenAddresses));
      console.log('🔍 Current formData.tokenAddress:', formData.tokenAddress);
      console.log('🔍 Available tokens for dropdown:', tokens);
      setAvailableTokens(tokens);
    } catch (error) {
      console.error('Error loading available tokens:', error);
      toast.error('Failed to load available tokens');
    }
  }, [provider, getBridgeInstancesWithSettings, network?.id, network?.name, formData.tokenAddress]);

  // Load token metadata
  const loadTokenMetadata = useCallback(async () => {
    if (!formData.tokenAddress || !provider) return;

    try {
      let metadata;
      
      // For 3DPass network, use 3DPass token metadata
      if (network?.id === NETWORKS.THREEDPASS.id) {
        metadata = await get3DPassTokenMetadata(provider, formData.tokenAddress);
      } else {
        // For other networks (like Ethereum), use standard ERC20 metadata
        const tokenContract = new ethers.Contract(formData.tokenAddress, [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)'
        ], provider);
        
        const [symbol, name, decimals] = await Promise.all([
          tokenContract.symbol(),
          tokenContract.name(),
          tokenContract.decimals()
        ]);
        
        metadata = {
          address: formData.tokenAddress,
          symbol,
          name,
          decimals
        };
      }
      
      setTokenMetadata(metadata);
    } catch (error) {
      console.error('Error loading token metadata:', error);
      setTokenMetadata(null);
    }
  }, [formData.tokenAddress, provider, network?.id]);

  // Load token balance
  const loadTokenBalance = useCallback(async () => {
    if (!formData.tokenAddress || !provider || !account) return;

    try {
      let balance;
      
      // For 3DPass network, use 3DPass token balance
      if (network?.id === NETWORKS.THREEDPASS.id) {
        balance = await get3DPassTokenBalance(provider, formData.tokenAddress, account);
      } else {
        // For other networks (like Ethereum), use standard ERC20 balance
        const tokenContract = new ethers.Contract(formData.tokenAddress, [
          'function balanceOf(address) view returns (uint256)'
        ], provider);
        
        const balanceWei = await tokenContract.balanceOf(account);
        const decimals = getTokenDecimals(network?.id, formData.tokenAddress);
        balance = ethers.utils.formatUnits(balanceWei, decimals);
      }
      
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading token balance:', error);
      setTokenBalance('0');
    }
  }, [formData.tokenAddress, provider, account, network?.id]);

  // Load stake token balance (P3D)
  const loadStakeTokenBalance = useCallback(async () => {
    if (!selectedBridge || !provider || !account) return;

    setIsLoadingStakeBalance(true);
    try {
      const stakeTokenAddress = selectedBridge.stakeTokenAddress;
      if (stakeTokenAddress) {
        let balance;
        
        // For 3DPass network, use 3DPass token balance
        if (network?.id === NETWORKS.THREEDPASS.id) {
          balance = await get3DPassTokenBalance(provider, stakeTokenAddress, account);
        } else {
          // For other networks (like Ethereum), use standard ERC20 balance
          const tokenContract = new ethers.Contract(stakeTokenAddress, [
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)'
          ], provider);
          
          const [balanceWei, decimals] = await Promise.all([
            tokenContract.balanceOf(account),
            tokenContract.decimals()
          ]);
          
          balance = ethers.utils.formatUnits(balanceWei, decimals); // Use correct decimals for stake token
        }
        
        setStakeTokenBalance(balance);
      }
    } catch (error) {
      console.error('Error loading stake token balance:', error);
      setStakeTokenBalance('0');
    } finally {
      setIsLoadingStakeBalance(false);
    }
  }, [selectedBridge, provider, account, network?.id]);

  // Determine the correct bridge based on token
  const determineBridge = useCallback(() => {
    if (!formData.tokenAddress) return;

    const allBridges = getBridgeInstancesWithSettings();
    console.log('🔍 determineBridge called with:', { 
      tokenAddress: formData.tokenAddress, 
      currentNetwork: network?.name,
      currentNetworkId: network?.id,
      selectedTransfer: selectedTransfer
    });
    console.log('📋 All available bridges:', Object.values(allBridges).map(b => ({
      type: b.type,
      homeNetwork: b.homeNetwork,
      foreignNetwork: b.foreignNetwork,
      homeTokenAddress: b.homeTokenAddress,
      foreignTokenAddress: b.foreignTokenAddress
    })));

    // For repatriation claims, prioritize export bridges regardless of current network
    if (selectedTransfer && selectedTransfer.eventType === 'NewRepatriation') {
      console.log('🔍 Repatriation detected - looking for export bridge first');
      
      // Look for export bridge for this token (for repatriation claims)
      const exportBridge = Object.values(allBridges).find(bridge => {
        const matches = bridge.type === 'export' && 
          bridge.homeTokenAddress?.toLowerCase() === formData.tokenAddress.toLowerCase();
        
        console.log('🔍 Checking export bridge for repatriation:', {
          bridgeType: bridge.type,
          bridgeHomeTokenAddress: bridge.homeTokenAddress,
          bridgeForeignTokenAddress: bridge.foreignTokenAddress,
          bridgeHomeNetwork: bridge.homeNetwork,
          bridgeForeignNetwork: bridge.foreignNetwork,
          formDataTokenAddress: formData.tokenAddress,
          matches
        });
        
        return matches;
      });
      
      if (exportBridge) {
        console.log('✅ Found export bridge for repatriation:', exportBridge);
        setSelectedBridge(exportBridge);
        return;
      }
    }

    // For 3DPass network (export and import_wrapper bridges)
    if (network?.id === NETWORKS.THREEDPASS.id) {
      const tokenSymbol = getTokenSymbolFromPrecompile(formData.tokenAddress);
      if (!tokenSymbol) return;

      // Check if this is a wrapped token (import_wrapper case)
      if (tokenSymbol.startsWith('w') && tokenSymbol !== 'wP3D') {
        console.log('🔍 Looking for import wrapper bridge for wrapped token:', tokenSymbol);
        
        // Look for import wrapper bridge for this token
        // For import wrapper bridges, the token address should match foreignTokenAddress (3DPass side)
        const importBridge = Object.values(allBridges).find(bridge => {
          const matches = bridge.type === 'import_wrapper' && 
            bridge.foreignTokenAddress?.toLowerCase() === formData.tokenAddress.toLowerCase();
          
          console.log('🔍 Checking import wrapper bridge:', {
            bridgeType: bridge.type,
            bridgeForeignTokenAddress: bridge.foreignTokenAddress,
            bridgeHomeTokenAddress: bridge.homeTokenAddress,
            formDataTokenAddress: formData.tokenAddress,
            matches
          });
          
          return matches;
        });
        
        if (importBridge) {
          console.log('✅ Found import wrapper bridge:', importBridge);
          setSelectedBridge(importBridge);
          return;
        }
      }

      // Check if this is a native 3DPass token (export case)
      if (['P3D', 'FIRE', 'WATER'].includes(tokenSymbol)) {
        // Look for export bridge for this token
        // For export bridges, the token address should match homeTokenAddress (3DPass side)
        const exportBridge = Object.values(allBridges).find(bridge => {
          const matches = bridge.type === 'export' && 
            bridge.homeTokenAddress?.toLowerCase() === formData.tokenAddress.toLowerCase();
          
          console.log('🔍 Checking export bridge:', {
            bridgeType: bridge.type,
            bridgeHomeTokenAddress: bridge.homeTokenAddress,
            bridgeForeignTokenAddress: bridge.foreignTokenAddress,
            formDataTokenAddress: formData.tokenAddress,
            matches
          });
          
          return matches;
        });
        
        if (exportBridge) {
          console.log('✅ Found export bridge:', exportBridge);
          setSelectedBridge(exportBridge);
          return;
        }
      }
    } 
           // For Ethereum network (export bridges for repatriation claims)
           else if (network?.id === NETWORKS.ETHEREUM.id) {
             console.log('🔍 Looking for export bridge for repatriation claim on Ethereum');
             
             // Look for export bridge for this token
             // For repatriation claims on Ethereum, we need an export bridge
             // The token address should match homeTokenAddress (Ethereum side)
             const exportBridge = Object.values(allBridges).find(bridge => {
               const matches = bridge.type === 'export' && 
                 bridge.homeTokenAddress?.toLowerCase() === formData.tokenAddress.toLowerCase();
               
               console.log('🔍 Checking export bridge for repatriation:', {
                 bridgeType: bridge.type,
                 bridgeHomeTokenAddress: bridge.homeTokenAddress,
                 bridgeForeignTokenAddress: bridge.foreignTokenAddress,
                 bridgeHomeNetwork: bridge.homeNetwork,
                 bridgeForeignNetwork: bridge.foreignNetwork,
                 formDataTokenAddress: formData.tokenAddress,
                 matches
               });
               
               return matches;
             });
             
             if (exportBridge) {
               console.log('✅ Found export bridge for repatriation:', exportBridge);
               setSelectedBridge(exportBridge);
               return;
             }
           }

    console.log('❌ No bridge found for token:', formData.tokenAddress, 'on network:', network?.name);
    setSelectedBridge(null);
  }, [formData.tokenAddress, getBridgeInstancesWithSettings, network?.id, network?.name, selectedTransfer]);

  // Load required stake with a specific amount
  const loadRequiredStakeWithAmount = useCallback(async (amount) => {
    if (!selectedBridge || !provider) return;

    try {
      console.log('🔍 Loading required stake with amount:', amount);
      console.log('🔍 Selected bridge:', selectedBridge);
      
      const bridgeContract = new ethers.Contract(
        selectedBridge.address,
        COUNTERSTAKE_ABI,
        provider
      );

      // Use the correct decimals for the amount from configuration
      const amountDecimals = getTokenDecimals(network?.id, formData.tokenAddress);
      const amountWei = ethers.utils.parseUnits(amount, amountDecimals);
      console.log('🔍 Amount parsing details:', {
        amount: amount,
        amountDecimals: amountDecimals,
        amountWei: amountWei.toString()
      });
      
      const stake = await bridgeContract.getRequiredStake(amountWei);
      console.log('🔍 Raw stake from contract:', stake.toString());
      
      // Get stake token decimals from configuration
      const stakeTokenDecimals = getStakeTokenDecimals(network?.id);
      
      console.log('🔍 Using stake token decimals from config:', stakeTokenDecimals);
      
      // The contract is inconsistent - sometimes returns 18 decimals, sometimes stake token decimals
      // We need to detect which format and handle both cases
      let formattedStake;
      
      // If the stake value is very large (18 decimals), convert from 18 to stake token decimals
      if (stake.gte(ethers.BigNumber.from(10).pow(15))) {
        // Contract returned stake in 18 decimals
        const stakeIn18Decimals = ethers.utils.formatUnits(stake, 18);
        const stakeInStakeTokenDecimals = ethers.utils.parseUnits(stakeIn18Decimals, stakeTokenDecimals);
        formattedStake = ethers.utils.formatUnits(stakeInStakeTokenDecimals, stakeTokenDecimals);
        console.log('🔍 Contract returned 18 decimals, converted to', stakeTokenDecimals, 'decimals');
      } else {
        // Contract returned stake in stake token decimals
        formattedStake = ethers.utils.formatUnits(stake, stakeTokenDecimals);
        console.log('🔍 Contract returned', stakeTokenDecimals, 'decimals');
      }
      
      console.log('🔍 Simple stake formatting:', {
        rawStake: stake.toString(),
        stakeTokenDecimals: stakeTokenDecimals,
        formattedStake: formattedStake
      });
      console.log('🔍 Final stake details:', {
        stakeTokenAddress: selectedBridge.stakeTokenAddress,
        stakeTokenSymbol: selectedBridge.stakeTokenSymbol,
        finalFormattedStake: formattedStake
      });
      
      setRequiredStake(formattedStake);
    } catch (error) {
      console.error('Error loading required stake:', error);
      setRequiredStake('0');
    }
  }, [selectedBridge, provider, formData.tokenAddress, network?.id]);


  // Check allowance
  const checkAllowance = useCallback(async () => {
    if (!selectedBridge || !formData.amount || !provider || !account) return;

    try {
      let currentAllowance;
      let stakeTokenDecimals;
      
      // For 3DPass network, use 3DPass token allowance
      if (network?.id === NETWORKS.THREEDPASS.id) {
        currentAllowance = await get3DPassTokenAllowance(
          provider,
          selectedBridge.stakeTokenAddress, // P3D token address
          account,
          selectedBridge.address
        );
        stakeTokenDecimals = getStakeTokenDecimals(network?.id);
      } else {
        // For other networks (like Ethereum), use standard ERC20 allowance
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, [
          'function allowance(address owner, address spender) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ], provider);
        
        const [allowanceWei, decimals] = await Promise.all([
          tokenContract.allowance(account, selectedBridge.address),
          tokenContract.decimals()
        ]);
        
        currentAllowance = ethers.utils.formatUnits(allowanceWei, decimals);
        stakeTokenDecimals = decimals;
      }

      // Parse the required stake with correct decimals
      const stakeWei = ethers.utils.parseUnits(requiredStake, stakeTokenDecimals);
      const allowanceWei = ethers.utils.parseUnits(currentAllowance, stakeTokenDecimals);
      
      console.log('🔍 Allowance check results:', {
        currentAllowance,
        requiredStake,
        allowanceWei: allowanceWei.toString(),
        stakeWei: stakeWei.toString(),
        needsApproval: allowanceWei.lt(stakeWei),
        allowanceComparison: `${allowanceWei.toString()} >= ${stakeWei.toString()} = ${allowanceWei.gte(stakeWei)}`
      });
      
      // Handle max allowance display
      if (allowanceWei.eq(getMaxAllowance())) {
        setAllowance('∞ (MAX)');
      } else {
        setAllowance(currentAllowance);
      }
      
      // Check if approval is needed based on max allowance preference
      let needsApprovalResult;
      if (useMaxAllowance) {
        needsApprovalResult = !allowanceWei.eq(getMaxAllowance());
      } else {
        needsApprovalResult = allowanceWei.lt(stakeWei);
      }
      
      console.log('🔍 Setting needsApproval to:', needsApprovalResult);
      setNeedsApproval(needsApprovalResult);
    } catch (error) {
      console.error('Error checking stake token allowance:', error);
      setAllowance('0');
      setNeedsApproval(true);
    }
  }, [selectedBridge, formData.amount, provider, account, requiredStake, network?.id, useMaxAllowance]);

  // Load available tokens
  useEffect(() => {
    if (isOpen && (network?.id === NETWORKS.THREEDPASS.id || network?.id === NETWORKS.ETHEREUM.id)) {
      loadAvailableTokens();
    }
  }, [isOpen, network, loadAvailableTokens]);

  // Load token metadata and balance when token address changes
  useEffect(() => {
    if (formData.tokenAddress && provider && account) {
      console.log('🔍 Token address changed, loading metadata and determining bridge:', {
        tokenAddress: formData.tokenAddress,
        availableTokensCount: availableTokens.length,
        availableTokens: availableTokens.map(t => ({ symbol: t.symbol, address: t.address }))
      });
      loadTokenMetadata();
      loadTokenBalance();
      determineBridge();
    }
  }, [formData.tokenAddress, provider, account, loadTokenMetadata, loadTokenBalance, determineBridge, availableTokens]);

  // Load required stake when bridge is determined (even without amount)
  useEffect(() => {
    if (selectedBridge && provider) {
      // Load stake with a default amount of 1 if no amount is set
      const amountToUse = formData.amount || '1';
      loadRequiredStakeWithAmount(amountToUse);
    }
  }, [selectedBridge, provider, loadRequiredStakeWithAmount, formData.amount]);

  // Load stake token balance when bridge is selected
  useEffect(() => {
    if (selectedBridge && provider && account) {
      loadStakeTokenBalance();
    }
  }, [selectedBridge, provider, account, loadStakeTokenBalance]);


  // Check allowance when bridge and amount change
  useEffect(() => {
    if (selectedBridge && formData.amount && provider && account) {
      checkAllowance();
    }
  }, [selectedBridge, formData.amount, provider, account, checkAllowance, isOpen]);

  // Check if this is a third-party claim
  useEffect(() => {
    const isThirdParty = checkThirdPartyClaim(account, formData.recipientAddress, formData.reward);
    setIsThirdPartyClaim(isThirdParty);
    
    if (isThirdParty) {
      console.log('🔍 Third-party claim detected:', {
        account: account,
        recipientAddress: formData.recipientAddress,
        reward: formData.reward,
        isThirdParty: isThirdParty
      });
    }
  }, [account, formData.recipientAddress, formData.reward]);

  // Auto-select token when selectedTransfer is provided and availableTokens are loaded
  useEffect(() => {
    if (selectedTransfer && availableTokens.length > 0 && formData.tokenAddress) {
      console.log('🔍 Auto-selecting token for transfer:', {
        transferForeignTokenAddress: selectedTransfer.foreignTokenAddress,
        transferHomeTokenAddress: selectedTransfer.homeTokenAddress,
        formTokenAddress: formData.tokenAddress,
        availableTokens: availableTokens.map(t => ({ symbol: t.symbol, address: t.address }))
      });
      
      // Find the matching token in availableTokens
      const matchingToken = availableTokens.find(token => 
        token.address.toLowerCase() === formData.tokenAddress.toLowerCase()
      );
      
      if (matchingToken) {
        console.log('✅ Found matching token for auto-selection:', matchingToken);
        // The token is already set in formData.tokenAddress, so the dropdown should show it as selected
        // We just need to trigger the token metadata loading
        loadTokenMetadata();
      } else {
        console.log('❌ No matching token found in availableTokens for address:', formData.tokenAddress);
        console.log('🔍 Available token addresses:', availableTokens.map(t => t.address.toLowerCase()));
        console.log('🔍 Looking for:', formData.tokenAddress.toLowerCase());
      }
    }
  }, [selectedTransfer, availableTokens, formData.tokenAddress, loadTokenMetadata]);

  // Handle form input changes
  const handleInputChange = (field, value) => {
    // Automatically checksum address fields
    let processedValue = value;
    if ((field === 'senderAddress' || field === 'recipientAddress') && value) {
      processedValue = toChecksumAddress(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [field]: processedValue
    }));
  };

  // Handle custom control toggle
  const handleCustomControlToggle = (field, enabled) => {
    setCustomControls(prev => ({
      ...prev,
      [field]: enabled
    }));
  };

  // Handle copy to clipboard
  const handleCopyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  // Handle revoke allowance
  const handleRevokeAllowance = async () => {
    setIsRevoking(true);
    
    try {
      console.log('🔄 Starting allowance revocation...');
      
      if (network?.id === NETWORKS.THREEDPASS.id) {
        // For 3DPass network, use 3DPass token approval with 0 amount
        await approve3DPassToken(
          signer,
          selectedBridge.stakeTokenAddress, // P3D token address for staking
          selectedBridge.address,           // Bridge contract address
          '0'                              // Revoke by setting to 0
        );
      } else {
        // For other networks (like Ethereum), use standard ERC20 approval with 0
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)'
        ], signer);
        
        const revokeTx = await tokenContract.approve(selectedBridge.address, 0, { 
          gasLimit: 100000 
        });
        
        console.log('⏳ Waiting for revocation transaction confirmation...');
        await revokeTx.wait();
        console.log('✅ Allowance revoked successfully');
      }
      
      toast.success('Allowance revoked successfully!');
      
      // Refresh allowance display
      await checkAllowance();
      
    } catch (error) {
      console.error('❌ Allowance revocation failed:', error);
      
      // Handle different types of errors gracefully
      let errorMessage = 'Allowance revocation failed';
      
      if (error.code === 4001 || error.message?.includes('User denied transaction') || error.message?.includes('user rejected transaction')) {
        errorMessage = 'Transaction cancelled';
      } else if (error.code === -32603 || error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction';
      } else if (error.message?.includes('gas')) {
        errorMessage = 'Transaction failed due to gas issues. Please try again.';
      } else if (error.message?.includes('revert')) {
        errorMessage = 'Transaction failed. Please check your inputs and try again.';
      } else if (error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else {
        errorMessage = `Allowance revocation failed: ${error.message}`;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsRevoking(false);
    }
  };

  // Handle approval
  const handleApproval = async () => {
    if (!signer || !selectedBridge || !formData.amount) return;

    setSubmitting(true);
    try {
      // Approve the stake token, not the claim token
      if (network?.id === NETWORKS.THREEDPASS.id) {
        // For 3DPass network, use 3DPass token approval
        const approvalAmount = useMaxAllowance ? getMaxAllowance() : requiredStake;
        await approve3DPassToken(
          signer,
          selectedBridge.stakeTokenAddress, // P3D token address for staking
          selectedBridge.address,           // Bridge contract address
          approvalAmount                    // P3D stake amount or max allowance
        );
      } else {
        // For other networks (like Ethereum), use standard ERC20 approval
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)'
        ], signer);
        
        const decimals = await tokenContract.decimals();
        const approvalAmount = useMaxAllowance ? getMaxAllowance() : ethers.utils.parseUnits(requiredStake, decimals);
        const approvalTx = await tokenContract.approve(selectedBridge.address, approvalAmount);
        console.log('🔍 Approval transaction sent:', approvalTx.hash);
        
        // Wait for the transaction to be mined
        await approvalTx.wait();
        console.log('✅ Approval transaction confirmed');
      }

      toast.success('Stake token approval successful!');
      
      // Check allowance immediately after transaction is confirmed
      console.log('🔍 Checking allowance after approval...');
      await checkAllowance();
    } catch (error) {
      console.error('Error approving stake token:', error);
      
      // Handle different types of errors gracefully
      let errorMessage = 'Stake token approval failed';
      
      if (error.code === 4001 || error.message?.includes('User denied transaction') || error.message?.includes('user rejected transaction')) {
        errorMessage = 'Transaction cancelled';
      } else if (error.code === -32603 || error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction';
      } else if (error.message?.includes('gas')) {
        errorMessage = 'Transaction failed due to gas issues. Please try again.';
      } else if (error.message?.includes('revert')) {
        errorMessage = 'Transaction failed. Please check your inputs and try again.';
      } else if (error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else {
        errorMessage = `Stake token approval failed: ${error.message}`;
      }
      
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

     // Handle claim submission
   const handleSubmit = async (e) => {
     e.preventDefault();
     
     if (!signer || !selectedBridge) {
       toast.error('Please connect wallet and select a valid token');
       return;
     }

    if (needsApproval) {
      toast.error('Please approve the bridge to spend your tokens first');
      return;
    }

    setSubmitting(true);
    try {
      console.log('🔍 Starting claim submission with data:', {
        bridgeAddress: selectedBridge.address,
        bridgeType: selectedBridge.type,
        formData: formData,
        tokenMetadata: tokenMetadata,
        requiredStake: requiredStake
      });

      const bridgeContract = new ethers.Contract(
        selectedBridge.address,
        COUNTERSTAKE_ABI,
        signer
      );

      const amountWei = ethers.utils.parseUnits(formData.amount, getTokenDecimals(network?.id, formData.tokenAddress));
      const rewardWei = ethers.utils.parseUnits(formData.reward || '0', getTokenDecimals(network?.id, formData.tokenAddress));
      
      // Keep amount as BigNumber for proper uint encoding
      const amountBigNumber = amountWei;
      // Reward should be passed as int, not hex string
      const rewardInt = rewardWei.toNumber();
      
      // Validate reward is within reasonable bounds
      if (rewardInt < 0) {
        throw new Error('Reward cannot be negative');
      }
      
      console.log('🔍 Reward validation:', {
        originalReward: formData.reward,
        rewardWei: rewardWei.toString(),
        rewardInt: rewardInt,
        isNegative: rewardInt < 0,
        isTooLarge: rewardInt > Number.MAX_SAFE_INTEGER
      });
      // txts should be passed as BigNumber for proper uint32 encoding
      const txtsBigNumber = ethers.BigNumber.from(parseInt(formData.txts) || await getReliableTimestamp());
      const stakeWei = ethers.utils.parseUnits(requiredStake, getStakeTokenDecimals(network?.id));

      const senderChecksummed = toChecksumAddress(formData.senderAddress);
      const recipientChecksummed = toChecksumAddress(formData.recipientAddress);

      console.log('🔍 Parsed values:', {
        amountWei: amountWei.toString(),
        amountBigNumber: amountBigNumber.toString(),
        rewardWei: rewardWei.toString(),
        rewardInt: rewardInt,
        txtsBigNumber: txtsBigNumber.toString(),
        stakeWei: stakeWei.toString(),
        txid: formData.txid,
        senderAddress: senderChecksummed,
        recipientAddress: recipientChecksummed,
        data: formData.data
      });

      // Validate that all required fields are present
      if (!formData.txid || formData.txid.trim() === '') {
        throw new Error('Transaction ID is required');
      }
      if (!senderChecksummed || senderChecksummed.trim() === '') {
        throw new Error('Sender address is required');
      }
      if (!recipientChecksummed || recipientChecksummed.trim() === '') {
        throw new Error('Recipient address is required');
      }
      if (!ethers.utils.isAddress(recipientChecksummed)) return;

      // Validate reward against transfer data if available
      if (selectedTransfer && selectedTransfer.reward) {
        const tokenDecimals = getTokenDecimals(network?.id, formData.tokenAddress);
        const transferRewardFormatted = typeof selectedTransfer.reward === 'string' ? 
          (selectedTransfer.reward.startsWith('0x') ? 
            ethers.utils.formatUnits(selectedTransfer.reward, tokenDecimals) : 
            selectedTransfer.reward) : 
          ethers.utils.formatUnits(selectedTransfer.reward, tokenDecimals);
        
        const currentRewardFormatted = formData.reward || '0';
        
        console.log('🔍 Validating reward against transfer data:', {
          transferReward: selectedTransfer.reward,
          transferRewardFormatted,
          currentReward: formData.reward,
          currentRewardFormatted,
          match: transferRewardFormatted === currentRewardFormatted
        });
        
        // Warn if reward doesn't match but don't block the transaction
        if (transferRewardFormatted !== currentRewardFormatted) {
          console.warn('⚠️ Reward amount differs from transfer data:', {
            transferReward: transferRewardFormatted,
            claimReward: currentRewardFormatted
          });
        }
      }

      // Keep txid in original format (hex string with 0x prefix as expected by bot)
      const txidString = formData.txid;
      
      // Validate txid format
      if (!txidString || txidString.trim() === '') {
        throw new Error('Transaction ID is required');
      }
      
      // Ensure txid is properly formatted
      let processedTxid = txidString.trim();
      if (!processedTxid.startsWith('0x')) {
        processedTxid = '0x' + processedTxid;
      }
      
      // Check if txid is a valid hex string
      if (!/^0x[0-9a-fA-F]+$/.test(processedTxid)) {
        throw new Error('Transaction ID must be a valid hexadecimal string');
      }
      
      // Check txid length (should be 66 characters for a 32-byte hash: 0x + 64 hex chars)
      if (processedTxid.length !== 66) {
        console.warn('⚠️ Transaction ID length is unusual:', {
          txid: processedTxid,
          length: processedTxid.length,
          expectedLength: 66
        });
      }
      
      console.log('🔍 Calling claim function with parameters:', [
        processedTxid,
        txtsBigNumber,
        amountBigNumber,
        rewardInt,
        stakeWei,
        senderChecksummed,
        recipientChecksummed,
        formData.data
      ]);
      
      console.log('🔍 Parameter details:', {
        originalTxid: formData.txid,
        processedTxid: processedTxid,
        txtsBigNumber: txtsBigNumber.toString(),
        amountWei: amountWei.toString(),
        amountBigNumber: amountBigNumber.toString(),
        rewardWei: rewardWei.toString(),
        rewardInt: rewardInt,
        stakeWei: stakeWei.toString(),
        senderAddress: formData.senderAddress,
        recipientAddress: formData.recipientAddress,
        data: formData.data,
        bridgeAddress: selectedBridge.address,
        stakeTokenAddress: selectedBridge.stakeTokenAddress
      });

      // Check if a claim already exists for this transfer
      try {
        console.log('🔍 Checking if claim already exists...');
        const lastClaimNum = await bridgeContract.last_claim_num();
        console.log('🔍 Last claim number:', lastClaimNum.toString());
        
        // Try to get ongoing claims
        const ongoingClaims = await bridgeContract.getOngoingClaimNums();
        console.log('🔍 Ongoing claims:', ongoingClaims.map(n => n.toString()));
        
        // Check if any ongoing claim matches our parameters
        for (const claimNum of ongoingClaims) {
          try {
            const claim = await bridgeContract.getClaim(claimNum);
            console.log(`🔍 Claim ${claimNum}:`, {
              txid: claim.txid,
              sender_address: claim.sender_address,
              recipient_address: claim.recipient_address,
              amount: claim.amount.toString(),
              txts: claim.txts.toString(),
              data: claim.data
            });
            
            // Check if this matches our transfer
            if (claim.txid === processedTxid && 
                claim.sender_address === senderChecksummed &&
                claim.recipient_address.toLowerCase() === recipientChecksummed.toLowerCase()) {
              console.log(`⚠️ Found existing claim ${claimNum} for this transfer!`);
              throw new Error(`This transfer has already been claimed (Claim #${claimNum})`);
            }
          } catch (claimError) {
            console.log(`🔍 Error getting claim ${claimNum}:`, claimError.message);
          }
        }
      } catch (checkError) {
        console.log('🔍 Error checking existing claims:', checkError.message);
      }

      // Pre-flight checks before gas estimation
      console.log('🔍 Pre-flight checks before claim transaction:');
      
      // Recalculate stake to ensure we have the correct value
      const amountWeiForStake = ethers.utils.parseUnits(formData.amount, getTokenDecimals(network?.id, formData.tokenAddress));
      const stake = await bridgeContract.getRequiredStake(amountWeiForStake);
      
      // Get stake token decimals from configuration
      const stakeTokenDecimals = getStakeTokenDecimals(network?.id);
      
      // The contract is inconsistent - sometimes returns 18 decimals, sometimes stake token decimals
      let formattedStake;
      if (stake.gte(ethers.BigNumber.from(10).pow(15))) {
        // Contract returned stake in 18 decimals
        const stakeIn18Decimals = ethers.utils.formatUnits(stake, 18);
        const stakeInStakeTokenDecimals = ethers.utils.parseUnits(stakeIn18Decimals, stakeTokenDecimals);
        formattedStake = ethers.utils.formatUnits(stakeInStakeTokenDecimals, stakeTokenDecimals);
      } else {
        // Contract returned stake in stake token decimals
        formattedStake = ethers.utils.formatUnits(stake, stakeTokenDecimals);
      }
      
      const stakeWeiForCheck = ethers.utils.parseUnits(formattedStake, stakeTokenDecimals);
      
      // Check USDT balance
      const usdtContract = new ethers.Contract(selectedBridge.stakeTokenAddress, [
        'function balanceOf(address owner) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ], provider);
      
      const [balance, allowance, decimals] = await Promise.all([
        usdtContract.balanceOf(account),
        usdtContract.allowance(account, selectedBridge.address),
        usdtContract.decimals()
      ]);
      
      const balanceFormatted = ethers.utils.formatUnits(balance, decimals);
      const allowanceFormatted = ethers.utils.formatUnits(allowance, decimals);
      const stakeFormatted = ethers.utils.formatUnits(stakeWeiForCheck, decimals);
      
      console.log('🔍 Pre-flight stake calculation:', {
        rawStake: stake.toString(),
        stakeTokenDecimals: stakeTokenDecimals,
        formattedStake: formattedStake,
        stakeWeiForCheck: stakeWeiForCheck.toString(),
        stakeFormatted: stakeFormatted
      });
      
      console.log('🔍 USDT Balance:', balanceFormatted);
      console.log('🔍 USDT Allowance:', allowanceFormatted);
      console.log('🔍 Required Stake:', stakeFormatted);
      console.log('🔍 Balance sufficient:', balance.gte(stakeWeiForCheck));
      console.log('🔍 Allowance sufficient:', allowance.gte(stakeWeiForCheck));
      
      if (balance.lt(stakeWeiForCheck)) {
        throw new Error(`Insufficient USDT balance. Required: ${stakeFormatted}, Available: ${balanceFormatted}`);
      }
      
      if (allowance.lt(stakeWeiForCheck)) {
        throw new Error(`Insufficient USDT allowance. Required: ${stakeFormatted}, Allowed: ${allowanceFormatted}`);
      }

      // Estimate gas for the transaction
      let gasLimit;
      try {
        const gasEstimate = await bridgeContract.estimateGas.claim(
          processedTxid,
          txtsBigNumber,
          amountBigNumber,
          rewardInt,
          stakeWeiForCheck,
          senderChecksummed,
          recipientChecksummed,
          formData.data
        );
        gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
        console.log('🔍 Gas estimate:', gasEstimate.toString(), 'Gas limit with buffer:', gasLimit.toString());
      } catch (gasError) {
        console.warn('Gas estimation failed, using default gas limit:', gasError);
        console.warn('Gas estimation error details:', {
          message: gasError.message,
          code: gasError.code,
          data: gasError.data
        });
        gasLimit = ethers.BigNumber.from('500000'); // Fallback to default
      }

      const claimTx = await bridgeContract.claim(
        processedTxid,
        txtsBigNumber,
        amountBigNumber,
        rewardInt,
        stakeWeiForCheck,
        senderChecksummed,
        recipientChecksummed,
        formData.data,
        { 
          value: 0, // No ETH value needed, USDT is transferred via transferFrom
          gasLimit: gasLimit
        }
      );

      console.log('🔍 Claim transaction submitted:', claimTx.hash);
      toast.success('Claim submitted! Waiting for confirmation...');
      
      const receipt = await claimTx.wait();
      console.log('🔍 Claim transaction confirmed:', receipt);
      toast.success(`Claim confirmed! Transaction: ${receipt.transactionHash}`);
      
      // Call the callback to refresh the claim list
      if (onClaimSubmitted) {
        onClaimSubmitted({
          claimTxHash: receipt.transactionHash,
          selectedTransfer: selectedTransfer,
          formData: formData
        });
      }
      
      onClose();
    } catch (error) {
      console.error('❌ Error submitting claim:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        data: error.data,
        transaction: error.transaction
      });
      
      // Handle different types of errors gracefully
      let errorMessage = 'Claim failed';
      const providerMessage = error.data?.message || error.message;
      
      if (error.code === 4001 || providerMessage?.includes('User denied transaction') || providerMessage?.includes('user rejected transaction')) {
        errorMessage = 'Transaction cancelled by user';
      } else if (providerMessage?.toLowerCase().includes('insufficient funds') || providerMessage?.toLowerCase().includes('insufficient balance')) {
        errorMessage = 'Insufficient ETH for gas fees. Please add ETH to your wallet.';
      } else if (error.code === -32603) {
        // Generic provider error; surface original message if any
        errorMessage = providerMessage ? `Provider error (-32603): ${providerMessage}` : 'Provider internal error (-32603). Please try again or reconnect your wallet.';
      } else if (providerMessage?.toLowerCase().includes('gas')) {
        errorMessage = 'Transaction failed due to gas issues. Please try again.';
      } else if (providerMessage?.includes('execution reverted') || providerMessage?.includes('revert')) {
        errorMessage = 'Transaction failed. Please check your inputs and try again.';
      } else if (providerMessage?.includes('Internal JSON-RPC error') || providerMessage?.toLowerCase().includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else {
        errorMessage = `Claim failed: ${providerMessage}`;
      }
      
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

       // Check if form is valid (for button state)
  const isFormValid = () => {
    if (!isConnected) return false;
    if (network?.id !== NETWORKS.THREEDPASS.id && network?.id !== NETWORKS.ETHEREUM.id) return false; // Support both 3DPass and Ethereum
    if (!formData.tokenAddress) return false;
    if (!formData.amount || parseFloat(formData.amount) <= 0) return false;
    if (!formData.txid) return false;
    if (!formData.senderAddress) return false;
    if (!ethers.utils.isAddress(formData.senderAddress)) return false;
    if (!formData.recipientAddress) return false;
    if (!ethers.utils.isAddress(formData.recipientAddress)) return false;
    if (!selectedBridge) return false;
    // Note: needsApproval check removed - button visibility is controlled separately
    
    // Check stake token balance instead of claim token balance
    // Skip balance check if still loading to prevent false negatives
    if (!isLoadingStakeBalance) {
      const stakeAmount = parseFloat(requiredStake);
      const stakeBalance = parseFloat(stakeTokenBalance); // Stake token balance for staking
      if (stakeAmount > stakeBalance) return false;
    }
    
    // For third-party claims, check if user has enough tokens to burn
    if (isThirdPartyClaim && formData.amount && formData.reward) {
      const claimAmount = parseFloat(formData.amount);
      const rewardAmount = parseFloat(formData.reward);
      const tokensToBurn = claimAmount - rewardAmount;
      const userTokenBalance = parseFloat(tokenBalance);
      
      if (tokensToBurn > userTokenBalance) return false;
    }
    
    return true;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-start justify-center p-2 sm:p-4 pt-8 sm:pt-16"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-dark-900 border border-secondary-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-6rem)] overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-secondary-800">
            <div className="flex items-center gap-3">
              <ExternalLink className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-white">
                {selectedTransfer ? 'Create Claim from Transfer' : 'Submit New Claim'}
              </h2>
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

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Token Selection */}
                <div className="card">
                  <div className="flex items-center gap-3 mb-4">
                    <Coins className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">Token to receive</h3>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-secondary-300 mb-2">
                      Select a token to finish your transfer with
                    </label>
                    <select
                      value={formData.tokenAddress}
                      onChange={(e) => handleInputChange('tokenAddress', e.target.value)}
                      className="input-field w-full"
                      disabled={!!selectedToken}
                    >
                      <option value="">Select a token</option>
                      {availableTokens.map((token) => {
                        const isSelected = token.address.toLowerCase() === formData.tokenAddress?.toLowerCase();
                        console.log('🔍 Token option:', {
                          tokenAddress: token.address,
                          formDataTokenAddress: formData.tokenAddress,
                          isSelected,
                          symbol: token.symbol
                        });
                        return (
                          <option key={token.address} value={token.address}>
                            {token.symbol} - {token.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Token Info */}
                  {tokenMetadata && (
                    <div className="bg-dark-800 border border-secondary-700 rounded-lg p-4 mt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-white">{tokenMetadata.symbol}</h3>
                          <p className="text-sm text-secondary-400">{tokenMetadata.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-secondary-400">Balance</p>
                          <p className="font-medium text-white">{tokenBalance}</p>
                        </div>
                      </div>
                      
                      {/* Stake Token Balance Display */}
                      {selectedBridge && (
                        <div className="mt-3 p-3 bg-dark-800 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-secondary-400">Stake Token Balance</p>
                              <p className="text-sm text-white">{selectedBridge.stakeTokenSymbol || 'stake'}</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-medium ${
                                !isLoadingStakeBalance && parseFloat(stakeTokenBalance) < parseFloat(requiredStake) 
                                  ? 'text-red-400' 
                                  : 'text-white'
                              }`}>
                                {isLoadingStakeBalance ? 'Loading...' : formatStakeTokenForDisplay(stakeTokenBalance, network?.id)}
                                {!isLoadingStakeBalance && parseFloat(stakeTokenBalance) < parseFloat(requiredStake) && (
                                  <span className="text-xs text-red-400 ml-1">
                                    (Insufficient)
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              {/* Bridge Info */}
              {selectedBridge && (
                <div className="card border-primary-700 bg-primary-900/20">
                  <div className="flex items-center gap-3 mb-4">
                    <Info className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">Selected Bridge</h3>
                    <span className="px-2 py-1 bg-primary-600 text-white text-xs rounded-full capitalize">
                      {selectedBridge.type.replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-secondary-400">Bridge Type</p>
                      <p className="font-medium text-white capitalize">{selectedBridge.type.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-secondary-400">Direction</p>
                      <p className="font-medium text-white">
                        {selectedBridge.type === 'export' ? '3DPass → External' : 'External → 3DPass'}
                      </p>
                    </div>
                    <div>
                      <p className="text-secondary-400">Bridge Contract</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white font-mono text-xs">
                          {selectedBridge.address.slice(0, 6)}...{selectedBridge.address.slice(-4)}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(selectedBridge.address, 'Bridge contract address')}
                          className="p-1 text-secondary-400 hover:text-white transition-colors"
                          title="Copy full address"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-secondary-400">Required Stake</p>
                      <p className="font-medium text-white">
                        {formatStakeTokenForDisplay(requiredStake, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'}
                        {formData.amount && (
                          <span className="text-xs text-secondary-400 ml-1">
                            (for {formData.amount} {tokenMetadata?.symbol})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {selectedBridge.description && (
                    <div className="mt-4 p-3 bg-dark-800 rounded-lg">
                      <p className="text-sm text-secondary-400">{selectedBridge.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Third-Party Claim Warning */}
              {isThirdPartyClaim && selectedBridge && (
                <div className="card border-primary-700 bg-primary-900/20">
                  <div className="flex items-center gap-3 mb-4">
                    <Info className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">Third-Party Claim</h3>
                    <span className="px-2 py-1 bg-warning-600 text-white text-xs rounded-full">
                      Token Burning Required
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-sm text-secondary-400">
                      You are about to claim on behalf of the sender to speed up the transfer and get rewarded.
                    </p>
                    
                    <div className="bg-dark-800 border border-secondary-700 rounded-lg p-3">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Claim Amount:</span>
                          <span className="font-medium text-white">{formData.amount} {tokenMetadata?.symbol}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Reward:</span>
                          <span className="font-medium text-white">{formData.reward} {tokenMetadata?.symbol}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Tokens to Burn:</span>
                          <span className="font-medium text-white">
                            {formData.amount && formData.reward ? 
                              (parseFloat(formData.amount) - parseFloat(formData.reward)).toFixed(6) : 
                              '0'
                            } {tokenMetadata?.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Your {tokenMetadata?.symbol} Balance:</span>
                          <span className={`font-medium ${
                            formData.amount && formData.reward && 
                            (parseFloat(formData.amount) - parseFloat(formData.reward)) > parseFloat(tokenBalance) 
                              ? 'text-red-400' 
                              : 'text-white'
                          }`}>
                            {tokenBalance} {tokenMetadata?.symbol}
                            {formData.amount && formData.reward && 
                             (parseFloat(formData.amount) - parseFloat(formData.reward)) > parseFloat(tokenBalance) && (
                              <span className="text-xs text-red-400 ml-1">
                                (Insufficient)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-xs text-secondary-400">
                      <strong>Note:</strong> The bridge will burn {formData.amount && formData.reward ? 
                        (parseFloat(formData.amount) - parseFloat(formData.reward)).toFixed(6) : 
                        '0'
                      } {tokenMetadata?.symbol} from your balance and mint the same amount to the recipient.
                    </p>
                  </div>
                </div>
              )}

              {/* Form Fields */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">Transaction Details</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTransactionDetails(!showTransactionDetails)}
                    className="flex items-center gap-2 px-3 py-1 text-sm text-secondary-400 hover:text-white transition-colors border border-secondary-600 rounded-lg hover:border-secondary-500"
                  >
                    {showTransactionDetails ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show Details
                      </>
                    )}
                  </button>
                </div>
                
                {showTransactionDetails && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-secondary-300">
                        Amount
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="custom-amount"
                          checked={customControls.amount}
                          onChange={(e) => handleCustomControlToggle('amount', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor="custom-amount" className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="any"
                      value={formData.amount}
                      onChange={(e) => handleInputChange('amount', e.target.value)}
                      disabled={!customControls.amount}
                      className={`input-field w-full ${
                        !customControls.amount ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''
                      }`}
                      placeholder="0.0"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-secondary-300">
                        Reward (optional)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="custom-reward"
                          checked={customControls.reward}
                          onChange={(e) => handleCustomControlToggle('reward', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor="custom-reward" className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="any"
                      value={formData.reward}
                      onChange={(e) => handleInputChange('reward', e.target.value)}
                      disabled={!customControls.reward}
                      className={`input-field w-full ${
                        !customControls.reward ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''
                      }`}
                      placeholder="0.0"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-secondary-300">
                      Transaction ID (from source network)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="custom-txid"
                        checked={customControls.txid}
                        onChange={(e) => handleCustomControlToggle('txid', e.target.checked)}
                        className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                      />
                      <label htmlFor="custom-txid" className="text-xs text-secondary-400">
                        Custom
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={formData.txid}
                    onChange={(e) => handleInputChange('txid', e.target.value)}
                    disabled={!customControls.txid}
                    className={`input-field w-full ${
                      !customControls.txid ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''
                    }`}
                    placeholder="0x..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-secondary-300">
                        Timestamp (reliable external Unix timestamp)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="custom-txts"
                          checked={customControls.txts}
                          onChange={(e) => handleCustomControlToggle('txts', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor="custom-txts" className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>
                    <input
                      type="number"
                      value={formData.txts}
                      onChange={(e) => handleInputChange('txts', e.target.value)}
                      disabled={!customControls.txts}
                      className={`input-field w-full ${
                        !customControls.txts ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''
                      }`}
                      placeholder="Reliable external Unix timestamp"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-secondary-300">
                        Additional data from transaction (optional)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="custom-data"
                          checked={customControls.data}
                          onChange={(e) => handleCustomControlToggle('data', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor="custom-data" className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={formData.data}
                      onChange={(e) => handleInputChange('data', e.target.value)}
                      disabled={!customControls.data}
                      className={`input-field w-full ${
                        !customControls.data ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''
                      }`}
                      placeholder="0x"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-secondary-300">
                      Sender Address
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="custom-sender"
                        checked={customControls.senderAddress}
                        onChange={(e) => handleCustomControlToggle('senderAddress', e.target.checked)}
                        className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                      />
                      <label htmlFor="custom-sender" className="text-xs text-secondary-400">
                        Custom
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={formData.senderAddress}
                    onChange={(e) => handleInputChange('senderAddress', e.target.value)}
                    disabled={!customControls.senderAddress}
                    className={`input-field w-full ${
                      !customControls.senderAddress ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''
                    }`}
                    placeholder="0x..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-secondary-300">
                      Recipient Address
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="custom-recipient"
                        checked={customControls.recipientAddress}
                        onChange={(e) => handleCustomControlToggle('recipientAddress', e.target.checked)}
                        className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                      />
                      <label htmlFor="custom-recipient" className="text-xs text-secondary-400">
                        Custom
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={formData.recipientAddress}
                    onChange={(e) => handleInputChange('recipientAddress', e.target.value)}
                    disabled={!customControls.recipientAddress}
                    className={`input-field w-full ${
                      !customControls.recipientAddress ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''
                    }`}
                  placeholder="0x..."
                />
              </div>
                  </div>
                )}
              </div>

              {/* Approval Section */}
              {needsApproval && selectedBridge && (
                <div className="card">
                  <div className="flex items-center gap-3 mb-4">
                    <AlertCircle className="w-5 h-5 text-warning-500" />
                    <h3 className="text-lg font-semibold text-white">{selectedBridge?.stakeTokenSymbol || 'Stake Token'} Approval Required</h3>
                  </div>
                  
                  <p className="text-sm text-secondary-400 mb-4">
                    The bridge needs permission to spend your {selectedBridge?.stakeTokenSymbol || 'stake'} tokens for staking.
                  </p>
                  
                  <div className="bg-warning-900/20 border border-warning-700 rounded-lg p-3 mb-4">
                    <p className="text-sm text-warning-200">
                      <strong>Required:</strong> {formatStakeTokenForDisplay(requiredStake, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'} for staking
                    </p>
                    <p className="text-sm text-warning-200">
                      <strong>Current allowance:</strong> {allowance === '∞ (MAX)' ? '∞ (MAX)' : formatStakeTokenForDisplay(allowance, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'}
                    </p>
                  </div>
                  
                  {/* Max Allowance Option */}
                  <div className="border-t border-warning-700 pt-3 mb-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useMaxAllowance}
                        onChange={(e) => setUseMaxAllowance(e.target.checked)}
                        className="w-4 h-4 text-warning-400 bg-warning-900 border-warning-600 rounded focus:ring-warning-500 focus:ring-2"
                      />
                      <div className="flex-1">
                        <span className="text-warning-300 text-sm font-medium">
                          Set maximum allowance (∞)
                        </span>
                        <p className="text-warning-400 text-xs mt-1">
                          Approve unlimited spending to avoid future approval transactions.
                        </p>
                      </div>
                    </label>
                  </div>
                  
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleApproval}
                      disabled={submitting || !isFormValid()}
                      className="btn-warning w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      {useMaxAllowance ? `Approve ∞ ${selectedBridge?.stakeTokenSymbol || 'Stake Token'}` : `Approve ${selectedBridge?.stakeTokenSymbol || 'Stake Token'} for Bridge`}
                    </button>
                    
                    {/* Revoke Allowance Button - Show if there's any existing allowance */}
                    {allowance !== '0' && allowance !== '∞ (MAX)' && (
                      <button
                        type="button"
                        onClick={handleRevokeAllowance}
                        disabled={isRevoking}
                        className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRevoking ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        Revoke Allowance
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Approved Section */}
              {!needsApproval && selectedBridge && (
                <div className="card">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle className="w-5 h-5 text-success-500" />
                    <h3 className="text-lg font-semibold text-white">{selectedBridge?.stakeTokenSymbol || 'Stake Token'} Approval Complete</h3>
                  </div>
                  
                  <p className="text-success-300 text-sm mb-4">
                    Bridge contract is now approved to spend your {selectedBridge?.stakeTokenSymbol || 'stake'} tokens for staking.
                  </p>
                  
                  <div className="bg-success-900/20 border border-success-700 rounded-lg p-3">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-success-300 text-sm">Current allowance:</span>
                        <span className="text-success-400 font-medium text-sm">
                          {allowance === '∞ (MAX)' ? '∞ (MAX)' : formatStakeTokenForDisplay(allowance, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-success-300 text-sm">Required for staking:</span>
                        <span className="text-success-400 font-medium text-sm">{formatStakeTokenForDisplay(requiredStake, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'}</span>
                      </div>
                      {allowance === '∞ (MAX)' && (
                        <div className="text-xs text-success-300 mt-2 p-2 bg-success-800/30 rounded border border-success-700">
                          ✅ Maximum allowance set - no future approvals needed for this token
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Revoke Allowance Button - Show if there's any allowance */}
                  {allowance !== '0' && allowance !== '∞ (MAX)' && (
                    <button
                      type="button"
                      onClick={handleRevokeAllowance}
                      disabled={isRevoking}
                      className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                      {isRevoking ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      Revoke Allowance
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                {/* Only show Submit button if no approval is needed */}
                {!needsApproval && (
                  <button
                    type="submit"
                    disabled={!isFormValid() || submitting}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        Submit Claim
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NewClaim;
