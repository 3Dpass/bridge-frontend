import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS, getBridgeDirections, getBridgeAddressesForDirection, getNetworksForDirection } from '../config/networks';
import { discoverAllBridgeEvents } from '../utils/parallel-bridge-discovery';
import { aggregateClaimsAndTransfers } from '../utils/aggregate-claims-transfers';
import { clearAllCachedEvents } from '../utils/event-cache';
import { 
  COUNTERSTAKE_ABI,
  EXPORT_ABI,
  IMPORT_ABI,
  IMPORT_WRAPPER_ABI
} from '../contracts/abi';
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
  X,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import NewClaim from './NewClaim';
import WithdrawClaim from './WithdrawClaim';
import Challenge from './Challenge';

// Browser storage utilities for claims and transfers
const STORAGE_KEYS = {
  CLAIMS: 'bridge_claims_cache',
  TRANSFERS: 'bridge_transfers_cache',
  AGGREGATED: 'bridge_aggregated_cache',
  TIMESTAMP: 'bridge_cache_timestamp',
  SETTINGS: 'bridge_cache_settings'
};

const getCachedData = (key) => {
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Failed to parse cached data:', error);
    return null;
  }
};

const setCachedData = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEYS.TIMESTAMP, Date.now().toString());
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
};

const clearCachedData = () => {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn('Failed to clear cached data:', error);
  }
};

// Add new transfer event to browser storage
const addTransferEventToStorage = (eventData) => {
  try {
    console.log('💾 Adding new transfer event to browser storage:', eventData);
    
    // Get existing transfers from storage
    const existingTransfers = getCachedData(STORAGE_KEYS.TRANSFERS) || [];
    
    // Check if this transfer already exists (by transaction hash)
    const existingIndex = existingTransfers.findIndex(t => t.transactionHash === eventData.transactionHash);
    
    if (existingIndex >= 0) {
      // Update existing transfer
      existingTransfers[existingIndex] = { ...existingTransfers[existingIndex], ...eventData };
      console.log('🔄 Updated existing transfer in storage');
    } else {
      // Add new transfer at the beginning (most recent first)
      existingTransfers.unshift(eventData);
      console.log('➕ Added new transfer to storage');
    }
    
    // Save back to storage
    setCachedData(STORAGE_KEYS.TRANSFERS, existingTransfers);
    
    // Update timestamp to indicate fresh data
    localStorage.setItem(STORAGE_KEYS.TIMESTAMP, Date.now().toString());
    
    console.log('✅ Transfer event successfully added to browser storage');
    return true;
  } catch (error) {
    console.error('❌ Failed to add transfer event to storage:', error);
    return false;
  }
};

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
  
  if (!claim.parameterMismatches.timestampMatch) {
    const timestampReason = claim.parameterMismatches.timestampMatchReason;
    if (timestampReason === 'timestamp_mismatch') {
      mismatches.push({ field: 'timestamp', reason: 'timestamp mismatch' });
    } else {
      mismatches.push({ field: 'timestamp', reason: 'mismatch' });
    }
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

  // Check if timestamp matches (for timestamp field)
  if (field === 'timestamp') {
    const timestampMismatch = mismatches.find(m => m.field === 'timestamp');
    if (timestampMismatch) {
      return { isMatch: false, reason: timestampMismatch.reason };
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
  const { getBridgeInstancesWithSettings, getTokenDecimalsDisplayMultiplier } = useSettings();
  const [claims, setClaims] = useState([]);
  const [aggregatedData, setAggregatedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [filter, setFilter] = useState(() => {
    // Check if there's a stored filter preference from navigation
    const storedFilter = localStorage.getItem('claimListFilter');
    if (storedFilter) {
      localStorage.removeItem('claimListFilter'); // Clear after reading
      return storedFilter;
    }
    return 'all';
  }); // 'all', 'my', 'suspicious', 'pending', 'active'
  const [bridgeDirection, setBridgeDirection] = useState('all'); // 'all' or specific direction ID
  const [rangeHours, setRangeHours] = useState(24); // Hours of history to scan (default: 24)
  const [isSearching, setIsSearching] = useState(false); // Track if search is in progress
  const [currentBlock, setCurrentBlock] = useState(null);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [contractSettings, setContractSettings] = useState({});
  const [userStakes, setUserStakes] = useState({}); // Cache for user stake information
  
  // Cache status tracking
  const [cacheStatus, setCacheStatus] = useState({
    hasCachedData: false,
    isShowingCached: false,
    isRefreshing: false,
    lastUpdated: null,
    cacheAge: null
  });

  // Parallel discovery state
  const [discoveryState, setDiscoveryState] = useState({
    isDiscovering: false,
    bridgeResults: [],
    matchedTransfers: [],
    completedTransfers: [],
    pendingTransfers: [],
    suspiciousClaims: [],
    discoveryProgress: {
      bridgesCompleted: 0,
      totalBridges: 0,
      claimDataLoaded: 0,
      totalClaims: 0
    }
  });

  // Individual claim update tracking
  const [claimUpdates, setClaimUpdates] = useState({
    updatedClaims: new Set(), // Track which claims have been updated
    updateTimestamps: {}, // Track when each claim was last updated
    isUpdating: false, // Track if we're currently updating claims (legacy)
    updatingClaims: new Set() // Track which specific claims are being updated
  });
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

  // Helper function to get the correct ABI based on bridge type
  const getBridgeABI = useCallback((bridgeType) => {
    switch (bridgeType) {
      case 'export':
        return EXPORT_ABI;
      case 'import':
        return IMPORT_ABI;
      case 'import_wrapper':
        return IMPORT_WRAPPER_ABI;
      default:
        console.warn(`Unknown bridge type: ${bridgeType}, using COUNTERSTAKE_ABI as fallback`);
        return COUNTERSTAKE_ABI;
    }
  }, []);

  // Load contract settings for all bridges
  const loadContractSettings = useCallback(async () => {
    try {
      console.log('🔍 Loading contract settings for all bridges...');
      const allBridges = getBridgeInstancesWithSettings();
      const settingsMap = {};
      
      for (const [, bridge] of Object.entries(allBridges)) {
        try {
          const networkConfig = getNetworkWithSettings(bridge.homeNetwork);
          if (networkConfig?.rpcUrl) {
            const provider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
            const bridgeABI = getBridgeABI(bridge.type);
            const bridgeContract = new ethers.Contract(bridge.address, bridgeABI, provider);
            
            const settings = await bridgeContract.settings();
            settingsMap[bridge.address] = {
              min_tx_age: settings.min_tx_age,
              counterstake_coef100: settings.counterstake_coef100,
              ratio100: settings.ratio100,
              min_stake: settings.min_stake,
              large_threshold: settings.large_threshold
            };
            
            console.log(`🔍 Loaded settings for bridge ${bridge.address}:`, {
              min_tx_age: settings.min_tx_age.toString(),
              counterstake_coef100: settings.counterstake_coef100.toString(),
              ratio100: settings.ratio100.toString()
            });
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load settings for bridge ${bridge.address}:`, error);
        }
      }
      
      setContractSettings(settingsMap);
      console.log('🔍 Contract settings loaded for all bridges:', Object.keys(settingsMap));
    } catch (error) {
      console.error('❌ Error loading contract settings:', error);
    }
  }, [getBridgeInstancesWithSettings, getNetworkWithSettings, getBridgeABI]);

  // Check if a transfer is ready to be claimed based on min_tx_age
  const isTransferReadyToClaim = useCallback((transfer) => {
    if (!transfer || !transfer.timestamp) return true; // Default to true if no timestamp
    if (!currentBlock) return true; // Default to true if no current block
    
    const bridgeAddress = transfer.bridgeAddress;
    const settings = contractSettings[bridgeAddress];
    
    if (!settings || !settings.min_tx_age) return true; // Default to true if no settings
    
    try {
      const currentTimestamp = currentBlock.timestamp;
      const transferTimestamp = transfer.timestamp;
      const minTxAge = settings.min_tx_age.toNumber();
      const requiredTimestamp = transferTimestamp + minTxAge;
      
      return currentTimestamp >= requiredTimestamp;
    } catch (error) {
      console.error('Error checking transfer readiness:', error);
      return true; // Default to true on error
    }
  }, [contractSettings, currentBlock]);

  // Get remaining time until transfer can be claimed
  const getTimeUntilClaimable = useCallback((transfer) => {
    if (!transfer || !transfer.timestamp) return null;
    if (!currentBlock) return null;
    
    const bridgeAddress = transfer.bridgeAddress;
    const settings = contractSettings[bridgeAddress];
    
    if (!settings || !settings.min_tx_age) return null;
    
    try {
      const currentTimestamp = currentBlock.timestamp;
      const transferTimestamp = transfer.timestamp;
      const minTxAge = settings.min_tx_age.toNumber();
      const requiredTimestamp = transferTimestamp + minTxAge;
      const timeRemaining = requiredTimestamp - currentTimestamp;
      
      if (timeRemaining <= 0) return null;
      
      const hours = Math.floor(timeRemaining / 3600);
      const minutes = Math.floor((timeRemaining % 3600) / 60);
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    } catch (error) {
      console.error('Error calculating time until claimable:', error);
      return null;
    }
  }, [contractSettings, currentBlock]);

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
      
      const ethers = require('ethers');
      let amountString;
      
      // Handle BigNumber objects (including deserialized ones from cache)
      if (typeof amount?.toNumber === 'function') {
        amountString = amount.toString();
      } else if (typeof amount === 'string') {
        amountString = amount;
      } else if (typeof amount === 'number') {
        amountString = amount.toString();
      } else if (typeof amount === 'object' && amount !== null) {
        // Handle deserialized BigNumber objects from cache
        // They might have properties like _hex, _isBigNumber, or be plain objects with hex values
        if (amount._hex) {
          amountString = amount._hex;
        } else if (amount.hex) {
          amountString = amount.hex;
        } else if (amount.toString && typeof amount.toString === 'function') {
          amountString = amount.toString();
        } else {
          return '0.000000';
        }
      } else if (!amount) {
        return '0.000000';
      } else {
        return '0.000000';
      }
      
      // Check if the amount string is actually zero
      if (amountString === '0' || amountString === '0x0') {
        return '0.000000';
      }
      
      const rawValue = parseFloat(ethers.utils.formatUnits(amountString, decimals));
      
      // Check if this is a P3D token and apply decimalsDisplayMultiplier
      if (tokenAddress) {
        const decimalsDisplayMultiplier = getTokenDecimalsDisplayMultiplier(tokenAddress);
        console.log('🔍 formatAmount multiplier check:', {
          tokenAddress,
          decimalsDisplayMultiplier,
          rawValue,
          hasMultiplier: !!decimalsDisplayMultiplier
        });
        if (decimalsDisplayMultiplier) {
          // Apply the multiplier: 0.000001 * 1000000 = 1.0
          const multipliedNumber = rawValue * decimalsDisplayMultiplier;
          console.log('🔍 Multiplier applied:', {
            rawValue,
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
      
      return formatted;
    } catch (error) {
      console.error('Error formatting amount:', amount, error);
      return '0.000000';
    }
  }, [getTokenDecimalsDisplayMultiplier]);

  const getTransferTokenSymbol = useCallback((claim) => {
    // First, try to use the token symbol from bridge settings (most accurate)
    if (claim.bridgeTokenSymbol) {
      return claim.bridgeTokenSymbol;
    }
    
    // Check if this is a pending transfer vs completed claim
    // Use the explicit status field we set
    const isPending = claim.status === 'pending';
    const isCompletedClaim = claim.status === 'completed';
    
    
    if (isPending) {
      // For pending transfers, show the original asset (home token)
      const result = claim.homeTokenSymbol || 'Unknown';
      return result;  // Show original token (USDT)
    } else if (isCompletedClaim) {
      // For completed claims, show the wrapped asset (foreign token)
      const result = claim.foreignTokenSymbol || 'Unknown';
      return result;  // Show wrapped token (wUSDT)
    } else {
      // Fallback: if we can't determine the type, use the bridge type
      if (claim.bridgeType === 'export') {
        // For export bridges, show the home token (original asset)
        const result = claim.homeTokenSymbol || 'Unknown';
        return result;
      } else {
        // For import bridges, show the foreign token (wrapped asset)
        const result = claim.foreignTokenSymbol || 'Unknown';
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
    
    
    // Try to get decimals from the target network first (only if targetNetworkSymbol is defined)
    if (targetNetworkSymbol) {
      const networkConfig = getNetworkWithSettings(targetNetworkSymbol);
      if (networkConfig && networkConfig.tokens) {
        const token = networkConfig.tokens[tokenSymbol];
        if (token && token.decimals) {
          return token.decimals;
        }
      }
    }
    
    
    // Try to get decimals from other networks as fallback
    for (const networkKey of Object.keys(NETWORKS)) {
      const network = NETWORKS[networkKey];
      if (network.tokens && network.tokens[tokenSymbol]) {
        const token = network.tokens[tokenSymbol];
        if (token && token.decimals) {
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

  const getTransferTokenAddress = useCallback((claim) => {
    // If we already have a tokenAddress stored, use it (for pending transfers)
    if (claim.tokenAddress) {
      console.log('🔍 Using stored tokenAddress:', {
        tokenAddress: claim.tokenAddress,
        tokenSymbol: claim.tokenSymbol
      });
      return claim.tokenAddress;
    }
    
    // Get transfer token symbol first
    const tokenSymbol = getTransferTokenSymbol(claim);
    
    console.log('🔍 getTransferTokenAddress called:', {
      tokenSymbol,
      claimNetwork: claim.networkKey,
      currentNetwork: network?.symbol,
      claimType: claim.bridgeType
    });
    
    // Try to get address from current network tokens first
    const networkConfig = getNetworkWithSettings(network?.symbol);
    if (networkConfig && networkConfig.tokens) {
      const token = networkConfig.tokens[tokenSymbol];
      if (token && token.address) {
        console.log('🔍 Found token in current network:', {
          tokenSymbol,
          tokenAddress: token.address,
          hasMultiplier: !!token.decimalsDisplayMultiplier
        });
        return token.address;
      }
    }
    
    // Try to get address from other networks
    for (const networkKey of Object.keys(NETWORKS)) {
      const network = NETWORKS[networkKey];
      if (network.tokens && network.tokens[tokenSymbol]) {
        const token = network.tokens[tokenSymbol];
        if (token && token.address) {
          console.log('🔍 Found token in other network:', {
            networkKey,
            tokenSymbol,
            tokenAddress: token.address,
            hasMultiplier: !!token.decimalsDisplayMultiplier
          });
          return token.address;
        }
      }
    }
    
    console.log('🔍 Token address not found for symbol:', tokenSymbol);
    return null;
  }, [network?.symbol, getNetworkWithSettings, getTransferTokenSymbol]);

  const getStakeTokenDecimals = useCallback((claim) => {
    // Get stake token symbol first
    const stakeTokenSymbol = getStakeTokenSymbol(claim);
    
    // Try to get decimals from current network tokens first
    const networkConfig = getNetworkWithSettings(network?.symbol);
    if (networkConfig && networkConfig.tokens) {
      const token = networkConfig.tokens[stakeTokenSymbol];
      if (token && token.decimals) {
        return token.decimals;
      }
    }
    
    // Try to get decimals from other networks
    for (const networkKey of Object.keys(NETWORKS)) {
      const network = NETWORKS[networkKey];
      if (network.tokens && network.tokens[stakeTokenSymbol]) {
        const token = network.tokens[stakeTokenSymbol];
        if (token && token.decimals) {
          return token.decimals;
        }
      }
    }
    
    // If not found in any network config, use a reasonable default
    return 18;
  }, [network?.symbol, getNetworkWithSettings, getStakeTokenSymbol]);

  // Helper function to check if user has stakes on the current outcome
  const checkUserHasStakesOnCurrentOutcome = useCallback(async (claim, userAddress) => {
    try {
      if (!claim.bridgeAddress || !userAddress) {
        return false;
      }

      // Get the network configuration for this claim
      const networkConfig = getNetworkWithSettings(claim.networkKey);
      if (!networkConfig?.rpcUrl) {
        return false;
      }

      // Create provider and contract instance
      const provider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      const bridgeABI = getBridgeABI(claim.bridgeType);
      const contract = new ethers.Contract(claim.bridgeAddress, bridgeABI, provider);

      // Get the current outcome (0 = NO, 1 = YES)
      const currentOutcome = claim.currentOutcome;
      
      // Call the contract's stakes function to get user's stake on the current outcome
      // stakes(claim_num, side, address) where side is 0 for NO, 1 for YES
      const userStake = await contract.stakes(claim.actualClaimNum || claim.claimNum, currentOutcome, userAddress);
      
      // Check if user has any stake on the current outcome
      const hasStake = userStake && userStake.gt(0);
      
      return hasStake;
    } catch (error) {
      console.error('🔍 Error checking user stakes:', error);
      return false;
    }
  }, [getNetworkWithSettings, getBridgeABI]);

  // Function to load stake information for all claims
  const loadStakeInformation = useCallback(async (claims) => {
    if (!account || !claims || claims.length === 0) {
      return;
    }
    
    const stakePromises = claims.map(async (claim) => {
      if (!claim.bridgeAddress || (!claim.actualClaimNum && !claim.claimNum)) {
        return null;
      }

      const claimKey = `${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum}-${account}`;
      
      // Skip if we already have this information
      if (userStakes[claimKey] !== undefined) {
        return null;
      }

      try {
        const hasStakes = await checkUserHasStakesOnCurrentOutcome(claim, account);
        return { claimKey, hasStakes };
      } catch (error) {
        return { claimKey, hasStakes: false };
      }
    });

    const results = await Promise.all(stakePromises);
    const newUserStakes = { ...userStakes };
    
    results.forEach(result => {
      if (result) {
        newUserStakes[result.claimKey] = result.hasStakes;
      }
    });

    if (Object.keys(newUserStakes).length > Object.keys(userStakes).length) {
      setUserStakes(newUserStakes);
    }
  }, [account, checkUserHasStakesOnCurrentOutcome, userStakes]);

  // Helper function to check if a claim can be withdrawn
  const canWithdrawClaim = useCallback((claim) => {
    // Check if claim is not already withdrawn
    if (claim.withdrawn) {
      return false;
    }
    
    
    // Check if current user is the recipient (the person who will receive the funds)
    if (!account || !claim.recipientAddress) {
      return false;
    }
    
    // Check if the claim is expired (only expired claims can be withdrawn)
    // Use current block timestamp if available, otherwise use current time as fallback
    const now = currentBlock ? currentBlock.timestamp : Math.floor(Date.now() / 1000);
    const expiryTime = claim.expiryTs ? 
      (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
      0;
    
    // Claim must be expired (expiryTime <= now)
    if (expiryTime > now) {
      return false;
    }
    
    // Create a unique key for this claim and user combination
    const claimKey = `${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum}-${account}`;
    const userHasStakesOnCurrentOutcome = userStakes[claimKey];
    
    // Check if this is a third-party claim (claimant_address differs from recipient_address)
    const isThirdPartyClaim = claim.claimant_address && 
                             claim.claimant_address.toLowerCase() !== claim.recipientAddress.toLowerCase();
    
    if (isThirdPartyClaim) {
      // For third-party claims, the claimant (assistant) can withdraw
      const isOriginalClaimant = account.toLowerCase() === claim.claimant_address.toLowerCase();
      
      // Original claimant can withdraw if current outcome is YES
      if (isOriginalClaimant && claim.currentOutcome === 1) {
        return true;
      }
      
      // User can withdraw if they have stakes on the current winning outcome
      if (userHasStakesOnCurrentOutcome === true) {
        return true;
      }
      
      // If we don't have stake information yet, allow withdrawal for original claimant
      // This will be refined when stake information is loaded
      return isOriginalClaimant && userHasStakesOnCurrentOutcome !== false;
    } else {
      // For regular claims, the recipient can withdraw
      const isRecipient = account.toLowerCase() === claim.recipientAddress.toLowerCase();
      
      // Recipient can withdraw if current outcome is YES
      if (isRecipient && claim.currentOutcome === 1) {
        return true;
      }
      
      // User can withdraw if they have stakes on the current winning outcome
      if (userHasStakesOnCurrentOutcome === true) {
        return true;
      }
      
      // If we don't have stake information yet, allow withdrawal for recipient
      // This will be refined when stake information is loaded
      return isRecipient && userHasStakesOnCurrentOutcome !== false;
    }
  }, [account, currentBlock, userStakes]);

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
    // Use current block timestamp if available, otherwise use current time as fallback
    const now = currentBlock ? currentBlock.timestamp : Math.floor(Date.now() / 1000);
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
      formattedAmount: formatAmount(claim.amount, decimals, getTransferTokenAddress(claim)),
      tokenSymbol: getTransferTokenSymbol(claim),
      formattedStake: formatAmount(totalStake, stakeDecimals, getStakeTokenAddress(claim)),
      stakeTokenSymbol: getStakeTokenSymbol(claim)
    };
  }, [getTokenDecimals, getStakeTokenDecimals, getTransferTokenSymbol, getStakeTokenSymbol, getTransferTokenAddress, getStakeTokenAddress, formatAmount]);

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

  // Load cached data from browser storage
  const loadCachedData = useCallback(async () => {
    try {
      console.log('🔍 Loading cached data from browser storage...');
      
      const cachedClaims = getCachedData(STORAGE_KEYS.CLAIMS);
      const cachedTransfers = getCachedData(STORAGE_KEYS.TRANSFERS);
      const cachedAggregated = getCachedData(STORAGE_KEYS.AGGREGATED);
      const cachedSettings = getCachedData(STORAGE_KEYS.SETTINGS);
      
      if (cachedClaims || cachedTransfers || cachedAggregated) {
        console.log('✅ Found cached data:', {
          claims: cachedClaims?.length || 0,
          transfers: cachedTransfers?.length || 0,
          aggregated: !!cachedAggregated
        });
        
        // Set cached data immediately
        if (cachedClaims) {
          console.log('🔍 Loading cached claims:', cachedClaims.length, 'claims');
          // Debug: Log first few cached claims to see their structure
          if (cachedClaims.length > 0) {
            console.log('🔍 First cached claim structure:', {
              claimNum: cachedClaims[0].claimNum,
              actualClaimNum: cachedClaims[0].actualClaimNum,
              amount: cachedClaims[0].amount?.toString(),
              reward: cachedClaims[0].reward?.toString(),
              yesStake: cachedClaims[0].yesStake?.toString(),
              noStake: cachedClaims[0].noStake?.toString(),
              currentOutcome: cachedClaims[0].currentOutcome,
              finished: cachedClaims[0].finished,
              withdrawn: cachedClaims[0].withdrawn,
              txid: cachedClaims[0].txid,
              blockNumber: cachedClaims[0].blockNumber,
              claimTransactionHash: cachedClaims[0].claimTransactionHash
            });
            
            // Debug: Check if reward is actually zero or missing
            console.log('🔍 Reward field analysis:', {
              reward: cachedClaims[0].reward,
              rewardType: typeof cachedClaims[0].reward,
              rewardString: cachedClaims[0].reward?.toString(),
              isZero: cachedClaims[0].reward === 0 || cachedClaims[0].reward === '0' || cachedClaims[0].reward === '0x0',
              isNull: cachedClaims[0].reward === null,
              isUndefined: cachedClaims[0].reward === undefined
            });
            
            // Debug: Check if stakes are actually zero or missing
            console.log('🔍 Stakes field analysis:', {
              yesStake: cachedClaims[0].yesStake,
              yesStakeType: typeof cachedClaims[0].yesStake,
              yesStakeString: cachedClaims[0].yesStake?.toString(),
              yesStakeIsZero: cachedClaims[0].yesStake === 0 || cachedClaims[0].yesStake === '0' || cachedClaims[0].yesStake === '0x0',
              noStake: cachedClaims[0].noStake,
              noStakeType: typeof cachedClaims[0].noStake,
              noStakeString: cachedClaims[0].noStake?.toString(),
              noStakeIsZero: cachedClaims[0].noStake === 0 || cachedClaims[0].noStake === '0' || cachedClaims[0].noStake === '0x0'
            });
          }
          setClaims(cachedClaims);
          
          // Try to set currentBlock immediately for cached data
          if (!currentBlock) {
            try {
              const networksWithSettings = Object.values(NETWORKS).filter(network => 
                getNetworkWithSettings(network.symbol)?.rpcUrl
              );
              
              if (networksWithSettings.length > 0) {
                const networkConfig = getNetworkWithSettings(networksWithSettings[0].symbol);
                if (networkConfig?.rpcUrl) {
                  const networkProvider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
                  try {
                    const block = await networkProvider.getBlock('latest');
                    setCurrentBlock(block);
                    console.log(`🔍 Set current block for cached data from ${networksWithSettings[0].symbol}:`, {
                      blockNumber: block.number,
                      timestamp: block.timestamp
                    });
                  } catch (error) {
                    console.log(`🔍 Could not get block for cached data:`, error.message);
                  }
                }
              }
            } catch (error) {
              console.log(`🔍 Error setting current block for cached data:`, error.message);
            }
          }
        }
        if (cachedAggregated) {
          setAggregatedData(cachedAggregated);
          
          // Load stake information for cached completed claims
          const completedClaims = cachedAggregated.completedTransfers
            .filter(t => t.claim)
            .map(t => t.claim);
          
          if (completedClaims.length > 0) {
            console.log('🔄 Loading stake information for cached completed claims...');
            loadStakeInformation(completedClaims);
          }
        } else if ((cachedClaims && cachedClaims.length > 0) || (cachedTransfers && cachedTransfers.length > 0)) {
          // If we have claims or transfers but no aggregated data, process them through aggregation
          console.log('🔍 No cached aggregated data found, processing claims and transfers through aggregation...');
          try {
            const aggregated = aggregateClaimsAndTransfers(cachedClaims || [], cachedTransfers || []);
            setAggregatedData(aggregated);
            console.log('✅ Successfully processed claims and transfers through aggregation');
          } catch (error) {
            console.error('❌ Error processing transfers through aggregation:', error);
            // Fallback: create a simple aggregated structure with proper token symbols
            const fallbackAggregated = {
              completedTransfers: [],
              suspiciousClaims: [],
              pendingTransfers: cachedTransfers.map(transfer => {
                // Get bridge instance to extract proper token symbols
                let homeTokenSymbol = transfer.tokenSymbol; // fallback to stored tokenSymbol
                let foreignTokenSymbol = transfer.tokenSymbol; // fallback to stored tokenSymbol
                
                try {
                  const bridgeInstances = getBridgeInstancesWithSettings();
                  const bridgeInstance = bridgeInstances.find(bridge => 
                    bridge.address.toLowerCase() === transfer.bridgeAddress?.toLowerCase()
                  );
                  
                  if (bridgeInstance) {
                    homeTokenSymbol = bridgeInstance.homeTokenSymbol || transfer.tokenSymbol;
                    foreignTokenSymbol = bridgeInstance.foreignTokenSymbol || transfer.tokenSymbol;
                  }
                } catch (error) {
                  console.warn('⚠️ Could not get bridge instance for token symbols:', error);
                }
                
                return {
                  ...transfer,
                  status: 'pending',
                  isFraudulent: false,
                  reason: 'no_matching_claim',
                  claim: null,
                  // Add bridge-specific token symbols for proper display
                  homeTokenSymbol,
                  foreignTokenSymbol,
                  bridgeTokenSymbol: transfer.tokenSymbol // Keep original tokenSymbol as bridgeTokenSymbol
                };
              }),
              fraudDetected: false,
              stats: {
                totalClaims: 0,
                totalTransfers: cachedTransfers.length,
                completedTransfers: 0,
                suspiciousClaims: 0,
                pendingTransfers: cachedTransfers.length
              }
            };
            setAggregatedData(fallbackAggregated);
            
            // Load stake information for fallback completed claims
            const completedClaims = fallbackAggregated.completedTransfers
              .filter(t => t.claim)
              .map(t => t.claim);
            
            if (completedClaims.length > 0) {
              console.log('🔄 Loading stake information for fallback completed claims...');
              loadStakeInformation(completedClaims);
            }
            
            console.log('✅ Created fallback aggregated data structure');
          }
        }
        if (cachedSettings) setContractSettings(cachedSettings);
        
        // Update cache status
        const timestamp = localStorage.getItem(STORAGE_KEYS.TIMESTAMP);
        const lastUpdated = timestamp ? new Date(parseInt(timestamp)) : null;
        const cacheAge = timestamp ? Date.now() - parseInt(timestamp) : null;
        
        setCacheStatus({
          hasCachedData: true,
          isShowingCached: true,
          isRefreshing: false,
          lastUpdated,
          cacheAge
        });
        
        return true;
      } else {
        console.log('❌ No cached data found');
        setCacheStatus(prev => ({ ...prev, hasCachedData: false, isShowingCached: false }));
        return false;
      }
    } catch (error) {
      console.error('❌ Error loading cached data:', error);
      setCacheStatus(prev => ({ ...prev, hasCachedData: false, isShowingCached: false }));
      return false;
    }
  }, [currentBlock, getNetworkWithSettings, getBridgeInstancesWithSettings, loadStakeInformation]);

  // updateIndividualClaims function removed - no longer needed since we don't do background updates

  // Cache statistics removed from UI - cache still works internally

  // New parallel discovery system
  const loadClaimsAndTransfersParallel = useCallback(async (forceRefresh = false) => {
    // Prevent concurrent executions
    if (loading || isSearching || discoveryState.isDiscovering) {
      console.log('🔍 loadClaimsAndTransfersParallel: Already loading, skipping duplicate call');
      return;
    }

    // Step 1: Try to load cached data first (unless force refresh)
    if (!forceRefresh && isInitialLoad) {
      const hasCachedData = await loadCachedData();
      if (hasCachedData) {
        console.log('✅ Displaying cached data. User can manually refresh if needed.');
        setIsInitialLoad(false);
        return; // Exit early, just show cached data
      }
    }

    console.log('🚀 Starting parallel bridge discovery...');
    setDiscoveryState(prev => ({ ...prev, isDiscovering: true }));
      setLoading(true);
    
    try {
      // Step 1: Get bridge configurations for the selected direction
      const bridgeAddresses = bridgeDirection === 'all' ? null : getBridgeAddressesForDirection(bridgeDirection);
      const targetNetworks = bridgeDirection === 'all' ? null : getNetworksForDirection(bridgeDirection);
      
      console.log('🔍 Bridge direction filter:', bridgeDirection, 'Bridge addresses:', bridgeAddresses, 'Target networks:', targetNetworks);

      // Get all bridge instances
      const allBridges = getBridgeInstancesWithSettings();
      const bridgeConfigs = Object.values(allBridges)
        .filter(bridge => {
          // Filter by direction if specified
          if (bridgeAddresses && !bridgeAddresses.map(addr => addr.toLowerCase()).includes(bridge.address.toLowerCase())) {
            return false;
          }
          return true;
        })
        .map(bridge => {
          // Determine the correct network key based on which network section the bridge belongs to
          // We need to find which network section contains this bridge address
          let networkKey = bridge.homeNetwork; // fallback
          
          // Check which network section this bridge belongs to
          for (const [networkKeyName, networkConfig] of Object.entries(NETWORKS)) {
            if (networkConfig.bridges) {
              for (const [, bridgeConfig] of Object.entries(networkConfig.bridges)) {
                if (bridgeConfig.address === bridge.address) {
                  networkKey = networkKeyName;
                  break;
                }
              }
              if (networkKey !== bridge.homeNetwork) break;
            }
          }
          
          return {
            bridgeAddress: bridge.address,
            networkKey: networkKey,
            bridgeType: bridge.type,
            homeNetwork: bridge.homeNetwork,
            foreignNetwork: bridge.foreignNetwork,
            homeTokenSymbol: bridge.homeTokenSymbol,
            foreignTokenSymbol: bridge.foreignTokenSymbol
          };
        });
      
      console.log(`🔍 Found ${bridgeConfigs.length} bridges to discover`);
      
      // Step 2: Discover all bridge events in parallel
      const discoveryResults = await discoverAllBridgeEvents(bridgeConfigs, {
        limit: 50,
        includeClaimData: false, // We'll load claim data separately
        rangeHours: rangeHours // Use the selected range
      });
      
      console.log('✅ Parallel discovery completed:', discoveryResults.stats);
      
      // Step 3: Update discovery state with raw results
      setDiscoveryState(prev => ({
        ...prev,
        bridgeResults: discoveryResults.bridgeResults,
        discoveryProgress: {
          bridgesCompleted: discoveryResults.stats.successfulBridges,
          totalBridges: discoveryResults.stats.totalBridges,
          eventsFound: discoveryResults.stats.totalEvents,
          transfersFound: discoveryResults.stats.totalTransfers,
          claimsFound: discoveryResults.stats.totalClaims,
          claimDataLoaded: 0,
          totalClaims: discoveryResults.stats.totalClaims
        }
      }));
      
      // Step 4: Aggregate transfers and claims using the aggregation utility
      console.log('🔄 Aggregating transfers and claims...');
      
      const aggregated = aggregateClaimsAndTransfers(discoveryResults.allClaims, discoveryResults.allTransfers);
      
      // Update state with aggregated results
      setDiscoveryState(prev => ({
        ...prev,
        matchedTransfers: [...aggregated.completedTransfers, ...aggregated.suspiciousClaims],
        completedTransfers: aggregated.completedTransfers,
        pendingTransfers: aggregated.pendingTransfers,
        suspiciousClaims: aggregated.suspiciousClaims,
        discoveryProgress: {
          ...prev.discoveryProgress,
          claimDataLoaded: aggregated.completedTransfers.length
        }
      }));
      
      console.log('✅ Aggregation completed');
      
      // Step 5: Set aggregated data structure
      setAggregatedData({
        ...aggregated,
        fraudDetected: aggregated.suspiciousClaims.length > 0,
        stats: {
          totalClaims: discoveryResults.stats.totalClaims,
          totalTransfers: discoveryResults.stats.totalTransfers,
          completedTransfers: aggregated.completedTransfers.length,
          suspiciousClaims: aggregated.suspiciousClaims.length,
          pendingTransfers: aggregated.pendingTransfers.length
        }
      });
      
      // Step 6: Load stake information for completed claims
      const completedClaims = aggregated.completedTransfers
        .filter(t => t.claim)
        .map(t => t.claim);
      
      if (completedClaims.length > 0) {
        console.log('🔄 Loading stake information for completed claims...');
        loadStakeInformation(completedClaims);
      }
      
      console.log('✅ Parallel discovery and aggregation completed');

    } catch (error) {
      console.error('❌ Parallel discovery failed:', error);
      toast.error(`Discovery failed: ${error.message}`);
    } finally {
      setLoading(false);
      setDiscoveryState(prev => ({ ...prev, isDiscovering: false }));
      }
  }, [bridgeDirection, rangeHours, getBridgeInstancesWithSettings, loading, isSearching, discoveryState.isDiscovering, isInitialLoad, loadCachedData, loadStakeInformation]);

  // Legacy discovery system removed - using only parallel discovery system

  // Cache management functions
  const clearCache = useCallback(() => {
    console.log('🗑️ Clearing browser cache...');
    clearCachedData();
    setCacheStatus({
      hasCachedData: false,
      isShowingCached: false,
      isRefreshing: false,
      lastUpdated: null,
      cacheAge: null
    });
    toast.success('Cache cleared successfully');
  }, []);

  const refreshData = useCallback(() => {
    console.log('🔄 Force refreshing data using parallel discovery...');
    setCacheStatus(prev => ({ ...prev, isRefreshing: true }));
    loadClaimsAndTransfersParallel(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed loadClaimsAndTransfersParallel from dependencies to prevent infinite loop

  const searchSelectedDirection = useCallback(async () => {
    console.log('🔍 Starting parallel discovery for direction:', bridgeDirection);
    setIsSearching(true);
    setCacheStatus(prev => ({ ...prev, isRefreshing: true }));
    
    try {
      await loadClaimsAndTransfersParallel(true);
      const directionName = bridgeDirection === 'all' 
        ? 'All Bridge Directions' 
        : getBridgeDirections().find(d => d.id === bridgeDirection)?.name || bridgeDirection;
      toast.success(`Parallel discovery completed for ${directionName}`);
    } catch (error) {
      console.error('❌ Error during parallel discovery:', error);
      toast.error('Failed to discover data for selected direction');
    } finally {
      setIsSearching(false);
      setCacheStatus(prev => ({ ...prev, isRefreshing: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeDirection]); // Removed loadClaimsAndTransfersParallel from dependencies to prevent double execution

  // Check if a claim was recently updated
  const isClaimRecentlyUpdated = useCallback((claim) => {
    const key = `${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum}`;
    const updateTime = claimUpdates.updateTimestamps[key];
    if (!updateTime) return false;
    
    // Consider a claim "recently updated" if it was updated within the last 30 seconds
    const thirtySecondsAgo = Date.now() - 30000;
    return updateTime > thirtySecondsAgo;
  }, [claimUpdates.updateTimestamps]);

  // Callback for when a claim is submitted successfully
  const handleClaimSubmitted = useCallback((claimData) => {
    console.log('🔍 Claim submitted successfully, refreshing claim list:', claimData);
    // Refresh the claim list to show the new claim
    loadClaimsAndTransfersParallel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array since loadClaimsAndTransfersParallel is stable

  // Callback for when a claim is withdrawn successfully
  const handleWithdrawSuccess = useCallback((claimNum) => {
    console.log(`🔍 Withdraw successful for claim #${claimNum}, clearing cache and refreshing claims...`);
    setShowWithdrawModal(false);
    setSelectedClaim(null);
    // Clear cache to ensure fresh data is fetched
    clearAllCachedEvents();
    // Refresh the claims list
    loadClaimsAndTransfersParallel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array since loadClaimsAndTransfersParallel is stable

  // Callback for when a claim is challenged successfully
  const handleChallengeSuccess = useCallback((claimNum) => {
    console.log(`🔍 Challenge successful for claim #${claimNum}, clearing cache and refreshing claims...`);
    setShowChallengeModal(false);
    setSelectedClaim(null);
    // Clear cache to ensure fresh data is fetched
    clearAllCachedEvents();
    // Refresh the claims list
    loadClaimsAndTransfersParallel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array since loadClaimsAndTransfersParallel is stable

  // Manual update for a specific claim
  const updateSpecificClaim = useCallback(async (claim) => {
    const claimKey = `${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum}`;
    
    try {
      // Set updating state for this specific claim
      setClaimUpdates(prev => ({ 
        ...prev, 
        isUpdating: true,
        updatingClaims: new Set([...prev.updatingClaims, claimKey])
      }));
      
      console.log(`🔄 Manually updating claim ${claim.actualClaimNum || claim.claimNum}...`);
      console.log(`🔍 Original claim data:`, {
        amount: claim.amount?.toString(),
        reward: claim.reward?.toString(),
        yesStake: claim.yesStake?.toString(),
        noStake: claim.noStake?.toString(),
        currentOutcome: claim.currentOutcome,
        finished: claim.finished,
        withdrawn: claim.withdrawn
      });
      console.log(`🔍 Claim details:`, {
        bridgeAddress: claim.bridgeAddress,
        bridgeType: claim.bridgeType,
        networkKey: claim.networkKey,
        claimNum: claim.actualClaimNum || claim.claimNum
      });
      
      // Get the network configuration for this claim
      const networkConfig = getNetworkWithSettings(claim.networkKey);
      if (!networkConfig?.rpcUrl) {
        toast.error('Could not find network configuration for this claim');
        return;
      }

      // Get the correct ABI based on bridge type
      const bridgeABI = getBridgeABI(claim.bridgeType);
      console.log(`🔍 Using ABI for bridge type: ${claim.bridgeType}`, {
        bridgeType: claim.bridgeType,
        abiLength: bridgeABI.length,
        hasGetClaim: bridgeABI.some(item => item.includes('getClaim'))
      });
      
      // Create provider and contract instance
      const provider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      const contract = new ethers.Contract(claim.bridgeAddress, bridgeABI, provider);

      // Fetch fresh claim data using getClaim function
      const claimNum = claim.actualClaimNum || claim.claimNum;
      const claimData = await contract.getClaim(claimNum);

      // Update currentBlock to ensure button states are correct
      const block = await provider.getBlock('latest');
      setCurrentBlock(block);
      console.log(`🔍 Updated current block for claim refresh:`, {
        blockNumber: block.number,
        timestamp: block.timestamp
      });

      console.log(`🔍 Raw claim data from contract:`, claimData);

      // The getClaim function returns a tuple, so we need to destructure it
      // Based on the ABI: tuple(uint amount, address recipient_address, uint32 txts, uint32 ts, address claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake)
      const [
        amount,
        recipientAddress,
        txts,
        ts,
        claimantAddress,
        expiryTs,
        periodNumber,
        currentOutcome,
        isLarge,
        withdrawn,
        finished,
        senderAddress,
        data,
        yesStake,
        noStake
      ] = claimData;

      console.log(`🔍 Destructured claim data:`, {
        amount: amount?.toString(),
        recipientAddress,
        txts,
        ts,
        claimantAddress,
        expiryTs,
        periodNumber,
        currentOutcome,
        isLarge,
        withdrawn,
        finished,
        senderAddress,
        data,
        yesStake: yesStake?.toString(),
        noStake: noStake?.toString()
      });

      // Create updated claim object
      // Note: reward, txid, blockNumber, and claimTransactionHash come from NewClaim events, not from getClaim
      // So we preserve the original values for these fields
      const updatedClaim = {
        ...claim,
        // Update fields that come from getClaim
        amount: amount,
        recipientAddress: recipientAddress,
        txts: txts,
        ts: ts,
        claimantAddress: claimantAddress,
        expiryTs: expiryTs,
        periodNumber: periodNumber,
        currentOutcome: currentOutcome,
        isLarge: isLarge,
        withdrawn: withdrawn,
        finished: finished,
        senderAddress: senderAddress,
        data: data,
        yesStake: yesStake,
        noStake: noStake,
        // Preserve fields that come from events (not available in getClaim)
        reward: claim.reward, // Keep original reward from NewClaim event
        txid: claim.txid, // Keep original txid from NewClaim event
        blockNumber: claim.blockNumber, // Keep original blockNumber from NewClaim event
        claimTransactionHash: claim.claimTransactionHash // Keep original claimTransactionHash from NewClaim event
      };

      // Update the specific claim in state
      setClaims(prevClaims => 
        prevClaims.map(c => 
          c.bridgeAddress === claim.bridgeAddress && 
          (c.actualClaimNum || c.claimNum) === claimNum 
            ? updatedClaim 
            : c
        )
      );

      // Also update the claim in aggregatedData if it exists
      setAggregatedData(prevAggregated => {
        if (!prevAggregated) return prevAggregated;
        
        const updatedAggregated = { ...prevAggregated };
        
        // Update in completedTransfers
        updatedAggregated.completedTransfers = prevAggregated.completedTransfers.map(c => 
          c.bridgeAddress === claim.bridgeAddress && 
          (c.actualClaimNum || c.claimNum) === claimNum 
            ? { ...c, ...updatedClaim }
            : c
        );
        
        // Update in suspiciousClaims
        updatedAggregated.suspiciousClaims = prevAggregated.suspiciousClaims.map(c => 
          c.bridgeAddress === claim.bridgeAddress && 
          (c.actualClaimNum || c.claimNum) === claimNum 
            ? { ...c, ...updatedClaim }
            : c
        );
        
        return updatedAggregated;
      });

      // Mark as updated
      const key = `${claim.bridgeAddress}-${claimNum}`;
      setClaimUpdates(prev => ({
        ...prev,
        updatedClaims: new Set([...prev.updatedClaims, key]),
        updateTimestamps: {
          ...prev.updateTimestamps,
          [key]: Date.now()
        }
      }));

      toast.success(`Claim #${claimNum} updated from contract`);
      console.log(`Claim #${claimNum} updated successfully:`, {
        amount: amount.toString(),
        reward: updatedClaim.reward?.toString(),
        currentOutcome,
        finished,
        withdrawn,
        yesStake: yesStake.toString(),
        noStake: noStake.toString(),
        txid: updatedClaim.txid
      });
      console.log(`✅ Final updated claim object:`, {
        amount: updatedClaim.amount?.toString(),
        reward: updatedClaim.reward?.toString(),
        yesStake: updatedClaim.yesStake?.toString(),
        noStake: updatedClaim.noStake?.toString(),
        currentOutcome: updatedClaim.currentOutcome,
        finished: updatedClaim.finished,
        withdrawn: updatedClaim.withdrawn,
        txid: updatedClaim.txid
      });
    } catch (error) {
      console.error('Error updating specific claim:', error);
      toast.error(`Failed to update claim: ${error.message}`);
    } finally {
      // Clear updating state for this specific claim
      setClaimUpdates(prev => ({ 
        ...prev, 
        isUpdating: false,
        updatingClaims: new Set([...prev.updatingClaims].filter(key => key !== claimKey))
      }));
    }
  }, [getNetworkWithSettings, getBridgeABI]);

  // getTimeSinceUpdate function removed - no longer needed since Updated badge was removed



  // Load contract settings on mount
  useEffect(() => {
    loadContractSettings();
  }, [loadContractSettings]);

  // Clear user stakes when account changes
  useEffect(() => {
    setUserStakes({});
  }, [account]);

  // No automatic loading - only manual search via button
  // useEffect(() => {
  //   // Disabled automatic loading - users must click search button
  //   // loadClaimsAndTransfers();
  // }, [filter]);

  // Auto-refresh disabled - users can manually refresh when needed
  // This prevents unnecessary network requests and gives users control

  // No wallet connection required to view claims
  // Wallet connection is only needed for actions like withdraw/challenge

  const getClaimStatus = (claim) => {
    if (!currentBlock) {
      // Fallback logic when currentBlock is not available
      if (claim.finished) {
        if (claim.currentOutcome === 0 && !claim.withdrawn) {
          return 'withdrawn';
        }
        if (claim.currentOutcome === 1 && claim.withdrawn) {
          return 'withdrawn';
        }
        return 'finished';
      }
      // If not finished and no currentBlock, assume active
      return 'active';
    }
    
    const now = currentBlock.timestamp;
    // Handle both BigNumber and regular number types for expiryTs
    const expiryTime = claim.expiryTs ? 
      (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
      0;
    
    if (claim.finished) {
      // For NO outcomes: show "withdrawn" if finished=true and withdrawn=false
      if (claim.currentOutcome === 0 && !claim.withdrawn) {
        return 'withdrawn';
      }
      
      // For YES outcomes: use the contract's withdrawn flag (original claimant logic)
      if (claim.currentOutcome === 1 && claim.withdrawn) {
        return 'withdrawn';
      }
      
      // Default to finished if not withdrawn
      return 'finished';
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


  const getTimeRemaining = (expiryTs) => {
    // Use currentBlock timestamp if available, otherwise fallback to current time
    const now = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
    
    // Handle BigNumber deserialization (same pattern as formatAmount)
    let expiryTime = 0;
    if (expiryTs) {
      if (typeof expiryTs.toNumber === 'function') {
        // Live BigNumber object
        expiryTime = expiryTs.toNumber();
      } else if (typeof expiryTs === 'number') {
        // Regular number
        expiryTime = expiryTs;
      } else if (typeof expiryTs === 'string') {
        // String representation
        expiryTime = parseInt(expiryTs, 10);
      } else if (typeof expiryTs === 'object' && expiryTs !== null) {
        // Deserialized BigNumber object - try to extract the value
        if (expiryTs._hex) {
          expiryTime = parseInt(expiryTs._hex, 16);
        } else if (expiryTs.hex) {
          expiryTime = parseInt(expiryTs.hex, 16);
        } else if (expiryTs.toString && typeof expiryTs.toString === 'function') {
          expiryTime = parseInt(expiryTs.toString(), 10);
        } else {
          expiryTime = 0;
        }
      }
    }
    
    
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
              Mine
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
              onClick={() => setFilter('active')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              Active
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
              Suspicious
            </button>
            
          </div>
          
          {/* Bridge Direction Selector */}
          <div className="flex items-center gap-2">
            <select
              value={bridgeDirection}
              onChange={(e) => setBridgeDirection(e.target.value)}
              className="bg-dark-800 border border-dark-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-w-[200px]"
            >
              <option value="all">All Bridge Directions</option>
              {getBridgeDirections().map((direction) => (
                <option key={direction.id} value={direction.id}>
                  {direction.name}
                </option>
              ))}
            </select>
            
            {/* Range Hours Selector */}
            <select
              value={rangeHours}
              onChange={(e) => setRangeHours(parseInt(e.target.value))}
              className="bg-dark-800 border border-dark-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-w-[140px]"
              title="Select time range for data discovery"
            >
              <option value={6}>Last 6 hours</option>
              <option value={12}>Last 12 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={72}>Last 72 hours</option>
              <option value={96}>Last 4 days</option>
              <option value={120}>Last 5 days</option>
              <option value={168}>Last week</option>
              <option value={240}>Last 10 days</option>
              <option value={336}>Last 2 weeks</option>
            </select>
            
            <button
              onClick={searchSelectedDirection}
              disabled={isSearching}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isSearching
                  ? 'bg-dark-700 text-secondary-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700 cursor-pointer'
              }`}
              title="Search for claims and transfers in selected direction"
            >
              {isSearching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Searching...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Search
                </>
              )}
            </button>
          </div>
          
        </div>
      </div>

      {/* Prominent update notification removed - using green link in cache status instead */}

      {/* Cache Status */}
      {cacheStatus.hasCachedData && (
        <div className="mb-4 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-secondary-400">Data Status:</span>
              {cacheStatus.isShowingCached ? (
                <>
                  {cacheStatus.lastUpdated && (
              <span className="text-secondary-400">
                      (Updated {Math.round((Date.now() - cacheStatus.lastUpdated.getTime()) / 60000)}m ago)
              </span>
                  )}
                </>
              ) : (
                <span className="text-green-400">Fresh data loaded</span>
              )}
              <span className="text-secondary-400">•</span>
              <span className="text-blue-400">Range: {rangeHours}h</span>
            </div>
            <div className="flex items-center gap-2">
              {cacheStatus.isRefreshing ? (
                <>
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-yellow-400">Refreshing...</span>
                </>
              ) : cacheStatus.isShowingCached ? (
                <>
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-xs text-blue-400">Cached</span>
                </>
              ) : (
                <>
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs text-green-400">Fresh</span>
                </>
              )}
              <button
                onClick={refreshData}
                className="text-xs text-primary-400 hover:text-primary-300 underline"
                title="Refresh current data from contracts"
              >
                Refresh
              </button>
              {cacheStatus.isShowingCached && (
                <button
                  onClick={() => {
                    console.log('🔄 Manual update triggered by user');
                    refreshData(); // Use the centralized refresh function
                  }}
                  className="text-xs text-green-400 hover:text-green-300 underline ml-2"
                  title="Scan through the blockchain"
                >
                  Discover
                </button>
              )}
              <button
                onClick={clearCache}
                className="text-xs text-red-400 hover:text-red-300 underline"
                title="Clear cache"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Parallel Discovery Progress */}
      {discoveryState.isDiscovering && (
        <div className="mb-4 p-3 bg-dark-800 rounded-lg border border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-secondary-400">Parallel Discovery:</span>
              <span className="text-blue-400">
                Bridges: {discoveryState.discoveryProgress.bridgesCompleted}/{discoveryState.discoveryProgress.totalBridges}
              </span>
              <span className="text-secondary-400">•</span>
              <span className="text-green-400">
                Claims: {discoveryState.discoveryProgress.claimDataLoaded}/{discoveryState.discoveryProgress.totalClaims}
              </span>
              <span className="text-secondary-400">•</span>
              <span className="text-purple-400">Range: {rangeHours}h</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-blue-400">Discovering...</span>
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-dark-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${discoveryState.discoveryProgress.totalBridges > 0 
                    ? (discoveryState.discoveryProgress.bridgesCompleted / discoveryState.discoveryProgress.totalBridges) * 100 
                    : 0}%` 
                }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {(loading || isSearching) && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-secondary-400">
            {isSearching 
              ? `Searching ${getBridgeDirections().find(d => d.id === bridgeDirection)?.name || bridgeDirection}...`
              : cacheStatus.isShowingCached 
                ? `Refreshing data...`
                : `Discovering transfers...`
            }
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !isSearching && (!aggregatedData || (aggregatedData.completedTransfers.length === 0 && aggregatedData.suspiciousClaims.length === 0 && aggregatedData.pendingTransfers.length === 0)) && (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <Clock className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              {filter === 'suspicious' ? 'No Suspicious Claims Found' :
               filter === 'pending' ? 'No Pending Transfers Found' :
               filter === 'active' ? 'No Active Claims Found' :
               'No Transactions Found'}
            </h3>
            <p className="text-secondary-400 mb-6">
              {filter === 'my' 
                ? (account ? 'You don\'t have any claims in the selected bridge direction' : 'Connect your wallet to see your claims')
                : filter === 'suspicious'
                ? 'No suspicious claims detected in the selected bridge direction'
                : filter === 'pending'
                ? 'No pending transfers found in the selected bridge direction'
                : filter === 'active'
                ? 'No active claims found in the selected bridge direction'
                : 'Select a bridge direction and click Search to discover transactions'
              }
            </p>
            {!aggregatedData && (
              <div className="bg-dark-800 border border-dark-700 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-secondary-300 mb-3">
                  To get started:
                </p>
                <ol className="text-sm text-secondary-400 text-left space-y-2">
                  <li>1. Select a bridge direction from the dropdown above</li>
                  <li>2. Click the "Search" button to discover transactions</li>
                  <li>3. View claims and transfers for that specific bridge pair</li>
                </ol>
              </div>
            )}
            {!account && (
              <p className="text-xs text-secondary-500 mt-4">
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
              case 'active':
                // Filter for active claims (not finished, not expired, not withdrawn)
                displayData = [...aggregatedData.completedTransfers, ...aggregatedData.suspiciousClaims]
                  .filter(claim => {
                    const status = getClaimStatus(claim);
                    return status === 'active';
                  });
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





          return displayData.map((item, index) => {
            // Handle both claims and transfers
            const isTransfer = item.eventType === 'NewExpatriation' || item.eventType === 'NewRepatriation'; // Check if this is a transfer (not a claim)
            const isSuspicious = item.isFraudulent;
            // A pending transfer has eventType 'NewExpatriation' or 'NewRepatriation' but no claimNum
            // A completed claim has claimNum and eventType 'NewClaim' or no eventType
            const isPending = isTransfer && !item.claimNum;
            
            
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
            
          
          const status = getClaimStatus(claim);
          
          
          
          return (
            <motion.div
              key={`${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum || claim.transactionHash}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                ...(isClaimRecentlyUpdated(claim) && {
                  scale: [1, 1.02, 1],
                  transition: { duration: 0.3 }
                })
              }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.1 }}
              className={`card mb-4 transition-all duration-300 ${
                isSuspicious ? 'border-red-500 bg-red-900/10' : 
                isPending ? 'border-yellow-500 bg-yellow-900/10' : 
                status === 'withdrawn' ? 'border-green-500 bg-green-900/10' :
                isClaimRecentlyUpdated(claim) ? 'border-green-400 bg-green-900/5' :
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
                    {isSuspicious && status === 'withdrawn' && <CheckCircle className="w-4 h-4 text-green-500" />}
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
                        Assisted
                      </span>
                    )}
                    {!isPending && !isTransfer && !isThirdPartyClaim(claim) && claim.claimant_address && (
                      <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                        Self-claimed
                      </span>
                    )}
                    {/* Updated indicator removed - redundant with refresh button */}
                    {/* Manual refresh button for individual claims */}
                    {!isPending && !isTransfer && (
                        <button
                          onClick={() => updateSpecificClaim(claim)}
                          className="p-1 hover:bg-blue-600/20 rounded transition-colors"
                          title="Refresh this claim's data from contract"
                          disabled={claimUpdates.updatingClaims.has(`${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum}`)}
                        >
                          <RefreshCw 
                            className={`w-4 h-4 text-blue-400 hover:text-blue-300 ${
                              claimUpdates.updatingClaims.has(`${claim.bridgeAddress}-${claim.actualClaimNum || claim.claimNum}`) ? 'animate-spin' : ''
                            }`} 
                          />
                        </button>
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
                                  const tokenAddress = getTransferTokenAddress(claim.transfer);
                                  const formatted = formatAmount(claim.transfer.amount, decimals, tokenAddress);
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
                                    const tokenAddress = getTransferTokenAddress(claim.transfer);
                                    const formatted = formatAmount(claim.transfer.reward, decimals, tokenAddress);
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
                              <span className="text-secondary-400">Timestamp:</span>
                              <span className="text-white ml-2">
                                {claim.transfer.timestamp ? new Date(claim.transfer.timestamp * 1000).toLocaleString() : 'N/A'}
                              </span>
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
                                  const tokenAddress = getTransferTokenAddress(claim);
                                  const formatted = formatAmount(claim.amount, decimals, tokenAddress);
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
                                    const tokenAddress = getTransferTokenAddress(claim);
                                    const formatted = formatAmount(claim.reward, decimals, tokenAddress);
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
                              <span className="text-secondary-400">Transfer Txid:</span>
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
                              <span className="text-secondary-400">Timestamp:</span>
                              <span className="text-white ml-2">
                                {claim.timestamp ? new Date(claim.timestamp * 1000).toLocaleString() : 'N/A'}
                              </span>
                              {(() => {
                                const matchStatus = getFieldMatchStatus(claim, 'timestamp');
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
                            <div>
                              <span className="text-secondary-400">Claim Block:</span>
                              <span className="text-white ml-2">{claim.blockNumber || 'N/A'}</span>
                            </div>
                            {claim.claimTransactionHash && (
                              <div>
                                <span className="text-secondary-400">Claim Tx Hash:</span>
                                <span className="text-white ml-2 font-mono">
                                  {formatAddress(claim.claimTransactionHash)}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(claim.claimTransactionHash, 'Claim transaction hash')}
                                  className="ml-2 p-1 hover:bg-dark-700 rounded transition-colors"
                                  title="Copy claim transaction hash"
                                >
                                  <Copy className="w-3 h-3 text-secondary-400 hover:text-white" />
                                </button>
                              </div>
                            )}
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
                            const tokenAddress = getTransferTokenAddress(claim);
                            const formatted = formatAmount(claim.amount, decimals, tokenAddress);
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
                              const tokenAddress = getTransferTokenAddress(claim);
                              const formatted = formatAmount(claim.reward, decimals, tokenAddress);
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
                            const tokenAddress = getTransferTokenAddress(claim);
                            const formatted = formatAmount(claim.amount, decimals, tokenAddress);
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
                              const tokenAddress = getTransferTokenAddress(claim);
                              const formatted = formatAmount(claim.reward, decimals, tokenAddress);
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
                      {/* Debug: Show raw claim data if missing */}
                      {(!claim.amount || !claim.yesStake || !claim.noStake) && (
                        <div className="col-span-full mb-3 p-2 bg-yellow-900/20 border border-yellow-500/50 rounded text-xs">
                          <div className="text-yellow-400 font-medium mb-1">⚠️ Missing Claim Data:</div>
                          <div className="text-yellow-300">
                            Amount: {claim.amount ? '✅' : '❌'} | 
                            Reward: {claim.reward ? '✅' : '❌'} | 
                            YES Stake: {claim.yesStake ? '✅' : '❌'} | 
                            NO Stake: {claim.noStake ? '✅' : '❌'} |
                            Current Outcome: {claim.currentOutcome !== undefined ? '✅' : '❌'} |
                            Finished: {claim.finished !== undefined ? '✅' : '❌'}
                          </div>
                        </div>
                      )}
                      
                      {/* Debug: Show currentBlock status - removed warning message */}
                      
                      <div className="col-span-full">
                      <div>
                      <h4 className="text-sm font-medium text-secondary-300 mb-3">
                        <span className="text-secondary-400 mb-3">Period {claim.period_number !== undefined ? `#${claim.period_number + 1} -` : ''}</span>
                        <span className="text-white ml-2 mb-3">
                          {getTimeRemaining(claim.expiryTs)}
                        </span>
                      </h4>
                      </div>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => {
                              if (!account) {
                                toast.error('Please connect your wallet to challenge claims');
                                return;
                              }
                              if (claim.currentOutcome !== 1) {
                                handleChallenge(claim);
                              }
                            }}
                            disabled={claim.currentOutcome === 1 || !canChallengeClaim(claim)}
                            className={`p-4 rounded-lg border-2 transition-colors ${
                              claim.currentOutcome === 1
                                ? 'border-success-500 bg-success-500/10 text-success-500 cursor-default'
                                : canChallengeClaim(claim)
                                  ? 'border-dark-700 bg-dark-800 text-secondary-400 hover:border-success-500 hover:bg-success-500/5 hover:text-success-400 cursor-pointer'
                                  : 'border-dark-700 bg-dark-800 text-secondary-400 cursor-not-allowed opacity-50'
                            }`}
                          >
                            <div className="text-center">
                              <div className="text-lg font-semibold mb-1">YES</div>
                              <div className="text-xs text-secondary-400">
                                {(() => {
                                  const stakeAmount = claim.yesStake;
                                  const stakeDecimals = getStakeTokenDecimals(claim);
                                  const stakeAddress = getStakeTokenAddress(claim);
                                  
                                  return stakeAmount ? formatAmount(stakeAmount, stakeDecimals, stakeAddress) : '0';
                                })()} {getStakeTokenSymbol(claim)}
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              if (!account) {
                                toast.error('Please connect your wallet to challenge claims');
                                return;
                              }
                              if (claim.currentOutcome !== 0) {
                                handleChallenge(claim);
                              }
                            }}
                            disabled={claim.currentOutcome === 0 || !canChallengeClaim(claim)}
                            className={`p-4 rounded-lg border-2 transition-colors ${
                              claim.currentOutcome === 0
                                ? 'border-red-500 bg-red-500/10 text-red-500 cursor-default'
                                : canChallengeClaim(claim)
                                  ? 'border-dark-700 bg-dark-800 text-secondary-400 hover:border-red-500 hover:bg-red-500/5 hover:text-red-400 cursor-pointer'
                                  : 'border-dark-700 bg-dark-800 text-secondary-400 cursor-not-allowed opacity-50'
                            }`}
                          >
                            <div className="text-center">
                              <div className="text-lg font-semibold mb-1">NO</div>
                              <div className="text-xs text-secondary-400">
                                {(() => {
                                  const stakeAmount = claim.noStake;
                                  const stakeDecimals = getStakeTokenDecimals(claim);
                                  const stakeAddress = getStakeTokenAddress(claim);
                                  
                                  return stakeAmount ? formatAmount(stakeAmount, stakeDecimals, stakeAddress) : '0';
                                })()} {getStakeTokenSymbol(claim)}
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>
                      

                      
                    </div>
                  )}


                  {/* Action Buttons */}
                  <div className="mt-3 flex gap-2">
                    {/* Create Claim Button for Pending Transfers */}
                    {isPending && (
                      <>
                        {isTransferReadyToClaim(claim) ? (
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
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-2 rounded-md">
                            <Clock className="w-4 h-4" />
                            <span>
                              Finalizing... will be available to claim in ~ {getTimeUntilClaimable(claim) || 'calculating...'}
                            </span>
                          </div>
                        )}
                      </>
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
                    
                  </div>
                  
                  {/* Info for claims that can't be withdrawn */}
                  {claim.finished && !claim.withdrawn && isCurrentUserRecipient(claim) && !canWithdrawClaim(claim) && (
                    <div className="mt-3">
                      <div className="bg-gray-700 rounded-lg p-3">
                        <p className="text-gray-400 text-sm">
                          ⚠️ This claim cannot be withdrawn. You may not have stakes on the current outcome or the claim may not be expired yet.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Info for non-expired claims */}
                  {claim.finished && !claim.withdrawn && isCurrentUserRecipient(claim) && !canWithdrawClaim(claim) && (
                    <div className="mt-3">
                      <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
                        <p className="text-yellow-400 text-sm">
                          ⏰ This claim is not yet expired. You can withdraw it once it expires.
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
        onClaimSubmitted={handleClaimSubmitted}
      />

      {/* Withdraw Claim Dialog */}
      {showWithdrawModal && selectedClaim && (
        <WithdrawClaim
          claim={selectedClaim}
          onWithdrawSuccess={handleWithdrawSuccess}
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
          onChallengeSuccess={handleChallengeSuccess}
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
export { addTransferEventToStorage };

