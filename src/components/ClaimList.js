import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { fetchClaimsFromAllNetworks } from '../utils/fetch-claims';
import { fetchLastTransfers } from '../utils/fetch-last-transfers';
import { aggregateClaimsAndTransfers } from '../utils/aggregate-claims-transfers';
import { 
  fetchClaimsWithFallback, 
  fetchTransfersWithFallback
  // testProviderWithRetry, // Available for future use
  // getProviderHealthWithRetry // Available for future use
} from '../utils/enhanced-fetch';
// Cache functionality is handled internally for performance
import { 
  Clock, 
  CheckCircle, 
  User,
  Users,
  Plus,
  Download,
  ArrowDown,
  AlertTriangle,
  Copy,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import NewClaim from './NewClaim';
import WithdrawClaim from './WithdrawClaim';
import Challenge from './Challenge';

// Helper functions for match/mismatch indicators
const getMatchStatus = (claim) => {
  if (!claim.parameterMismatches) {
    return { hasMismatches: false, mismatches: [] };
  }
  
  const mismatches = [];
  if (!claim.parameterMismatches.amountMatch) {
    const amountReason = claim.parameterMismatches.amountMatchReason;
    if (amountReason === 'different_values') {
      mismatches.push({ field: 'amount', reason: 'different values' });
    } else if (amountReason === 'format_mismatch_but_equal') {
      mismatches.push({ field: 'amount', reason: 'format mismatch' });
    } else if (amountReason === 'missing_amount') {
      mismatches.push({ field: 'amount', reason: 'missing amount' });
    } else if (amountReason === 'conversion_error') {
      mismatches.push({ field: 'amount', reason: 'conversion error' });
    } else {
      mismatches.push({ field: 'amount', reason: 'mismatch' });
    }
  }
  
  if (!claim.parameterMismatches.senderMatch) {
    const senderReason = claim.parameterMismatches.senderMatchReason;
    if (senderReason === 'mixed_checksum_format') {
      mismatches.push({ field: 'sender', reason: 'format mismatch' });
    } else if (senderReason === 'both_non_checksummed') {
      mismatches.push({ field: 'sender', reason: 'non-checksummed' });
    } else if (senderReason === 'checksummed_format_mismatch') {
      mismatches.push({ field: 'sender', reason: 'checksum mismatch' });
    } else if (senderReason === 'different_addresses') {
      mismatches.push({ field: 'sender', reason: 'different address' });
    } else {
      mismatches.push({ field: 'sender', reason: 'mismatch' });
    }
  }
  
  if (!claim.parameterMismatches.recipientMatch) {
    const recipientReason = claim.parameterMismatches.recipientMatchReason;
    if (recipientReason === 'mixed_checksum_format') {
      mismatches.push({ field: 'recipient', reason: 'format mismatch' });
    } else if (recipientReason === 'both_non_checksummed') {
      mismatches.push({ field: 'recipient', reason: 'non-checksummed' });
    } else if (recipientReason === 'checksummed_format_mismatch') {
      mismatches.push({ field: 'recipient', reason: 'checksum mismatch' });
    } else if (recipientReason === 'different_addresses') {
      mismatches.push({ field: 'recipient', reason: 'different address' });
    } else {
      mismatches.push({ field: 'recipient', reason: 'mismatch' });
    }
  }
  
  if (!claim.parameterMismatches.rewardValid) {
    const rewardReason = claim.parameterMismatches.rewardValidationReason;
    if (rewardReason === 'claim_reward_exceeds_transfer_reward') {
      mismatches.push({ field: 'reward', reason: 'exceeds transfer reward' });
    } else if (rewardReason === 'format_mismatch_but_equal') {
      mismatches.push({ field: 'reward', reason: 'format mismatch' });
    } else if (rewardReason === 'transfer_reward_missing') {
      mismatches.push({ field: 'reward', reason: 'transfer reward missing' });
    } else if (rewardReason === 'conversion_error') {
      mismatches.push({ field: 'reward', reason: 'conversion error' });
    } else {
      mismatches.push({ field: 'reward', reason: 'mismatch' });
    }
  }
  
  if (!claim.parameterMismatches.dataValid) {
    const dataReason = claim.parameterMismatches.dataValidationReason;
    if (dataReason === 'data_mismatch') {
      mismatches.push({ field: 'data', reason: 'data mismatch' });
    } else {
      mismatches.push({ field: 'data', reason: 'mismatch' });
    }
  }
  
  if (!claim.parameterMismatches.isValidFlow) {
    mismatches.push({ field: 'flow', reason: 'invalid flow' });
  }
  
  return { hasMismatches: mismatches.length > 0, mismatches };
};

const getFieldMatchStatus = (claim, field) => {
  const { mismatches } = getMatchStatus(claim);
  const fieldMismatch = mismatches.find(m => m.field === field);
  
  if (fieldMismatch) {
    return { isMatch: false, reason: fieldMismatch.reason };
  }
  
  // Check if txid matches (for txid field)
  if (field === 'txid') {
    return { isMatch: true, reason: null };
  }
  
  // Check if reward matches (for reward field)
  if (field === 'reward') {
    const rewardMismatch = mismatches.find(m => m.field === 'reward');
    if (rewardMismatch) {
      return { isMatch: false, reason: rewardMismatch.reason };
    }
    return { isMatch: true, reason: null };
  }
  
  // Check if data matches (for data field)
  if (field === 'data') {
    const dataMismatch = mismatches.find(m => m.field === 'data');
    if (dataMismatch) {
      return { isMatch: false, reason: dataMismatch.reason };
    }
    return { isMatch: true, reason: null };
  }
  
  return { isMatch: true, reason: null };
};

const ClaimList = () => {
  const { account, network, getNetworkWithSettings } = useWeb3();
  const { getBridgeInstancesWithSettings, getHistorySearchDepth, getClaimSearchDepth, get3DPassTokenDecimalsDisplayMultiplier } = useSettings();
  const [claims, setClaims] = useState([]);
  const [aggregatedData, setAggregatedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'my', 'suspicious', 'pending'
  const [retryStatus, setRetryStatus] = useState(null);
  const [currentBlock, setCurrentBlock] = useState(null);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  // Cache stats removed from UI - cache still works internally for performance

  // Network switching functions
  const getRequiredNetwork = useCallback((transfer) => {
    // For transfers, we need to determine which network the claim should be created on
    // Import transfers (NewRepatriation) create claims on the foreign network (Ethereum)
    // Export transfers (NewExpatriation) create claims on the home network (3DPass)
    
    console.log('🔍 getRequiredNetwork called with transfer:', {
      eventType: transfer.eventType,
      fromNetwork: transfer.fromNetwork,
      toNetwork: transfer.toNetwork,
      fullTransfer: transfer
    });
    
    console.log('🔍 Available networks:', Object.values(NETWORKS).map(n => ({
      name: n.name,
      id: n.id,
      symbol: n.symbol
    })));
    
    if (transfer.eventType === 'NewRepatriation') {
      // Import transfer: claim should be created on foreign network (Ethereum)
      const network = Object.values(NETWORKS).find(network => 
        network.name === transfer.toNetwork
      );
      console.log('🔍 NewRepatriation - looking for network:', transfer.toNetwork, 'found:', network?.name);
      return network;
    } else if (transfer.eventType === 'NewExpatriation') {
      // Export transfer: claim should be created on destination network (3DPass)
      const network = Object.values(NETWORKS).find(network => 
        network.name === transfer.toNetwork
      );
      console.log('🔍 NewExpatriation - looking for network:', transfer.toNetwork, 'found:', network?.name);
      return network;
    }
    
    console.log('🔍 No matching event type found');
    return null;
  }, []);

  const getRequiredNetworkForClaim = useCallback((claim) => {
    // For claims, we need to determine which network the claim exists on
    // This is the network where the bridge contract is deployed
    
    console.log('🔍 getRequiredNetworkForClaim called with claim:', {
      bridgeAddress: claim.bridgeAddress,
      networkName: claim.networkName,
      bridgeType: claim.bridgeType
    });
    
    // Find the network that contains this bridge address
    const networksWithSettings = getNetworkWithSettings ? Object.values(NETWORKS) : [];
    
    for (const networkConfig of networksWithSettings) {
      if (networkConfig && networkConfig.bridges) {
        for (const bridgeKey in networkConfig.bridges) {
          const bridge = networkConfig.bridges[bridgeKey];
          if (bridge.address === claim.bridgeAddress) {
            const result = {
              ...networkConfig,
              chainId: networkConfig.id,
              bridgeAddress: bridge.address
            };
            console.log('✅ Found required network for claim:', result);
            return result;
          }
        }
      }
    }
    
    console.log('❌ No required network found for claim:', claim.bridgeAddress);
    return null;
  }, [getNetworkWithSettings]);

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
      console.log('🔄 switchToRequiredNetwork called with:', requiredNetwork);
      console.log('🔄 Switching to network:', requiredNetwork.name, 'Chain ID:', requiredNetwork.chainId || requiredNetwork.id);
      
      // Check if wallet is available
      if (!window.ethereum) {
        console.error('❌ No wallet detected');
        return false;
      }
      
      // Use chainId if available, otherwise use id
      const chainId = requiredNetwork.chainId || requiredNetwork.id;
      if (!chainId) {
        console.error('❌ No chain ID found in network configuration');
        return false;
      }
      
      const chainIdHex = `0x${chainId.toString(16)}`;
      console.log('🔄 Chain ID hex:', chainIdHex);
      
      try {
        console.log('🔄 Attempting to switch to existing network...');
        const result = await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        console.log('🔄 Switch request result:', result);
        console.log('✅ Network switched successfully');
        return true;
      } catch (switchError) {
        console.log('⚠️ Network switch failed:', switchError);
        console.log('⚠️ Error code:', switchError.code);
        console.log('⚠️ Error message:', switchError.message);
        console.log('⚠️ Network not added, attempting to add it...');
        
        if (switchError.code === 4902) {
          try {
            console.log('🔄 Adding new network...');
            const addResult = await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainIdHex,
                chainName: requiredNetwork.name,
                nativeCurrency: requiredNetwork.nativeCurrency,
                rpcUrls: [requiredNetwork.rpcUrl],
                blockExplorerUrls: [requiredNetwork.explorer],
              }],
            });
            console.log('🔄 Add network result:', addResult);
            console.log('✅ Network added and switched successfully');
            return true;
          } catch (addError) {
            console.error('❌ Failed to add network:', addError);
            console.error('❌ Add error code:', addError.code);
            console.error('❌ Add error message:', addError.message);
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

  const handleChallenge = useCallback(async (claim) => {
    console.log('🔘 Challenge button clicked for claim:', claim.actualClaimNum || claim.claimNum);
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetworkForClaim(claim);
    if (!requiredNetwork) {
      toast.error('Could not determine required network for this claim');
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
    
    setSelectedClaim(claim);
    setShowChallengeModal(true);
  }, [getRequiredNetworkForClaim, checkNetwork, switchToRequiredNetwork]);




  // All useCallback hooks must be at the top level
  const formatAmount = useCallback((amount, decimals = 18, tokenAddress = null) => {
    try {
      console.log(`🔍 formatAmount input:`, {
        amount,
        type: typeof amount,
        hasToNumber: typeof amount?.toNumber === 'function',
        isBigNumber: amount?._isBigNumber,
        decimals
      });
      
      const ethers = require('ethers');
      let amountString;
      
      // Handle BigNumber objects
      if (typeof amount?.toNumber === 'function') {
        amountString = amount.toString();
        console.log(`🔍 formatAmount: converted BigNumber to string: ${amountString}`);
      } else if (typeof amount === 'string') {
        amountString = amount;
        console.log(`🔍 formatAmount: using string amount: ${amountString}`);
      } else if (typeof amount === 'number') {
        amountString = amount.toString();
        console.log(`🔍 formatAmount: converted number to string: ${amountString}`);
      } else if (!amount) {
        console.log(`🔍 formatAmount: null/undefined amount, returning 0.000000`);
        return '0.000000';
      } else {
        console.log(`🔍 formatAmount: unknown amount type, returning 0.000000`);
        return '0.000000';
      }
      
      // Check if the amount string is actually zero
      if (amountString === '0' || amountString === '0x0') {
        console.log(`🔍 formatAmount: amount is zero, returning 0.000000`);
        return '0.000000';
      }
      
      const rawValue = parseFloat(ethers.utils.formatUnits(amountString, decimals));
      console.log(`🔍 formatAmount: rawValue after formatUnits: ${rawValue}`);
      
      // Check if this is a P3D token and apply decimalsDisplayMultiplier
      if (tokenAddress) {
        const decimalsDisplayMultiplier = get3DPassTokenDecimalsDisplayMultiplier(tokenAddress);
        if (decimalsDisplayMultiplier) {
          // Apply the multiplier: 0.000001 * 1000000 = 1.0
          const multipliedNumber = rawValue * decimalsDisplayMultiplier;
          console.log(`🔍 P3D multiplier applied:`, {
            originalNumber: rawValue,
            multiplier: decimalsDisplayMultiplier,
            result: multipliedNumber
          });
          return multipliedNumber.toFixed(6).replace(/\.?0+$/, '') || '0';
        }
      }
      
      // Determine appropriate decimal places dynamically based on the value
      let decimalPlaces;
      
      if (rawValue === 0) {
        // For zero values, show minimal decimals
        decimalPlaces = 0;
      } else if (rawValue < 1e-15) {
        // For extremely small values, show up to 18 decimal places
        decimalPlaces = 18;
      } else if (rawValue < 0.000001) {
        // For very small values, show up to 15 decimal places
        decimalPlaces = 15;
      } else if (rawValue < 0.001) {
        // For small values, show up to 9 decimal places
        decimalPlaces = 9;
      } else if (rawValue < 1) {
        // For fractional values, show up to 6 decimal places
        decimalPlaces = 6;
      } else {
        // For larger values, show up to 4 decimal places
        decimalPlaces = 4;
      }
      
      let formatted = rawValue.toFixed(decimalPlaces);
      
      // Only trim trailing zeros if the value is not very small and not a whole number
      if (rawValue >= 1e-15 && rawValue % 1 !== 0) {
        formatted = formatted.replace(/\.?0+$/, '');
      }
      
      console.log(`🔍 formatAmount: formatted result: ${formatted}`);
      return formatted;
    } catch (error) {
      console.error('Error formatting amount:', amount, error);
      return '0.000000';
    }
  }, [get3DPassTokenDecimalsDisplayMultiplier]);

  const getTransferTokenSymbol = useCallback((claim) => {
    // First, try to use the token symbol from bridge settings (most accurate)
    if (claim.bridgeTokenSymbol) {
      return claim.bridgeTokenSymbol;
    }
    
    // Check if this is a pending transfer vs completed claim
    // Use the explicit status field we set
    const isPending = claim.status === 'pending';
    const isCompletedClaim = claim.status === 'completed';
    
    console.log('🔍 getTransferTokenSymbol debug:', {
      claimStatus: claim.status,
      eventType: claim.eventType,
      claimNum: claim.claimNum,
      isPending,
      isCompletedClaim,
      homeTokenSymbol: claim.homeTokenSymbol,
      foreignTokenSymbol: claim.foreignTokenSymbol,
      bridgeType: claim.bridgeType
    });
    
    if (isPending) {
      // For pending transfers, show the original asset (home token)
      const result = claim.homeTokenSymbol || 'Unknown';
      console.log('🔍 Using home token (pending):', result);
      return result;  // Show original token (USDT)
    } else if (isCompletedClaim) {
      // For completed claims, show the wrapped asset (foreign token)
      const result = claim.foreignTokenSymbol || 'Unknown';
      console.log('🔍 Using foreign token (completed):', result);
      return result;  // Show wrapped token (wUSDT)
    } else {
      // Fallback: if we can't determine the type, use the bridge type
      if (claim.bridgeType === 'export') {
        // For export bridges, show the home token (original asset)
        const result = claim.homeTokenSymbol || 'Unknown';
        console.log('🔍 Using home token (export fallback):', result);
        return result;
      } else {
        // For import bridges, show the foreign token (wrapped asset)
        const result = claim.foreignTokenSymbol || 'Unknown';
        console.log('🔍 Using foreign token (import fallback):', result);
        return result;
      }
    }
  }, []);

  const getTokenDecimals = useCallback((claim) => {
    // Get decimals from network configuration
    const tokenSymbol = getTransferTokenSymbol(claim);
    
    // For both import and export claims, the token being claimed is from the foreign network
    // Import: User claims tokens that were sent FROM foreign network TO current network
    // Export: User claims tokens that were sent FROM current network TO foreign network
    let targetNetworkSymbol = network?.symbol;
    
    if (claim.bridgeType === 'import' || claim.bridgeType === 'import_wrapper') {
      // For imports, token is from the foreign network
      // Try to get the foreign network from bridge instance or claim data
      targetNetworkSymbol = claim.bridgeInstance?.foreignNetwork || 
                           claim.foreignNetwork;
    } else if (claim.bridgeType === 'export') {
      // For exports, the token being claimed is from the foreign network
      // The user is claiming tokens that were sent TO the foreign network
      targetNetworkSymbol = claim.bridgeInstance?.foreignNetwork || 
                           claim.foreignNetwork;
    }
    
    // Debug logging with better error handling
    console.log(`🔍 Looking for ${tokenSymbol} decimals in ${targetNetworkSymbol || 'undefined'} network (bridgeType: ${claim.bridgeType})`, {
      tokenSymbol,
      targetNetworkSymbol,
      bridgeType: claim.bridgeType,
      currentNetwork: network?.symbol,
      bridgeInstance: claim.bridgeInstance,
      foreignNetwork: claim.foreignNetwork,
      homeNetwork: claim.homeNetwork,
      bridgeInstanceForeignNetwork: claim.bridgeInstance?.foreignNetwork,
      bridgeInstanceHomeNetwork: claim.bridgeInstance?.homeNetwork
    });
    
    // Try to get decimals from the target network first (only if targetNetworkSymbol is defined)
    if (targetNetworkSymbol) {
      const networkConfig = getNetworkWithSettings(targetNetworkSymbol);
      if (networkConfig && networkConfig.tokens) {
        const token = networkConfig.tokens[tokenSymbol];
        if (token && token.decimals) {
          console.log(`🔍 Found decimals for ${tokenSymbol} in ${targetNetworkSymbol} config:`, token.decimals);
          return token.decimals;
        }
      }
    }
    
    // If not found in target network or targetNetworkSymbol is undefined, search all networks
    if (targetNetworkSymbol) {
      console.log(`🔍 ${tokenSymbol} not found in ${targetNetworkSymbol}, searching all networks...`);
    } else {
      console.log(`🔍 Target network is undefined for ${tokenSymbol}, searching all networks...`);
    }
    
    // Try to get decimals from other networks as fallback
    for (const networkKey of Object.keys(NETWORKS)) {
      const network = NETWORKS[networkKey];
      if (network.tokens && network.tokens[tokenSymbol]) {
        const token = network.tokens[tokenSymbol];
        if (token && token.decimals) {
          console.log(`🔍 Found decimals for ${tokenSymbol} in ${networkKey} config:`, token.decimals);
          return token.decimals;
        }
      }
    }
    
    // If not found in any network config, use a reasonable default based on token symbol
    let defaultDecimals = 18;
    if (tokenSymbol === 'USDT' || tokenSymbol === 'USDC') {
      defaultDecimals = 6;
    } else if (tokenSymbol === 'P3D') {
      defaultDecimals = 18;
    }
    
    console.log(`🔍 No decimals found for ${tokenSymbol} in any network config, using default: ${defaultDecimals}`);
    return defaultDecimals;
  }, [network?.symbol, getTransferTokenSymbol, getNetworkWithSettings]);

  const getStakeTokenSymbol = useCallback((claim) => {
    // Stakes are always in the stake token
    // We need to get this from the bridge settings
    if (claim.bridgeInstance && claim.bridgeInstance.stakeTokenSymbol) {
      return claim.bridgeInstance.stakeTokenSymbol;
    }
    // Fallback to network configuration
    const networkConfig = getNetworkWithSettings(network?.symbol);
    if (networkConfig && networkConfig.stakeToken) {
      return networkConfig.stakeToken;
    }
    return 'Unknown';
  }, [network?.symbol, getNetworkWithSettings]);

  const getStakeTokenAddress = useCallback((claim) => {
    // Get stake token symbol first
    const stakeTokenSymbol = getStakeTokenSymbol(claim);
    
    // Try to get address from current network tokens first
    const networkConfig = getNetworkWithSettings(network?.symbol);
    if (networkConfig && networkConfig.tokens) {
      const token = networkConfig.tokens[stakeTokenSymbol];
      if (token && token.address) {
        return token.address;
      }
    }
    
    // Try to get address from other networks
    for (const networkKey of Object.keys(NETWORKS)) {
      const network = NETWORKS[networkKey];
      if (network.tokens && network.tokens[stakeTokenSymbol]) {
        const token = network.tokens[stakeTokenSymbol];
        if (token && token.address) {
          return token.address;
        }
      }
    }
    
    return null;
  }, [network?.symbol, getNetworkWithSettings, getStakeTokenSymbol]);

  const getStakeTokenDecimals = useCallback((claim) => {
    // Get stake token symbol first
    const stakeTokenSymbol = getStakeTokenSymbol(claim);
    
    // Try to get decimals from current network tokens first
    const networkConfig = getNetworkWithSettings(network?.symbol);
    if (networkConfig && networkConfig.tokens) {
      const token = networkConfig.tokens[stakeTokenSymbol];
      if (token && token.decimals) {
        console.log(`🔍 Found stake decimals for ${stakeTokenSymbol} in ${network?.symbol} config:`, token.decimals);
        return token.decimals;
      }
    }
    
    // Try to get decimals from other networks
    for (const networkKey of Object.keys(NETWORKS)) {
      const network = NETWORKS[networkKey];
      if (network.tokens && network.tokens[stakeTokenSymbol]) {
        const token = network.tokens[stakeTokenSymbol];
        if (token && token.decimals) {
          console.log(`🔍 Found stake decimals for ${stakeTokenSymbol} in ${networkKey} config:`, token.decimals);
          return token.decimals;
        }
      }
    }
    
    // If not found in any network config, use a reasonable default
    console.log(`🔍 No decimals found for ${stakeTokenSymbol} in any network config, using default: 18`);
    return 18;
  }, [network?.symbol, getNetworkWithSettings, getStakeTokenSymbol]);

  // Helper function to check if a claim can be withdrawn
  const canWithdrawClaim = useCallback((claim) => {
    // Check if claim is not already withdrawn
    if (claim.withdrawn) {
      return false;
    }
    
    // Check if the outcome is YES (only YES outcomes can be withdrawn)
    if (claim.currentOutcome !== 1) {
      return false;
    }
    
    // Check if current user is the recipient (the person who will receive the funds)
    if (!account || !claim.recipientAddress) {
      return false;
    }
    
    // Check if the claim is expired (only expired claims can be withdrawn)
    if (!currentBlock) {
      return false; // Can't determine expiration without current block
    }
    
    const now = currentBlock.timestamp;
    const expiryTime = claim.expiryTs ? 
      (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
      0;
    
    // Claim must be expired (expiryTime <= now)
    if (expiryTime > now) {
      return false;
    }
    
    // Check if this is a third-party claim (claimant_address differs from recipient_address)
    const isThirdPartyClaim = claim.claimant_address && 
                             claim.claimant_address.toLowerCase() !== claim.recipientAddress.toLowerCase();
    
    if (isThirdPartyClaim) {
      // For third-party claims, the claimant (assistant) can withdraw
      return account.toLowerCase() === claim.claimant_address.toLowerCase();
    } else {
      // For regular claims, the recipient can withdraw
      return account.toLowerCase() === claim.recipientAddress.toLowerCase();
    }
  }, [account, currentBlock]);

  // Helper function to check if current user is the recipient
  const isCurrentUserRecipient = useCallback((claim) => {
    if (!account || !claim.recipientAddress) {
      return false;
    }
    
    return account.toLowerCase() === claim.recipientAddress.toLowerCase();
  }, [account]);

  // Helper function to check if this is a third-party claim
  const isThirdPartyClaim = useCallback((claim) => {
    return claim.claimant_address && 
           claim.claimant_address.toLowerCase() !== claim.recipientAddress.toLowerCase();
  }, []);

  // Helper function to check if a claim can be challenged
  const canChallengeClaim = useCallback((claim) => {
    // Check if claim is not finished
    if (claim.finished) {
      return false;
    }
    
    // Check if challenging period hasn't expired
    if (!currentBlock) {
      return false; // Can't determine expiration without current block
    }
    
    const now = currentBlock.timestamp;
    const expiryTime = claim.expiryTs ? 
      (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
      0;
    
    // Claim must not be expired (expiryTime > now)
    if (expiryTime <= now) {
      return false;
    }
    
    return true;
  }, [currentBlock]);



  // Helper function to prepare claim data for withdraw modal
  const prepareClaimForWithdraw = useCallback((claim) => {
    const decimals = getTokenDecimals(claim);
    const stakeDecimals = getStakeTokenDecimals(claim);
    const totalStake = claim.yesStake && claim.noStake ? 
      claim.yesStake.add(claim.noStake) : 
      (claim.yesStake || claim.noStake || 0);

    return {
      ...claim,
      formattedAmount: formatAmount(claim.amount, decimals),
      tokenSymbol: getTransferTokenSymbol(claim),
      formattedStake: formatAmount(totalStake, stakeDecimals),
      stakeTokenSymbol: getStakeTokenSymbol(claim)
    };
  }, [getTokenDecimals, getStakeTokenDecimals, getTransferTokenSymbol, getStakeTokenSymbol, formatAmount]);

  const handleWithdraw = useCallback(async (claim) => {
    console.log('🔘 Withdraw button clicked for claim:', claim.actualClaimNum || claim.claimNum);
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetworkForClaim(claim);
    if (!requiredNetwork) {
      toast.error('Could not determine required network for this claim');
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
    
    setSelectedClaim(prepareClaimForWithdraw(claim));
    setShowWithdrawModal(true);
  }, [getRequiredNetworkForClaim, checkNetwork, switchToRequiredNetwork, prepareClaimForWithdraw]);

  // Cache statistics removed from UI - cache still works internally

  // Load claims and transfers from all networks with fraud detection
  const loadClaimsAndTransfers = useCallback(async () => {
    // No connection check needed - we can load all data without wallet connection
        console.log('🔍 loadClaimsAndTransfers: Loading claims and transfers from all networks (no wallet connection required)');
        console.log('🔍 Current filter:', filter);
        console.log('🔍 Current account:', account);

    // Only show loading spinner on initial load
    if (isInitialLoad) {
      setLoading(true);
    }
    
    // Search depth settings are handled internally by the retry mechanism
    
    try {
      // Fetch claims from all networks with enhanced retry and fallback
      console.log('🔍 Fetching claims from all networks with enhanced retry...');
      const allClaims = await fetchClaimsWithFallback(
        () => fetchClaimsFromAllNetworks({
          getNetworkWithSettings,
          getBridgeInstancesWithSettings,
          filter,
          account,
          claimSearchDepth: getClaimSearchDepth(),
          getTransferTokenSymbol,
          getTokenDecimals
        }),
        getHistorySearchDepth,
        getClaimSearchDepth,
        {
          maxRetries: 3,
          baseDelay: 1000,
          enableSearchDepthAwareRetry: true,
          onRetryStatus: (status) => {
            setRetryStatus({ ...status, type: 'claims' });
          }
        }
      );

      // Fetch transfers from all networks with enhanced retry and fallback
      const historySearchDepth = getHistorySearchDepth();
      console.log(`🔍 Fetching transfers from all networks for ${historySearchDepth}h history with enhanced retry...`);
      const allTransfers = await fetchTransfersWithFallback(
        () => fetchLastTransfers({
          getNetworkWithSettings,
          getBridgeInstancesWithSettings,
          timeframeHours: historySearchDepth
        }),
        getHistorySearchDepth,
        getClaimSearchDepth,
        {
          maxRetries: 3,
          baseDelay: 1000,
          enableSearchDepthAwareRetry: true,
          onRetryStatus: (status) => {
            setRetryStatus({ ...status, type: 'transfers' });
          }
        }
      );

      console.log(`🔍 Raw transfers fetched:`, {
        totalTransfers: allTransfers.length,
        transfers: allTransfers.map(t => ({
          eventType: t.eventType,
          senderAddress: t.senderAddress,
          recipientAddress: t.recipientAddress,
          amount: t.amount?.toString(),
          transactionHash: t.transactionHash,
          blockNumber: t.blockNumber,
          bridgeAddress: t.bridgeAddress,
          networkKey: t.networkKey,
          bridgeType: t.bridgeType,
          direction: t.direction,
          fromNetwork: t.fromNetwork,
          toNetwork: t.toNetwork
        }))
      });

      // Log the full transfer object for the first transfer
      if (allTransfers.length > 0) {
        console.log(`🔍 Full first transfer object:`, allTransfers[0]);
      }

      // Aggregate claims and transfers with fraud detection
      console.log('🔍 Aggregating claims and transfers with fraud detection...');
      console.log('🔍 About to call aggregateClaimsAndTransfers with:', {
        claimsCount: allClaims.length,
        transfersCount: allTransfers.length,
        firstTransfer: allTransfers[0] ? {
          eventType: allTransfers[0].eventType,
          transactionHash: allTransfers[0].transactionHash,
          senderAddress: allTransfers[0].senderAddress
        } : null
      });
      
      let aggregated;
      try {
        aggregated = aggregateClaimsAndTransfers(allClaims, allTransfers);
        console.log('🔍 Aggregation completed successfully');
      } catch (error) {
        console.error('🔍 Error in aggregation:', error);
        // Create a fallback aggregated object
        aggregated = {
          completedTransfers: [],
          suspiciousClaims: [],
          pendingTransfers: allTransfers.map(t => ({ ...t, status: 'pending' })),
          fraudDetected: false,
          stats: {
            totalClaims: allClaims.length,
            totalTransfers: allTransfers.length,
            completedTransfers: 0,
            suspiciousClaims: 0,
            pendingTransfers: allTransfers.length
          }
        };
      }
      
      console.log('🔍 Aggregation completed, result:', {
        hasResult: !!aggregated,
        completedTransfers: aggregated?.completedTransfers?.length || 0,
        pendingTransfers: aggregated?.pendingTransfers?.length || 0,
        suspiciousClaims: aggregated?.suspiciousClaims?.length || 0
      });

      console.log('🔍 Aggregated data:', {
        completedTransfers: aggregated.completedTransfers.length,
        suspiciousClaims: aggregated.suspiciousClaims.length,
        pendingTransfers: aggregated.pendingTransfers.length,
        fraudDetected: aggregated.fraudDetected
      });

      console.log('🔍 History search depth setting:', {
        historySearchDepth,
        historySearchDepthType: typeof historySearchDepth
      });
      
      // Debug: Show details of all aggregated data
      console.log('🔍 Aggregated data breakdown:', {
        completedTransfers: aggregated.completedTransfers.length,
        suspiciousClaims: aggregated.suspiciousClaims.length,
        pendingTransfers: aggregated.pendingTransfers.length,
        fraudDetected: aggregated.fraudDetected
      });

      // Debug: Show details of pending transfers
      if (aggregated.pendingTransfers.length > 0) {
        console.log('🔍 Pending transfers details (BEFORE time filtering):', aggregated.pendingTransfers.map(t => ({
          eventType: t.eventType,
          senderAddress: t.senderAddress,
          recipientAddress: t.recipientAddress,
          amount: t.amount?.toString(),
          transactionHash: t.transactionHash,
          blockNumber: t.blockNumber,
          timestamp: t.timestamp,
          timestampDate: t.timestamp ? new Date(t.timestamp * 1000).toISOString() : 'No timestamp',
          status: t.status,
          bridgeAddress: t.bridgeAddress,
          networkKey: t.networkKey
        })));
      } else {
        console.log('🔍 No pending transfers found');
      }

      // Debug: Show details of completed transfers
      if (aggregated.completedTransfers.length > 0) {
        console.log('🔍 Completed transfers details:', aggregated.completedTransfers.map(t => ({
          eventType: t.eventType,
          senderAddress: t.senderAddress,
          recipientAddress: t.recipientAddress,
          amount: t.amount?.toString(),
          transactionHash: t.transactionHash,
          blockNumber: t.blockNumber,
          status: t.status,
          bridgeAddress: t.bridgeAddress,
          networkKey: t.networkKey
        })));
      } else {
        console.log('🔍 No completed transfers found');
      }

      // Apply time window filtering based on History Search Depth to the aggregated result
      try {
        const cutoffTs = Math.floor(Date.now() / 1000) - Math.floor(historySearchDepth * 3600);
        const withinWindow = (ts) => typeof ts === 'number' && ts >= cutoffTs;

        console.log('🔍 Time filtering debug:', {
          currentTime: Math.floor(Date.now() / 1000),
          historySearchDepth,
          cutoffTs,
          cutoffDate: new Date(cutoffTs * 1000).toISOString()
        });

        const filteredCompleted = (aggregated.completedTransfers || []).filter((ct) => {
          // Prefer transfer timestamp when available
          if (ct.transfer?.timestamp) {
            const result = withinWindow(ct.transfer.timestamp);
            console.log(`🔍 Completed transfer ${ct.transfer.transactionHash} timestamp check:`, {
              timestamp: ct.transfer.timestamp,
              timestampDate: new Date(ct.transfer.timestamp * 1000).toISOString(),
              cutoffTs,
              cutoffDate: new Date(cutoffTs * 1000).toISOString(),
              withinWindow: result
            });
            return result;
          }
          // Fallbacks: blockTimestamp on claim if present
          if (ct.blockTimestamp) return withinWindow(ct.blockTimestamp);
          // As a last resort, use expiryTs if available (approximation)
          if (ct.expiryTs) {
            const exp = typeof ct.expiryTs.toNumber === 'function' ? ct.expiryTs.toNumber() : ct.expiryTs;
            return withinWindow(exp);
          }
          return false;
        });

        const filteredPending = (aggregated.pendingTransfers || []).filter((pt) => {
          const result = withinWindow(pt.timestamp);
          console.log(`🔍 Pending transfer ${pt.transactionHash} timestamp check:`, {
            timestamp: pt.timestamp,
            timestampDate: new Date(pt.timestamp * 1000).toISOString(),
            cutoffTs,
            cutoffDate: new Date(cutoffTs * 1000).toISOString(),
            withinWindow: result
          });
          return result;
        });

        const filteredSuspicious = (aggregated.suspiciousClaims || []).filter((sc) => {
          // If we have a timestamp-like field, use it
          if (sc.blockTimestamp) return withinWindow(sc.blockTimestamp);
          // No timestamp: approximate using expiryTs if present; otherwise exclude
          if (sc.expiryTs) {
            const exp = typeof sc.expiryTs.toNumber === 'function' ? sc.expiryTs.toNumber() : sc.expiryTs;
            return withinWindow(exp);
          }
          return false;
        });

        const filteredAggregated = {
          ...aggregated,
          completedTransfers: filteredCompleted,
          pendingTransfers: filteredPending,
          suspiciousClaims: filteredSuspicious,
          stats: {
            ...aggregated.stats,
            completedTransfers: filteredCompleted.length,
            pendingTransfers: filteredPending.length,
            suspiciousClaims: filteredSuspicious.length,
          },
        };

        console.log('🔍 Time-filtered aggregation:', {
          cutoffTs,
          historySearchDepth,
          completedTransfers: filteredAggregated.completedTransfers.length,
          pendingTransfers: filteredAggregated.pendingTransfers.length,
          suspiciousClaims: filteredAggregated.suspiciousClaims.length,
        });

        // Set the aggregated data
        setAggregatedData(filteredAggregated);
      } catch (filterErr) {
        console.warn('⚠️ Failed to apply time filtering to aggregated data, using unfiltered results:', filterErr);
        setAggregatedData(aggregated);
      }
      setClaims(allClaims);

      // Set current block from the first available network for timestamp calculations
      if (!currentBlock && allClaims.length > 0) {
        try {
          const firstNetworkKey = allClaims[0].networkKey;
          const networkConfig = getNetworkWithSettings(firstNetworkKey);
          if (networkConfig?.rpcUrl) {
            const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
            const block = await networkProvider.getBlock('latest');
            setCurrentBlock(block);
            console.log(`🔍 Set current block from ${firstNetworkKey}:`, block.number);
              }
            } catch (error) {
          console.log(`🔍 Could not get block for timestamp calculations:`, error.message);
        }
      }

      console.log(`✅ FINAL RESULT: Loaded ${allClaims.length} claims and ${allTransfers.length} transfers`);
      console.log(`✅ Aggregation results:`, {
        completedTransfers: aggregated.stats.completedTransfers,
        suspiciousClaims: aggregated.stats.suspiciousClaims,
        pendingTransfers: aggregated.stats.pendingTransfers,
        fraudDetected: aggregated.fraudDetected
      });

      // Clear retry status on success
      setRetryStatus(null);

      // Cache statistics removed from UI - cache still works internally

    } catch (error) {
      console.error('Error loading claims and transfers from all networks:', error);
      
      // Enhanced error handling with retry and search depth information
      if (error.message?.includes('Search depth limit too restrictive')) {
        toast.error(`Search depth too restrictive: ${error.message}. Please increase search depth in settings.`);
      } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        toast.error(`Rate limit exceeded. Retrying with fallback providers...`);
      } else if (error.message?.includes('Circuit breaker is OPEN')) {
        toast.error(`Provider temporarily unavailable. Using fallback providers...`);
      } else if (error.message?.includes('All providers failed')) {
        toast.error(`All RPC providers failed. Please check your network connection and RPC settings.`);
      } else {
        toast.error(`Failed to load data: ${error.message}`);
      }
    } finally {
      setLoading(false);
      // Mark that initial load is complete
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [account, currentBlock, getNetworkWithSettings, getBridgeInstancesWithSettings, filter, getTransferTokenSymbol, getTokenDecimals, getHistorySearchDepth, getClaimSearchDepth, isInitialLoad]);



  // Load claims and transfers on mount and when dependencies change
  useEffect(() => {
    // Always load data - no wallet connection required
    loadClaimsAndTransfers();
  }, [loadClaimsAndTransfers, filter]);

  // Auto-refresh every 6 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      loadClaimsAndTransfers();
    }, 360000);

    return () => clearInterval(interval);
  }, [loadClaimsAndTransfers]);

  // No wallet connection required to view claims
  // Wallet connection is only needed for actions like withdraw/challenge

  const getClaimStatus = (claim) => {
    if (!currentBlock) return 'unknown';
    
    const now = currentBlock.timestamp;
    // Handle both BigNumber and regular number types for expiryTs
    const expiryTime = claim.expiryTs ? 
      (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
      0;
    
    if (claim.finished) {
      return claim.withdrawn ? 'withdrawn' : 'finished';
    }
    
    if (now > expiryTime) {
      return 'expired';
    }
    
    return 'active';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <Clock className="w-5 h-5 text-warning-500" />;
      case 'finished':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'withdrawn':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'expired':
        return <ArrowDown className="w-5 h-5 text-warning-500" />;
      default:
        return <Clock className="w-5 h-5 text-secondary-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'finished':
        return 'Finished';
      case 'withdrawn':
        return 'Withdrawn';
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'text-warning-500';
      case 'finished':
        return 'text-success-500';
      case 'withdrawn':
        return 'text-success-500';
      case 'expired':
        return 'text-warning-500';
      default:
        return 'text-secondary-400';
    }
  };

  const formatAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getTimeRemaining = (expiryTs) => {
    if (!currentBlock) return '';
    
    const now = currentBlock.timestamp;
    // Handle both BigNumber and regular number types for expiry_ts
    const expiryTime = expiryTs ? 
      (typeof expiryTs.toNumber === 'function' ? expiryTs.toNumber() : expiryTs) : 
      0;
    const timeRemaining = expiryTime - now;
    
    if (timeRemaining <= 0) {
      return 'Expired';
    }
    
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  const getOutcomeText = (outcome) => {
    return outcome === 0 ? 'NO' : 'YES';
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {/* Filter Toggle */}
          <div className="flex bg-dark-800 rounded-lg p-1">
            <button
              onClick={() => setFilter('all')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <Users className="w-4 h-4" />
              All
            </button>
            <button
              onClick={() => setFilter('my')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'my'
                  ? 'bg-primary-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <User className="w-4 h-4" />
              My Claims
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'pending'
                  ? 'bg-yellow-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              Pending
            </button>
            <button
              onClick={() => setFilter('suspicious')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'suspicious'
                  ? 'bg-red-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Suspect
            </button>
            
          </div>
          
          
        </div>
      </div>

      {/* Retry Status - Only show when actively retrying */}
      {retryStatus && (
        <div className="mb-4 p-3 bg-dark-800 rounded-lg border border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-secondary-400">Retry Status:</span>
              <span className="text-yellow-400">
                {retryStatus.type} - Attempt {retryStatus.attempt}/{retryStatus.maxAttempts}
              </span>
              {retryStatus.delay && (
                <span className="text-secondary-400">
                  (Next retry in {Math.round(retryStatus.delay / 1000)}s)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-yellow-400">Retrying...</span>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-secondary-400">Discovering transfers for the last {getHistorySearchDepth()} hours...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && (!aggregatedData || (aggregatedData.completedTransfers.length === 0 && aggregatedData.suspiciousClaims.length === 0 && aggregatedData.pendingTransfers.length === 0)) && (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <Clock className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              {filter === 'suspicious' ? 'No Suspicious Claims Found' :
               filter === 'pending' ? 'No Pending Transfers Found' :
               'No Claims Found'}
            </h3>
            <p className="text-secondary-400">
              {filter === 'my' 
                ? (account ? 'You don\'t have any claims across all networks' : 'Connect your wallet to see your claims')
                : filter === 'suspicious'
                ? 'No suspicious claims detected across all networks'
                : filter === 'pending'
                ? 'No pending transfers found across all networks'
                : 'No claims found across all networks'
              }
            </p>
            {!account && (
              <p className="text-xs text-secondary-500 mt-2">
                💡 You can view all claims and transfers without connecting your wallet. Connect only when you need to interact with them.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Claims List */}
      <AnimatePresence>
        {(() => {
          // Get the appropriate data based on filter
          let displayData = [];
          if (aggregatedData) {
            switch (filter) {
              case 'all':
                displayData = [...aggregatedData.completedTransfers, ...aggregatedData.suspiciousClaims, ...aggregatedData.pendingTransfers];
                break;
              case 'my':
                if (account) {
                  displayData = [...aggregatedData.completedTransfers, ...aggregatedData.suspiciousClaims, ...aggregatedData.pendingTransfers]
                    .filter(item => item.recipientAddress && item.recipientAddress.toLowerCase() === account.toLowerCase());
                } else {
                  displayData = [...aggregatedData.completedTransfers, ...aggregatedData.suspiciousClaims, ...aggregatedData.pendingTransfers];
                }
                break;
              case 'suspicious':
                displayData = aggregatedData.suspiciousClaims;
                break;
              case 'pending':
                displayData = aggregatedData.pendingTransfers;
                break;
              default:
                displayData = [...aggregatedData.completedTransfers, ...aggregatedData.suspiciousClaims];
            }
          } else {
            displayData = claims; // Fallback to original claims
          }

          // Sort displayData by most recent first (by block number, then by timestamp)
          displayData.sort((a, b) => {
            // First, try to sort by block number (most recent first)
            if (a.blockNumber && b.blockNumber) {
              const blockDiff = b.blockNumber - a.blockNumber;
              if (blockDiff !== 0) return blockDiff;
            }
            
            // If block numbers are the same or missing, sort by timestamp (most recent first)
            const timestampA = a.timestamp || a.blockTimestamp || 0;
            const timestampB = b.timestamp || b.blockTimestamp || 0;
            return timestampB - timestampA;
          });

          console.log(`🔍 Display data breakdown:`, {
            filter: filter,
            hasAggregatedData: !!aggregatedData,
            totalDisplayItems: displayData.length,
            completedTransfers: aggregatedData?.completedTransfers?.length || 0,
            suspiciousClaims: aggregatedData?.suspiciousClaims?.length || 0,
            pendingTransfers: aggregatedData?.pendingTransfers?.length || 0,
            fallbackClaims: claims.length
          });

          // Check for withdrawn claims in display data
          const withdrawnInDisplay = displayData.filter(item => item.withdrawn === true);
          console.log(`💰 WITHDRAWN CLAIMS IN DISPLAY (${withdrawnInDisplay.length}):`, withdrawnInDisplay.map(item => ({
            claimNum: item.claimNum || item.actualClaimNum,
            withdrawn: item.withdrawn,
            finished: item.finished,
            currentOutcome: item.currentOutcome,
            amount: item.amount?.toString(),
            recipientAddress: item.recipientAddress,
            networkName: item.networkName,
            bridgeType: item.bridgeType
          })));

          // Debug: Show what's in each category
          if (aggregatedData) {
            console.log(`🔍 Completed transfers in display:`, aggregatedData.completedTransfers.map(ct => ({
              claimNum: ct.claimNum || ct.actualClaimNum,
              eventType: ct.transfer?.eventType,
              amount: ct.amount?.toString(),
              status: ct.status
            })));
            
            console.log(`🔍 Pending transfers in display:`, aggregatedData.pendingTransfers.map(pt => ({
              eventType: pt.eventType,
              amount: pt.amount?.toString(),
              status: pt.status,
              transactionHash: pt.transactionHash
            })));
          }

          console.log(`🔍 Sorted ${displayData.length} items by most recent first:`, 
            displayData.slice(0, 5).map(item => ({
              type: item.eventType ? 'transfer' : 'claim',
              eventType: item.eventType,
              blockNumber: item.blockNumber,
              timestamp: item.timestamp || item.blockTimestamp,
              claimNum: item.claimNum || item.actualClaimNum
            }))
          );

          return displayData.map((item, index) => {
            // Handle both claims and transfers
            const isTransfer = item.eventType; // Check if this is a transfer
            const isSuspicious = item.isFraudulent;
            // A pending transfer has eventType but no claimNum
            // A completed claim has claimNum but no eventType
            const isPending = item.eventType && !item.claimNum;
            
            
            // For pending transfers, use the transfer data directly
            // For claims, use the claim data
            const claim = isPending ? {
              ...item,
              recipientAddress: item.senderAddress, // For pending transfers, sender becomes recipient
              senderAddress: item.senderAddress,
              amount: item.amount,
              data: item.data,
              bridgeType: item.bridgeType,
              networkName: item.networkName,
              networkKey: item.networkKey,
              bridgeAddress: item.bridgeAddress,
              blockNumber: item.blockNumber,
              transactionHash: item.transactionHash,
              // Add default values for claim-specific fields
              currentOutcome: 0,
              yesStake: null,
              noStake: null,
              expiryTs: null,
              finished: false,
              withdrawn: false,
              claimNum: null,
              // Ensure pending transfers are clearly marked
              status: 'pending'
            } : {
              ...item,
              // Ensure completed claims don't have eventType
              eventType: undefined,
              status: 'completed'
            };
            
          // Debug: Log the claim data to see what we're working with
            console.log(`🔍 Item ${index + 1} data:`, {
              itemType: isTransfer ? 'transfer' : 'claim',
            claimNum: claim.claimNum,
            actualClaimNum: claim.actualClaimNum,
            amount: claim.amount,
            amountType: typeof claim.amount,
            yesStake: claim.yesStake,
            yesStakeType: typeof claim.yesStake,
            noStake: claim.noStake,
            noStakeType: typeof claim.noStake,
            bridgeType: claim.bridgeType,
            homeTokenSymbol: claim.homeTokenSymbol,
            foreignTokenSymbol: claim.foreignTokenSymbol,
            homeTokenAddress: claim.homeTokenAddress,
            foreignTokenAddress: claim.foreignTokenAddress,
            homeNetwork: claim.homeNetwork,
            foreignNetwork: claim.foreignNetwork,
            transferTokenSymbol: getTransferTokenSymbol(claim),
              isSuspicious,
              isPending,
              rawItem: item
          });
          
          const status = getClaimStatus(claim);
          
          // Debug withdrawn claims rendering
          if (claim.withdrawn === true) {
            console.log(`💰 RENDERING WITHDRAWN CLAIM:`, {
              claimNum: claim.claimNum || claim.actualClaimNum,
              withdrawn: claim.withdrawn,
              finished: claim.finished,
              status: status,
              currentOutcome: claim.currentOutcome,
              amount: claim.amount?.toString(),
              recipientAddress: claim.recipientAddress,
              networkName: claim.networkName,
              bridgeType: claim.bridgeType,
              hasTransfer: !!claim.transfer
            });
          }
          
          return (
            <motion.div
              key={`${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum || claim.transactionHash}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.1 }}
              className={`card mb-4 ${
                isSuspicious ? 'border-red-500 bg-red-900/10' : 
                isPending ? 'border-yellow-500 bg-yellow-900/10' : 
                claim.withdrawn ? 'border-green-500 bg-green-900/10' :
                'border-dark-700'
              }`}
            >
              <div className="flex items-start justify-between">
                {/* Claim Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium text-white">
                      {isPending ? `Transfer #${index + 1}` : (isTransfer ? `Transfer #${index + 1}` : `Claim #${claim.actualClaimNum || claim.claimNum}`)}
                    </span>
                    {isSuspicious && claim.withdrawn && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {isSuspicious && status === 'active' && <Clock className="w-4 h-4 text-warning-500" />}
                    {isSuspicious && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    {isPending && <Clock className="w-4 h-4 text-yellow-500" />}
                    {!isTransfer && !isSuspicious && !isPending && getStatusIcon(status)}
                    <span className={`text-sm font-medium ${
                      isSuspicious ? 'text-red-500' : 
                      isPending ? 'text-yellow-500' : 
                      getStatusColor(status)
                    }`}>
                      {isSuspicious ? 'Suspicious' : 
                       isPending ? 'Pending...' : 
                       getStatusText(status)}
                    </span>
                    <span className="text-sm text-secondary-400">
                      {claim.bridgeType === 'export' ? 'Export' : 'Import'}
                    </span>
                    <span className="text-xs bg-primary-600/20 text-primary-400 px-2 py-1 rounded">
                      {claim.networkName || claim.networkKey}
                    </span>
                    {!isPending && !isTransfer && isThirdPartyClaim(claim) && (
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                        Fast-forwarded
                      </span>
                    )}
                  </div>

                  {/* Show both transfer and claim details for completed transfers and suspicious claims with transfers */}
                  {claim.transfer && (
                    <div className="mb-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Transfer Details */}
                        <div className="bg-dark-800 border border-secondary-700 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-primary-400 mb-2">Transfer from {claim.transfer.fromNetwork || 'Unknown Network'}</h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-secondary-400">Amount:</span>
                              <span className="text-white ml-2 font-medium">
                                {(() => {
                                  const decimals = getTokenDecimals(claim.transfer);
                                  const formatted = formatAmount(claim.transfer.amount, decimals);
                                  return `${formatted} ${getTransferTokenSymbol(claim.transfer)}`;
                                })()}
                              </span>
                            </div>
                            {claim.transfer.reward && claim.transfer.reward !== '0' && claim.transfer.reward !== '0x0' && (
                              <div>
                                <span className="text-secondary-400">Reward:</span>
                                <span className="text-white ml-2 font-medium">
                                  {(() => {
                                    const decimals = getTokenDecimals(claim.transfer);
                                    const formatted = formatAmount(claim.transfer.reward, decimals);
                                    return `${formatted} ${getTransferTokenSymbol(claim.transfer)}`;
                                  })()}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-secondary-400">Sender:</span>
                              <span className="text-white ml-2 font-mono">
                                {formatAddress(claim.transfer.senderAddress)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(claim.transfer.senderAddress, 'Transfer sender address')}
                                className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                title="Copy transfer sender address"
                              >
                                <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                              </button>
                            </div>
                            <div>
                              <span className="text-secondary-400">Recipient:</span>
                              <span className="text-white ml-2 font-mono">
                                {formatAddress(claim.transfer.recipientAddress)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(claim.transfer.recipientAddress, 'Transfer recipient address')}
                                className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                title="Copy transfer recipient address"
                              >
                                <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                              </button>
                            </div>
                            <div>
                              <span className="text-secondary-400">Tx Hash:</span>
                              <span className="text-white ml-2 font-mono">
                                {formatAddress(claim.transfer.transactionHash)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(claim.transfer.transactionHash, 'Transfer transaction hash')}
                                className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                title="Copy transfer transaction hash"
                              >
                                <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                              </button>
                            </div>
                            <div>
                              <span className="text-secondary-400">Block:</span>
                              <span className="text-white ml-2">{claim.transfer.blockNumber}</span>
                            </div>
                            <div>
                              <span className="text-secondary-400">Data:</span>
                              <span className="text-white ml-2 font-mono text-xs">
                                {claim.transfer.data || '0x'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Claim Details */}
                        <div className="bg-dark-800 border border-secondary-700 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-success-400 mb-2">Claim to {claim.transfer.toNetwork || 'Unknown Network'}</h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-secondary-400">Amount:</span>
                              <span className="text-white ml-2 font-medium">
                                {(() => {
                                  const decimals = getTokenDecimals(claim);
                                  const formatted = formatAmount(claim.amount, decimals);
                                  return `${formatted} ${getTransferTokenSymbol(claim)}`;
                                })()}
                              </span>
                              {(() => {
                                const matchStatus = getFieldMatchStatus(claim, 'amount');
                                if (matchStatus.isMatch) {
                                  return <CheckCircle className="w-4 h-4 text-green-500 ml-2 inline" />;
                                } else {
                                  return (
                                    <span className="ml-2 inline-flex items-center">
                                      <X className="w-4 h-4 text-red-500 mr-1" />
                                      <span className="text-red-400 text-xs">{matchStatus.reason}</span>
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                            {claim.reward && claim.reward !== '0' && claim.reward !== '0x0' && (
                              <div>
                                <span className="text-secondary-400">Reward:</span>
                                <span className="text-white ml-2 font-medium">
                                  {(() => {
                                    const decimals = getTokenDecimals(claim);
                                    const formatted = formatAmount(claim.reward, decimals);
                                    return `${formatted} ${getTransferTokenSymbol(claim)}`;
                                  })()}
                                </span>
                                {(() => {
                                  const matchStatus = getFieldMatchStatus(claim, 'reward');
                                  if (matchStatus.isMatch) {
                                    return <CheckCircle className="w-4 h-4 text-green-500 ml-2 inline" />;
                                  } else {
                                    return (
                                      <span className="ml-2 inline-flex items-center">
                                        <X className="w-4 h-4 text-red-500 mr-1" />
                                        <span className="text-red-400 text-xs">{matchStatus.reason}</span>
                                      </span>
                                    );
                                  }
                                })()}
                              </div>
                            )}
                            <div>
                              <span className="text-secondary-400">Sender:</span>
                              <span className="text-white ml-2 font-mono">
                                {formatAddress(claim.senderAddress)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(claim.senderAddress, 'Claim sender address')}
                                className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                title="Copy claim sender address"
                              >
                                <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                              </button>
                              {(() => {
                                const matchStatus = getFieldMatchStatus(claim, 'sender');
                                if (matchStatus.isMatch) {
                                  return <CheckCircle className="w-4 h-4 text-green-500 ml-2 inline" />;
                                } else {
                                  return (
                                    <span className="ml-2 inline-flex items-center">
                                      <X className="w-4 h-4 text-red-500 mr-1" />
                                      <span className="text-red-400 text-xs">{matchStatus.reason}</span>
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                            <div>
                              <span className="text-secondary-400">Recipient:</span>
                              <span className="text-white ml-2 font-mono">
                                {formatAddress(claim.recipientAddress)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(claim.recipientAddress, 'Claim recipient address')}
                                className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                title="Copy claim recipient address"
                              >
                                <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                              </button>
                              {(() => {
                                const matchStatus = getFieldMatchStatus(claim, 'recipient');
                                if (matchStatus.isMatch) {
                                  return <CheckCircle className="w-4 h-4 text-green-500 ml-2 inline" />;
                                } else {
                                  return (
                                    <span className="ml-2 inline-flex items-center">
                                      <X className="w-4 h-4 text-red-500 mr-1" />
                                      <span className="text-red-400 text-xs">{matchStatus.reason}</span>
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                            {isThirdPartyClaim(claim) && (
                              <div>
                                <span className="text-secondary-400">Assistant:</span>
                                <span className="text-white ml-2 font-mono">
                                  {formatAddress(claim.claimant_address)}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(claim.claimant_address, 'Claimant address')}
                                  className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                  title="Copy claimant address"
                                >
                                  <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                                </button>
                              </div>
                            )}
                            <div>
                              <span className="text-secondary-400">Claim Txid:</span>
                              <span className="text-white ml-2 font-mono">
                                {formatAddress(claim.txid)}
                              </span>
                              <button
                                onClick={() => copyToClipboard(claim.txid, 'Claim transaction ID')}
                                className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                title="Copy claim transaction ID"
                              >
                                <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                              </button>
                              {(() => {
                                const matchStatus = getFieldMatchStatus(claim, 'txid');
                                if (matchStatus.isMatch) {
                                  return <CheckCircle className="w-4 h-4 text-green-500 ml-2 inline" />;
                                } else {
                                  return (
                                    <span className="ml-2 inline-flex items-center">
                                      <X className="w-4 h-4 text-red-500 mr-1" />
                                      <span className="text-red-400 text-xs">{matchStatus.reason}</span>
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                            <div>
                              <span className="text-secondary-400">Claim Block:</span>
                              <span className="text-white ml-2">{claim.blockNumber || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-secondary-400">Data:</span>
                              <span className="text-white ml-2 font-mono text-xs">
                                {claim.data || '0x'}
                              </span>
                              {(() => {
                                const matchStatus = getFieldMatchStatus(claim, 'data');
                                if (matchStatus.isMatch) {
                                  return <CheckCircle className="w-4 h-4 text-green-500 ml-2 inline" />;
                                } else {
                                  return (
                                    <span className="ml-2 inline-flex items-center">
                                      <X className="w-4 h-4 text-red-500 mr-1" />
                                      <span className="text-red-400 text-xs">{matchStatus.reason}</span>
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show single details for pending transfers or suspicious claims */}
                  {isPending && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-secondary-400">Amount:</span>
                        <span className="text-white ml-2 font-medium">
                          {(() => {
                            const decimals = getTokenDecimals(claim);
                            const formatted = formatAmount(claim.amount, decimals);
                            return `${formatted} ${getTransferTokenSymbol(claim)}`;
                          })()}
                        </span>
                      </div>
                      
                      {claim.reward && claim.reward !== '0' && claim.reward !== '0x0' && (
                        <div>
                          <span className="text-secondary-400">Reward:</span>
                          <span className="text-white ml-2 font-medium">
                            {(() => {
                              const decimals = getTokenDecimals(claim);
                              const formatted = formatAmount(claim.reward, decimals);
                              return `${formatted} ${getTransferTokenSymbol(claim)}`;
                            })()}
                          </span>
                        </div>
                      )}
                      
                      <div>
                        <span className="text-secondary-400">Sender:</span>
                        <span className="text-white ml-2 font-mono">
                          {formatAddress(claim.senderAddress)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(claim.senderAddress, 'Sender address')}
                          className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                          title="Copy sender address"
                        >
                          <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                        </button>
                      </div>
                      
                      <div>
                        <span className="text-secondary-400">Recipient:</span>
                        <span className="text-white ml-2 font-mono">
                          {formatAddress(claim.recipientAddress)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(claim.recipientAddress, 'Recipient address')}
                          className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                          title="Copy recipient address"
                        >
                          <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                        </button>
                      </div>
                      
                      {isThirdPartyClaim(claim) && (
                        <div>
                          <span className="text-secondary-400">Assistant:</span>
                          <span className="text-white ml-2 font-mono">
                            {formatAddress(claim.claimant_address)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(claim.claimant_address, 'Claimant address')}
                            className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                            title="Copy claimant address"
                          >
                            <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show mismatch reason for suspicious claims without transfers */}
                  {isSuspicious && !claim.transfer && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-secondary-400">Amount:</span>
                        <span className="text-white ml-2 font-medium">
                          {(() => {
                            const decimals = getTokenDecimals(claim);
                            const formatted = formatAmount(claim.amount, decimals);
                            return `${formatted} ${getTransferTokenSymbol(claim)}`;
                          })()}
                        </span>
                      </div>
                      
                      {claim.reward && claim.reward !== '0' && claim.reward !== '0x0' && (
                        <div>
                          <span className="text-secondary-400">Reward:</span>
                          <span className="text-white ml-2 font-medium">
                            {(() => {
                              const decimals = getTokenDecimals(claim);
                              const formatted = formatAmount(claim.reward, decimals);
                              return `${formatted} ${getTransferTokenSymbol(claim)}`;
                            })()}
                          </span>
                        </div>
                      )}
                      
                      <div>
                        <span className="text-secondary-400">Sender:</span>
                        <span className="text-white ml-2 font-mono">
                          {formatAddress(claim.senderAddress)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(claim.senderAddress, 'Sender address')}
                          className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                          title="Copy sender address"
                        >
                          <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                        </button>
                      </div>
                      
                      <div>
                        <span className="text-secondary-400">Recipient:</span>
                        <span className="text-white ml-2 font-mono">
                          {formatAddress(claim.recipientAddress)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(claim.recipientAddress, 'Recipient address')}
                          className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                          title="Copy recipient address"
                        >
                          <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                        </button>
                      </div>
                      
                      {isThirdPartyClaim(claim) && (
                        <div>
                          <span className="text-secondary-400">Assistant:</span>
                          <span className="text-white ml-2 font-mono">
                            {formatAddress(claim.claimant_address)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(claim.claimant_address, 'Claimant address')}
                            className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                            title="Copy claimant address"
                          >
                            <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show mismatch reason for suspicious claims */}
                  {isSuspicious && (
                    <div className="mb-3">
                      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                        <div className="text-sm">
                          <span className="text-red-400 font-medium">Suspicious Reason:</span>
                          <span className="text-red-300 ml-2">
                            {claim.reason === 'no_matching_transfer' ? 'No matching transfer found' :
                             claim.reason === 'txid_match_but_parameter_mismatch' ? 'TXID matches but parameters differ' :
                             claim.reason || 'Unknown suspicious activity'}
                          </span>
                        </div>
                        {claim.parameterMismatches && (
                          <div className="mt-2 text-xs">
                            <span className="text-red-400">Parameter Mismatches:</span>
                            <span className="text-red-300 ml-2">
                              {(() => {
                                const mismatches = [];
                                if (!claim.parameterMismatches.amountMatch) {
                                  // Show specific amount mismatch reason
                                  const amountReason = claim.parameterMismatches.amountMatchReason;
                                  if (amountReason === 'different_values') {
                                    mismatches.push('Amount (different values)');
                                  } else if (amountReason === 'format_mismatch_but_equal') {
                                    mismatches.push('Amount (format mismatch)');
                                  } else if (amountReason === 'missing_amount') {
                                    mismatches.push('Amount (missing amount)');
                                  } else if (amountReason === 'conversion_error') {
                                    mismatches.push('Amount (conversion error)');
                                  } else {
                                    mismatches.push('Amount');
                                  }
                                }
                                if (!claim.parameterMismatches.senderMatch) {
                                  // Show specific sender mismatch reason
                                  const senderReason = claim.parameterMismatches.senderMatchReason;
                                  if (senderReason === 'mixed_checksum_format') {
                                    mismatches.push('Sender (format mismatch)');
                                  } else if (senderReason === 'both_non_checksummed') {
                                    mismatches.push('Sender (non-checksummed)');
                                  } else if (senderReason === 'checksummed_format_mismatch') {
                                    mismatches.push('Sender (checksum mismatch)');
                                  } else if (senderReason === 'different_addresses') {
                                    mismatches.push('Sender (different address)');
                                  } else {
                                    mismatches.push('Sender');
                                  }
                                }
                                if (!claim.parameterMismatches.recipientMatch) {
                                  // Show specific recipient mismatch reason
                                  const recipientReason = claim.parameterMismatches.recipientMatchReason;
                                  if (recipientReason === 'mixed_checksum_format') {
                                    mismatches.push('Recipient (format mismatch)');
                                  } else if (recipientReason === 'both_non_checksummed') {
                                    mismatches.push('Recipient (non-checksummed)');
                                  } else if (recipientReason === 'checksummed_format_mismatch') {
                                    mismatches.push('Recipient (checksum mismatch)');
                                  } else if (recipientReason === 'different_addresses') {
                                    mismatches.push('Recipient (different address)');
                                  } else {
                                    mismatches.push('Recipient');
                                  }
                                }
                                if (!claim.parameterMismatches.rewardValid) {
                                  // Show specific reward mismatch reason
                                  const rewardReason = claim.parameterMismatches.rewardValidationReason;
                                  if (rewardReason === 'claim_reward_exceeds_transfer_reward') {
                                    mismatches.push('Reward (exceeds transfer reward)');
                                  } else if (rewardReason === 'format_mismatch_but_equal') {
                                    mismatches.push('Reward (format mismatch)');
                                  } else if (rewardReason === 'transfer_reward_missing') {
                                    mismatches.push('Reward (transfer reward missing)');
                                  } else if (rewardReason === 'conversion_error') {
                                    mismatches.push('Reward (conversion error)');
                                  } else {
                                    mismatches.push('Reward');
                                  }
                                }
                                if (!claim.parameterMismatches.dataValid) {
                                  // Show specific data mismatch reason
                                  const dataReason = claim.parameterMismatches.dataValidationReason;
                                  if (dataReason === 'data_mismatch') {
                                    mismatches.push('Data (mismatch)');
                                  } else {
                                    mismatches.push('Data');
                                  }
                                }
                                if (!claim.parameterMismatches.isValidFlow) {
                                  mismatches.push('Flow');
                                }
                                return mismatches.length > 0 ? mismatches.join(', ') : 'None detected';
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Only show claim-specific data for actual claims, not pending transfers */}
                  {!isPending && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-secondary-400">Current Outcome:</span>
                        <span className="text-white ml-2 font-medium">
                          {getOutcomeText(claim.currentOutcome)}
                        </span>
                      </div>
                      
                      {claim.reward && claim.reward !== '0' && claim.reward !== '0x0' && (
                        <div>
                          <span className="text-secondary-400">Reward:</span>
                          <span className="text-white ml-2 font-medium">
                            {(() => {
                              const decimals = getTokenDecimals(claim);
                              const formatted = formatAmount(claim.reward, decimals);
                              return `${formatted} ${getTransferTokenSymbol(claim)}`;
                            })()}
                          </span>
                        </div>
                      )}
                      
                      <div>
                        <span className="text-secondary-400">YES Stakes:</span>
                        <span className="text-white ml-2 font-medium">
                          {(() => {
                            const stakeDecimals = getStakeTokenDecimals(claim);
                            const stakeTokenAddress = getStakeTokenAddress(claim);
                            const formatted = formatAmount(claim.yesStake, stakeDecimals, stakeTokenAddress);
                            console.log(`🔍 YES Stake formatting for claim:`, {
                              rawStake: claim.yesStake?.toString(),
                              rawStakeType: typeof claim.yesStake,
                              rawStakeHasToNumber: typeof claim.yesStake?.toNumber === 'function',
                              stakeTokenSymbol: getStakeTokenSymbol(claim),
                              stakeTokenAddress,
                              stakeDecimals,
                              formatted
                            });
                            return `${formatted} ${getStakeTokenSymbol(claim)}`;
                          })()}
                        </span>
                      </div>
                      
                      <div>
                        <span className="text-secondary-400">NO Stakes:</span>
                        <span className="text-white ml-2 font-medium">
                          {(() => {
                            const stakeDecimals = getStakeTokenDecimals(claim);
                            const stakeTokenAddress = getStakeTokenAddress(claim);
                            const formatted = formatAmount(claim.noStake, stakeDecimals, stakeTokenAddress);
                            console.log(`🔍 NO Stake formatting for claim:`, {
                              rawStake: claim.noStake?.toString(),
                              rawStakeType: typeof claim.noStake,
                              rawStakeHasToNumber: typeof claim.noStake?.toNumber === 'function',
                              stakeTokenSymbol: getStakeTokenSymbol(claim),
                              stakeTokenAddress,
                              stakeDecimals,
                              formatted
                            });
                            return `${formatted} ${getStakeTokenSymbol(claim)}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Only show expiry information for actual claims, not pending transfers */}
                  {!isPending && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                        <div>
                          <span className="text-secondary-400">Expiry:</span>
                          <span className="text-white ml-2">
                            {formatDate(claim.expiryTs)}
                          </span>
                        </div>
                      </div>

                      {status === 'active' && (
                        <div className="mt-2">
                          <span className="text-warning-400 text-sm font-medium">
                            {getTimeRemaining(claim.expiryTs)}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Action Buttons */}
                  <div className="mt-3 flex gap-2">
                    {/* Create Claim Button for Pending Transfers */}
                    {isPending && (
                      <button
                        onClick={async () => {
                          if (!account) {
                            toast.error('Please connect your wallet to create claims');
                            return;
                          }
                          
                          try {
                            // Determine the required network for this transfer
                            const requiredNetwork = getRequiredNetwork(claim);
                            console.log('🔍 Required network result:', requiredNetwork);
                            
                            if (!requiredNetwork) {
                              toast.error('Could not determine the required network for this transfer');
                              return;
                            }
                            
                            // Switch to the required network before opening the dialog
                            console.log('🔄 Starting network switch to:', requiredNetwork.name);
                            toast(`Switching to ${requiredNetwork.name} network...`);
                            const switchResult = await switchToRequiredNetwork(requiredNetwork);
                            console.log('🔄 Network switch result:', switchResult);
                            
                            if (!switchResult) {
                              toast.error('Failed to switch to the required network');
                              return;
                            }
                            
                            // Set the transfer data and open the NewClaim dialog
                            setSelectedTransfer(claim);
                            setShowNewClaim(true);
                          } catch (error) {
                            console.error('Error switching network:', error);
                            toast.error(`Failed to switch network: ${error.message}`);
                          }
                        }}
                        className="btn-primary flex items-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Claim
                      </button>
                    )}
                    
                    {/* Withdraw Button for Expired Claims with YES Outcome */}
                    {!isTransfer && !isPending && canWithdrawClaim(claim) && (
                      <button
                        onClick={() => {
                          if (!account) {
                            toast.error('Please connect your wallet to withdraw claims');
                            return;
                          }
                          handleWithdraw(claim);
                        }}
                        className="btn-primary flex items-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Withdraw
                      </button>
                    )}
                    
                    {/* Challenge Button for Active Claims */}
                    {!isTransfer && !isPending && canChallengeClaim(claim) && (
                      <button
                        onClick={() => {
                          if (!account) {
                            toast.error('Please connect your wallet to challenge claims');
                            return;
                          }
                          handleChallenge(claim);
                        }}
                        className="btn-secondary flex items-center gap-2 text-sm"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        Challenge
                      </button>
                    )}
                  </div>
                  
                  {/* Info for claims that can't be withdrawn */}
                  {claim.finished && !claim.withdrawn && isCurrentUserRecipient(claim) && claim.currentOutcome !== 1 && (
                    <div className="mt-3">
                      <div className="bg-gray-700 rounded-lg p-3">
                        <p className="text-gray-400 text-sm">
                          ⚠️ This claim has a NO outcome and cannot be withdrawn. Only expired claims with YES outcomes can be withdrawn.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Info for non-expired claims */}
                  {claim.finished && !claim.withdrawn && isCurrentUserRecipient(claim) && claim.currentOutcome === 1 && !canWithdrawClaim(claim) && (
                    <div className="mt-3">
                      <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
                        <p className="text-yellow-400 text-sm">
                          ⏰ This claim has a YES outcome but is not yet expired. You can withdraw it once it expires.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 text-xs text-secondary-400">
                    <span>Bridge: {formatAddress(claim.bridgeAddress)}</span>
                    <span className="mx-2">•</span>
                    <span>{claim.homeNetwork} → {claim.foreignNetwork}</span>
                    {isTransfer && (
                      <>
                        <span className="mx-2">•</span>
                        <span>Block: {claim.blockNumber}</span>
                        <span className="mx-2">•</span>
                        <span>Txid: {formatAddress(claim.transactionHash)}</span>
                        <button
                          onClick={() => copyToClipboard(claim.transactionHash, 'Transaction ID')}
                          className="ml-1 p-1 hover:bg-dark-700 rounded transition-colors"
                          title="Copy transaction ID"
                        >
                          <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        });
        })()}
      </AnimatePresence>

      {/* New Claim Dialog */}
      <NewClaim 
        isOpen={showNewClaim}
        onClose={() => {
          setShowNewClaim(false);
          setSelectedTransfer(null);
        }}
        selectedTransfer={selectedTransfer}
        onClaimSubmitted={(claimData) => {
          console.log('🔍 Claim submitted successfully, refreshing claim list:', claimData);
          // Refresh the claim list to show the new claim
          loadClaimsAndTransfers();
        }}
      />

      {/* Withdraw Claim Dialog */}
      {showWithdrawModal && selectedClaim && (
        <WithdrawClaim
          claim={selectedClaim}
          onWithdrawSuccess={(claimNum) => {
            console.log(`🔍 Withdraw successful for claim #${claimNum}, refreshing claims...`);
            setShowWithdrawModal(false);
            setSelectedClaim(null);
            // Refresh the claims list
            loadClaimsAndTransfers();
          }}
          onClose={() => {
            setShowWithdrawModal(false);
            setSelectedClaim(null);
          }}
        />
      )}

      {/* Challenge Claim Dialog */}
      {showChallengeModal && selectedClaim && (
        <Challenge
          claim={selectedClaim}
          onChallengeSuccess={(claimNum) => {
            console.log(`🔍 Challenge successful for claim #${claimNum}, refreshing claims...`);
            setShowChallengeModal(false);
            setSelectedClaim(null);
            // Refresh the claims list
            loadClaimsAndTransfers();
          }}
          onClose={() => {
            setShowChallengeModal(false);
            setSelectedClaim(null);
          }}
        />
      )}
    </div>
  );
};

export default ClaimList;

