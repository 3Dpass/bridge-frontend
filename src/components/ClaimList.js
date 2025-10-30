import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { useNetworkSwitcher } from '../hooks/useNetworkSwitcher';
import { NETWORKS, getBridgeDirections, getBridgeAddressesForDirection, getNetworksForDirection } from '../config/networks';
import { discoverAllBridgeEvents } from '../utils/parallel-bridge-discovery';
import { aggregateClaimsAndTransfers } from '../utils/aggregate-claims-transfers';
import { convertActualToDisplay } from '../utils/decimal-converter';
import { normalizeAmount } from '../utils/data-normalizer';
import { fetchClaimDetails } from '../utils/claim-details-fetcher.js';
import { getBridgeABI, getCounterstakeABI, createContract } from '../utils/contract-factory.js';
import { clearAllCachedEvents, getCachedTransfers, getCachedClaims, getCachedAggregated, getCachedSettings, getCacheTimestamp, setCachedData, STORAGE_KEYS } from '../utils/unified-event-cache';
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
  RefreshCw,
  Clock9
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import NewClaim from './NewClaim';
import WithdrawClaim from './WithdrawClaim';
import Challenge from './Challenge';

// Note: Cache helpers now imported from unified-event-cache

const clearCachedData = () => {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn('Failed to clear cached data:', error);
  }
};

// Note: addTransferEventToStorage now imported from unified-event-cache

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

const ClaimList = ({ activeTab }) => {
  const { account, network, getNetworkWithSettings } = useWeb3();
  const { getBridgeInstancesWithSettings, getTokenDecimalsDisplayMultiplier, getAllNetworksWithSettings } = useSettings();
  const {
    getRequiredNetworkForTransfer,
    getRequiredNetworkForClaim,
    checkAndSwitchNetwork
  } = useNetworkSwitcher();
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
    isLoadingCached: false,
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
  // Refs to avoid re-renders/infinite loops during bulk updates
  const bulkProcessedRef = useRef(new Set());
  const bulkRunningRef = useRef(false);
  // Cache stats removed from UI - cache still works internally for performance

  // Helper function to get the correct ABI based on bridge type
  // Wrapper for getBridgeABI with COUNTERSTAKE_ABI fallback
  const getBridgeABIWithFallback = useCallback((bridgeType) => {
    try {
      return getBridgeABI(bridgeType);
    } catch (error) {
      console.warn(`Unknown bridge type: ${bridgeType}, using COUNTERSTAKE_ABI as fallback`);
      return getCounterstakeABI();
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
            const bridgeABI = getBridgeABIWithFallback(bridge.type);
            const bridgeContract = createContract(bridge.address, bridgeABI, provider);
            
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
  }, [getBridgeInstancesWithSettings, getNetworkWithSettings, getBridgeABIWithFallback]);

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

  const handleChallenge = useCallback(async (claim) => {
    console.log('🔘 Challenge button clicked for claim:', getClaimNumber(claim));
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetworkForClaim(claim);
    const switchSuccess = await checkAndSwitchNetwork(requiredNetwork);

    if (!switchSuccess) {
      return;
    }

    setSelectedClaim(claim);
    setShowChallengeModal(true);
  }, [getRequiredNetworkForClaim, checkAndSwitchNetwork]);




  // All useCallback hooks must be at the top level
  const formatAmount = useCallback((amount, decimals = 18, tokenAddress = null) => {
    try {
      
      const ethers = require('ethers');
      
      // Use normalizeAmount utility to handle BigNumber objects, strings, numbers, and deserialized objects
      const amountString = normalizeAmount(amount);
      
      // Check if the amount string is actually zero
      if (amountString === '0' || amountString === '0x0') {
        return '0.000000';
      }
      
      const rawValue = parseFloat(ethers.utils.formatUnits(amountString, decimals));
      
      // Use convertActualToDisplay utility for multiplier handling
      const displayValue = convertActualToDisplay(rawValue.toString(), decimals, tokenAddress, getTokenDecimalsDisplayMultiplier);
      
      // If multiplier was applied, return the formatted result
      if (tokenAddress && getTokenDecimalsDisplayMultiplier(tokenAddress)) {
        return displayValue;
      }
      
      // Otherwise, apply dynamic decimal formatting based on value magnitude
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
    try {
      if (!claim?.bridgeAddress) return 'Unknown';
      const bridges = getBridgeInstancesWithSettings();
      const bridge = Object.values(bridges).find(b => b.address?.toLowerCase() === claim.bridgeAddress.toLowerCase());
      if (bridge?.stakeTokenSymbol) return bridge.stakeTokenSymbol;
    } catch (_) {}
    return 'Unknown';
  }, [getBridgeInstancesWithSettings]);

  const getStakeTokenAddress = useCallback((claim) => {
    try {
      if (!claim?.bridgeAddress) return null;
      const bridges = getBridgeInstancesWithSettings();
      const bridge = Object.values(bridges).find(b => b.address?.toLowerCase() === claim.bridgeAddress.toLowerCase());
      if (bridge?.stakeTokenAddress) return bridge.stakeTokenAddress;
      // If only symbol is present, try to resolve within the bridge's home network tokens
      const symbol = bridge?.stakeTokenSymbol;
      if (symbol) {
        const homeCfg = getNetworkWithSettings(bridge.homeNetwork || claim.networkKey || network?.symbol);
        const token = homeCfg?.tokens?.[symbol];
        if (token?.address) return token.address;
      }
    } catch (_) {}
    return null;
  }, [getBridgeInstancesWithSettings, getNetworkWithSettings, network?.symbol]);

  const getTransferTokenAddress = useCallback((claim) => {
    // If we already have a tokenAddress stored, use it (for pending transfers)
    if (claim.tokenAddress) {
      return claim.tokenAddress;
    }
    
    // Get transfer token symbol first
    const tokenSymbol = getTransferTokenSymbol(claim);
    
    // Try to get address from current network tokens first
    const currentNetworkConfig = getNetworkWithSettings(network?.symbol);
    if (currentNetworkConfig && currentNetworkConfig.tokens) {
      const token = currentNetworkConfig.tokens[tokenSymbol];
      if (token && token.address) {
        return token.address;
      }
    }
    
    // Try to get address from other networks using settings context
    const allNetworks = getAllNetworksWithSettings();
    for (const [, networkConfig] of Object.entries(allNetworks)) {
      if (networkConfig && networkConfig.tokens && networkConfig.tokens[tokenSymbol]) {
        const token = networkConfig.tokens[tokenSymbol];
        if (token && token.address) {
          return token.address;
        }
      }
    }
    
    return null;
  }, [network?.symbol, getNetworkWithSettings, getAllNetworksWithSettings, getTransferTokenSymbol]);

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
      const bridgeABI = getBridgeABIWithFallback(claim.bridgeType);
      const contract = createContract(claim.bridgeAddress, bridgeABI, provider);

      // Get the current outcome (0 = NO, 1 = YES)
      const currentOutcome = claim.currentOutcome;
      
      // Call the contract's stakes function to get user's stake on the current outcome
      // stakes(claim_num, side, address) where side is 0 for NO, 1 for YES
      const claimNum = getClaimNumber(claim);
      if (!claimNum) return false;
      const claimNumBigNumber = ethers.BigNumber.from(claimNum);
      const userStake = await contract.stakes(claimNumBigNumber, currentOutcome, userAddress);
      
      // Check if user has any stake on the current outcome
      const hasStake = userStake && userStake.gt(0);
      
      return hasStake;
    } catch (error) {
      console.error('🔍 Error checking user stakes:', error);
      return false;
    }
  }, [getNetworkWithSettings, getBridgeABIWithFallback]);

  // Function to load stake information for all claims
  const loadStakeInformation = useCallback(async (claims) => {
    if (!account || !claims || claims.length === 0) {
      return;
    }
    
    const stakePromises = claims.map(async (claim) => {
      const claimNum = getClaimNumber(claim);
      if (!claim.bridgeAddress || !claimNum) {
        return null;
      }

      const claimKey = `${claim.bridgeAddress}-${claimNum}-${account}`;
      
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
    const claimNum = getClaimNumber(claim);
    if (!claimNum) return false;
    const claimKey = `${claim.bridgeAddress}-${claimNum}-${account}`;
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
    console.log('🔘 Withdraw button clicked for claim:', getClaimNumber(claim));
    
    // Check if we need to switch networks first
    const requiredNetwork = getRequiredNetworkForClaim(claim);
    const switchSuccess = await checkAndSwitchNetwork(requiredNetwork);

    if (!switchSuccess) {
      return;
    }

    setSelectedClaim(prepareClaimForWithdraw(claim));
    setShowWithdrawModal(true);
  }, [getRequiredNetworkForClaim, checkAndSwitchNetwork, prepareClaimForWithdraw]);

  // Load cached data from browser storage
  const loadCachedData = useCallback(async () => {
    try {
      console.log('🔍 Loading cached data from browser storage...');
      setCacheStatus(prev => ({ ...prev, isLoadingCached: true }));
      
      const cachedClaims = getCachedClaims();
      const cachedTransfers = getCachedTransfers();
      const cachedAggregated = getCachedAggregated();
      const cachedSettings = getCachedSettings();
      
      if (cachedClaims || cachedTransfers || cachedAggregated) {
        console.log('✅ Found cached data:', {
          claims: cachedClaims?.length || 0,
          transfers: cachedTransfers?.length || 0,
          aggregated: !!cachedAggregated
        });
        
        // Set cached data immediately, but don't override recently updated claims
        if (cachedClaims) {
          console.log('🔍 Loading cached claims:', cachedClaims.length, 'claims');
          
          // Filter out claims that have been recently updated (within last 5 minutes)
          const recentlyUpdatedClaims = new Set();
          Object.keys(claimUpdates.updateTimestamps).forEach(key => {
            const updateTime = claimUpdates.updateTimestamps[key];
            const fiveMinutesAgo = Date.now() - 300000; // 5 minutes
            if (updateTime > fiveMinutesAgo) {
              recentlyUpdatedClaims.add(key);
            }
          });
          
          const filteredCachedClaims = cachedClaims.filter(claim => {
            const claimKey = `${claim.bridgeAddress}-${getClaimNumber(claim)}`;
            return !recentlyUpdatedClaims.has(claimKey);
          });
          
          console.log(`🔍 Filtered cached claims: ${filteredCachedClaims.length} (excluded ${cachedClaims.length - filteredCachedClaims.length} recently updated)`);
          
          // Debug: Log first few cached claims to see their structure
          if (filteredCachedClaims.length > 0) {
            console.log('🔍 First cached claim structure:', {
              claimNum: filteredCachedClaims[0].claimNum,
              actualClaimNum: filteredCachedClaims[0].actualClaimNum,
              claimNumType: typeof filteredCachedClaims[0].claimNum,
              actualClaimNumType: typeof filteredCachedClaims[0].actualClaimNum,
              amount: filteredCachedClaims[0].amount?.toString(),
              reward: filteredCachedClaims[0].reward?.toString(),
              yesStake: filteredCachedClaims[0].yesStake?.toString(),
              noStake: filteredCachedClaims[0].noStake?.toString(),
              currentOutcome: filteredCachedClaims[0].currentOutcome,
              finished: filteredCachedClaims[0].finished,
              withdrawn: filteredCachedClaims[0].withdrawn,
              txid: filteredCachedClaims[0].txid,
              blockNumber: filteredCachedClaims[0].blockNumber,
              claimTransactionHash: filteredCachedClaims[0].claimTransactionHash
            });
            
            // Test getClaimNumber function
            const testClaimNum = getClaimNumber(filteredCachedClaims[0]);
            console.log('🔍 getClaimNumber test result:', testClaimNum, 'type:', typeof testClaimNum);
            
            // Debug: Check if reward is actually zero or missing
            console.log('🔍 Reward field analysis:', {
              reward: filteredCachedClaims[0].reward,
              rewardType: typeof filteredCachedClaims[0].reward,
              rewardString: filteredCachedClaims[0].reward?.toString(),
              isZero: filteredCachedClaims[0].reward === 0 || filteredCachedClaims[0].reward === '0' || filteredCachedClaims[0].reward === '0x0',
              isNull: filteredCachedClaims[0].reward === null,
              isUndefined: filteredCachedClaims[0].reward === undefined
            });
            
            // Debug: Check if stakes are actually zero or missing
            console.log('🔍 Stakes field analysis:', {
              yesStake: filteredCachedClaims[0].yesStake,
              yesStakeType: typeof filteredCachedClaims[0].yesStake,
              yesStakeString: filteredCachedClaims[0].yesStake?.toString(),
              yesStakeIsZero: filteredCachedClaims[0].yesStake === 0 || filteredCachedClaims[0].yesStake === '0' || filteredCachedClaims[0].yesStake === '0x0',
              noStake: filteredCachedClaims[0].noStake,
              noStakeType: typeof filteredCachedClaims[0].noStake,
              noStakeString: filteredCachedClaims[0].noStake?.toString(),
              noStakeIsZero: filteredCachedClaims[0].noStake === 0 || filteredCachedClaims[0].noStake === '0' || filteredCachedClaims[0].noStake === '0x0'
            });
          }
          setClaims(filteredCachedClaims);
          
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
          // We have cached completed transfers, but need to process incomplete data fresh
          console.log('🔍 Found cached completed transfers:', cachedAggregated.completedTransfers.length);
          
          // Process all raw data through fresh aggregation to get incomplete/suspicious cases
          let freshAggregated = null;
          if ((cachedClaims && cachedClaims.length > 0) || (cachedTransfers && cachedTransfers.length > 0)) {
            console.log('🔍 Processing fresh aggregation for incomplete data...');
            try {
              freshAggregated = aggregateClaimsAndTransfers(cachedClaims || [], cachedTransfers || []);
            } catch (error) {
              console.error('❌ Error in fresh aggregation:', error);
            }
          }
          
          // Merge cached completed transfers with fresh aggregation results
          const mergedAggregated = {
            completedTransfers: cachedAggregated.completedTransfers, // Use cached completed transfers
            suspiciousClaims: freshAggregated?.suspiciousClaims || [], // Use fresh suspicious claims
            pendingTransfers: freshAggregated?.pendingTransfers || [], // Use fresh pending transfers
            fraudDetected: (freshAggregated?.suspiciousClaims?.length || 0) > 0,
            stats: {
              totalClaims: (cachedClaims?.length || 0) + (freshAggregated?.claims?.length || 0),
              totalTransfers: (cachedTransfers?.length || 0) + (freshAggregated?.transfers?.length || 0),
              completedTransfers: cachedAggregated.completedTransfers.length,
              suspiciousClaims: freshAggregated?.suspiciousClaims?.length || 0,
              pendingTransfers: freshAggregated?.pendingTransfers?.length || 0
            }
          };
          
          setAggregatedData(mergedAggregated);
          
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
            // For fallback, we should NOT cache incomplete data
            // Only process through aggregation but don't cache the result
            console.log('🔍 Processing fallback aggregation (not caching incomplete data)...');
            const fallbackAggregated = aggregateClaimsAndTransfers(cachedClaims || [], cachedTransfers || []);
            setAggregatedData(fallbackAggregated);
            
            // Only cache completed transfers from fallback aggregation
            if (fallbackAggregated.completedTransfers.length > 0) {
              const completedOnlyFallback = {
                completedTransfers: fallbackAggregated.completedTransfers,
                suspiciousClaims: [],
                pendingTransfers: [],
                fraudDetected: false,
                stats: {
                  totalClaims: fallbackAggregated.completedTransfers.length,
                  totalTransfers: fallbackAggregated.completedTransfers.length,
                  completedTransfers: fallbackAggregated.completedTransfers.length,
                  suspiciousClaims: 0,
                  pendingTransfers: 0
                }
              };
              
              console.log('💾 Caching completed transfers from fallback aggregation:', completedOnlyFallback.completedTransfers.length);
              setCachedData(STORAGE_KEYS.AGGREGATED, completedOnlyFallback);
            } else {
              console.log('🔍 No completed transfers in fallback aggregation to cache');
              localStorage.removeItem(STORAGE_KEYS.AGGREGATED);
            }
            
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
        const timestamp = getCacheTimestamp();
        const lastUpdated = timestamp ? new Date(parseInt(timestamp)) : null;
        const cacheAge = timestamp ? Date.now() - parseInt(timestamp) : null;
        
        setCacheStatus({
          hasCachedData: true,
          isShowingCached: true,
          isRefreshing: false,
          isLoadingCached: false,
          lastUpdated,
          cacheAge
        });
        
        return true;
      } else {
        console.log('❌ No cached data found');
        setCacheStatus(prev => ({ ...prev, hasCachedData: false, isShowingCached: false, isLoadingCached: false }));
        return false;
      }
    } catch (error) {
      console.error('❌ Error loading cached data:', error);
      setCacheStatus(prev => ({ ...prev, hasCachedData: false, isShowingCached: false, isLoadingCached: false }));
      return false;
    }
  }, [currentBlock, getNetworkWithSettings, loadStakeInformation, claimUpdates.updateTimestamps]);

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
      const newAggregatedData = {
        ...aggregated,
        fraudDetected: aggregated.suspiciousClaims.length > 0,
        stats: {
          totalClaims: discoveryResults.stats.totalClaims,
          totalTransfers: discoveryResults.stats.totalTransfers,
          completedTransfers: aggregated.completedTransfers.length,
          suspiciousClaims: aggregated.suspiciousClaims.length,
          pendingTransfers: aggregated.pendingTransfers.length
        }
      };
      
      setAggregatedData(newAggregatedData);
      
      // Only cache COMPLETED transfers as aggregated data
      // Incomplete and suspicious cases must go through fresh aggregation
      if (aggregated.completedTransfers.length > 0) {
        const completedOnlyAggregated = {
          completedTransfers: aggregated.completedTransfers,
          suspiciousClaims: [], // Never cache suspicious claims
          pendingTransfers: [], // Never cache pending transfers
          fraudDetected: false, // Only completed transfers, no fraud
          stats: {
            totalClaims: aggregated.completedTransfers.length,
            totalTransfers: aggregated.completedTransfers.length,
            completedTransfers: aggregated.completedTransfers.length,
            suspiciousClaims: 0,
            pendingTransfers: 0
          }
        };
        
        console.log('💾 Caching only completed transfers as aggregated data:', completedOnlyAggregated.completedTransfers.length);
        setCachedData(STORAGE_KEYS.AGGREGATED, completedOnlyAggregated);
      } else {
        console.log('🔍 No completed transfers to cache as aggregated data');
        // Clear any existing aggregated cache if no completed transfers
        localStorage.removeItem(STORAGE_KEYS.AGGREGATED);
      }
      
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
    
    // Clear displayed data from the screen
    setClaims([]);
    setAggregatedData(null);
    setUserStakes({});
    setCacheStatus({
      hasCachedData: false,
      isShowingCached: false,
      isRefreshing: false,
      lastUpdated: null,
      cacheAge: null
    });
    
    toast.success('Cache cleared successfully');
  }, []);


  const searchSelectedDirection = useCallback(async () => {
    console.log('🔍 Starting parallel discovery for direction:', bridgeDirection);
    setIsSearching(true);
    setCacheStatus(prev => ({ ...prev, isRefreshing: true }));
    
    try {
      await loadClaimsAndTransfersParallel(true);
    } catch (error) {
      console.error('❌ Error during parallel discovery:', error);
      toast.error('Failed to discover data for selected direction');
    } finally {
      setIsSearching(false);
      setCacheStatus(prev => ({ ...prev, isRefreshing: false }));
    }
  }, [bridgeDirection, loadClaimsAndTransfersParallel]);

  // Check if a claim was recently updated
  const isClaimRecentlyUpdated = useCallback((claim) => {
    const claimNum = getClaimNumber(claim);
    if (!claimNum) return false;
    const key = `${claim.bridgeAddress}-${claimNum}`;
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
    const claimNum = getClaimNumber(claim);
    if (!claimNum) {
      console.error('Cannot update claim: no valid claim number found');
      return;
    }
    
    const claimKey = `${claim.bridgeAddress}-${claimNum}`;
    
    try {
      // Set updating state for this specific claim
      setClaimUpdates(prev => ({ 
        ...prev, 
        isUpdating: true,
        updatingClaims: new Set([...prev.updatingClaims, claimKey])
      }));
      
      console.log(`🔄 Manually updating claim ${claimNum}...`);
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
        claimNum: claimNum
      });
      
      // Get the network configuration for this claim
      const networkConfig = getNetworkWithSettings(claim.networkKey);
      if (!networkConfig?.rpcUrl) {
        toast.error('Could not find network configuration for this claim');
        return;
      }

      // Fetch fresh claim data using centralized fetcher
      const claimData = await fetchClaimDetails({
        provider: new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl),
        contractAddress: claim.bridgeAddress,
        bridgeType: claim.bridgeType,
        claimNum: claimNum,
        rpcUrl: networkConfig.rpcUrl
      });

      if (!claimData) {
        toast.error('Could not fetch claim details from contract');
        return;
      }

      // Update currentBlock to ensure button states are correct
      const provider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
      const block = await provider.getBlock('latest');
      setCurrentBlock(block);
      console.log(`🔍 Updated current block for claim refresh:`, {
        blockNumber: block.number,
        timestamp: block.timestamp
      });

      console.log(`🔍 Raw claim data from contract:`, claimData);

      // Extract claim data fields
      // Based on the ABI: tuple(uint amount, address recipient_address, uint32 txts, uint32 ts, address claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake)
      const {
        amount,
        recipient_address: recipientAddress,
        txts,
        ts,
        claimant_address: claimantAddress,
        expiry_ts: expiryTs,
        period_number: periodNumber,
        current_outcome: currentOutcome,
        is_large: isLarge,
        withdrawn,
        finished,
        sender_address: senderAddress,
        data,
        yes_stake: yesStake,
        no_stake: noStake
      } = claimData;

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
        noStake: noStake?.toString(),
        yesStakeType: typeof yesStake,
        noStakeType: typeof noStake,
        periodNumberType: typeof periodNumber
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
        claimant_address: claimantAddress,
        expiryTs: expiryTs,
        period_number: periodNumber,
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
          getClaimNumber(c) === claimNum 
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
          getClaimNumber(c) === claimNum 
            ? { ...c, ...updatedClaim }
            : c
        );
        
        // Update in suspiciousClaims
        updatedAggregated.suspiciousClaims = prevAggregated.suspiciousClaims.map(c => 
          c.bridgeAddress === claim.bridgeAddress && 
          getClaimNumber(c) === claimNum 
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

      // Also update the cached data with the fresh claim data
      // Normalize amounts for consistent cache storage format (matching event-cached format)
      try {
        const cachedClaims = getCachedClaims() || [];
        const updatedCachedClaims = cachedClaims.map(c => 
          c.bridgeAddress === claim.bridgeAddress && 
          getClaimNumber(c) === claimNum 
            ? {
                ...updatedClaim,
                // Normalize amounts for cache consistency (matching event-cached format)
                amount: normalizeAmount(amount),
                yesStake: normalizeAmount(yesStake),
                noStake: normalizeAmount(noStake),
                reward: normalizeAmount(claim.reward || updatedClaim.reward)
              }
            : c
        );
        
        // Update the cache with the normalized data
        setCachedData(STORAGE_KEYS.CLAIMS, updatedCachedClaims);
      } catch (error) {
        console.warn('⚠️ Failed to update cached data:', error);
      }

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
  }, [getNetworkWithSettings]);

  // getTimeSinceUpdate function removed - no longer needed since Updated badge was removed



  // Load contract settings on mount
  useEffect(() => {
    loadContractSettings();
  }, [loadContractSettings]);

  // Clear user stakes when account changes
  useEffect(() => {
    setUserStakes({});
  }, [account]);

  // Load cached data when tab becomes active
  useEffect(() => {
    if (activeTab === 'transfers') {
      // Only load cached data if there is no data at all
      // Avoid reloading when we have only pending transfers or suspicious claims
      if (!aggregatedData || (
        aggregatedData.completedTransfers.length === 0 &&
        aggregatedData.suspiciousClaims.length === 0 &&
        aggregatedData.pendingTransfers.length === 0
      )) {
        loadCachedData();
      }
    }
  }, [activeTab, loadCachedData, aggregatedData]);

  // No automatic loading - only manual search via button
  // useEffect(() => {
  //   // Disabled automatic loading - users must click search button
  //   // loadClaimsAndTransfers();
  // }, [filter]);

  // Auto-refresh disabled - users can manually refresh when needed
  // This prevents unnecessary network requests and gives users control

  // No wallet connection required to view claims
  // Wallet connection is only needed for actions like withdraw/challenge
  // After aggregated data is loaded, trigger individual updates for all claims (non-pending)
  useEffect(() => {
    const runBulkUpdates = async () => {
      if (!aggregatedData) return;
      if (bulkRunningRef.current) return;

      // Reset the processed claims set for fresh data
      // This ensures that when new data is loaded (from discovery), we process all claims again
      bulkProcessedRef.current.clear();
      
      // Reset the running flag to ensure we can start fresh
      bulkRunningRef.current = false;

      // Gather all claims (completed + suspicious). Pending transfers have no claimNum and should be skipped
      const allClaims = [
        ...(aggregatedData.completedTransfers || []),
        ...(aggregatedData.suspiciousClaims || [])
      ].filter(c => getClaimNumber(c) && c.bridgeAddress);

      // Helper to build a stable claim key
      const getClaimKey = (c) => {
        const numStr = getClaimNumber(c) || 'unknown';
        const addr = (c.bridgeAddress || '').toLowerCase();
        return `${addr}-${numStr}`;
      };

      const toProcess = allClaims.filter(c => !bulkProcessedRef.current.has(getClaimKey(c)));
      if (toProcess.length === 0) return;

      bulkRunningRef.current = true;
      
      // Set a timeout to ensure the ref gets reset even if something goes wrong
      const timeoutId = setTimeout(() => {
        bulkRunningRef.current = false;
      }, 30000); // 30 second timeout
      
      try {
        for (const claim of toProcess) {
          try {
            await updateSpecificClaim(claim);
          } catch (e) {
            // continue
          } finally {
            bulkProcessedRef.current.add(getClaimKey(claim));
            await new Promise(r => setTimeout(r, 150));
          }
        }
      } finally {
        clearTimeout(timeoutId);
        bulkRunningRef.current = false;
      }
    };

    runBulkUpdates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregatedData]);

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
        return <Clock9 className="w-5 h-5 text-warning-500" />;
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

  // Helper function to safely extract claim number from cached data
  const getClaimNumber = (claim) => {
    if (!claim) return null;
    
    // Try actualClaimNum first, then claimNum
    let claimNum = claim.actualClaimNum || claim.claimNum;
    
    if (!claimNum) return null;
    
    // Handle BigNumber objects (from ethers.js) or deserialized BigNumber objects
    if (typeof claimNum === 'object' && claimNum !== null) {
      // Try toString method first
      if (claimNum.toString && typeof claimNum.toString === 'function') {
        try {
          const result = claimNum.toString();
          // Make sure it's not "[object Object]"
          if (result !== '[object Object]') {
            return result;
          }
        } catch (e) {
          // Fall through to other methods
        }
      }
      
      // Try _hex property (ethers.js BigNumber)
      if (claimNum._hex) {
        try {
          return parseInt(claimNum._hex, 16).toString();
        } catch (e) {
          // Fall through
        }
      }
      
      // Try hex property
      if (claimNum.hex) {
        try {
          return parseInt(claimNum.hex, 16).toString();
        } catch (e) {
          // Fall through
        }
      }
      
      // Try value property
      if (claimNum.value !== undefined) {
        try {
          return String(claimNum.value);
        } catch (e) {
          // Fall through
        }
      }
      
      // Try to stringify and parse as JSON
      try {
        const jsonStr = JSON.stringify(claimNum);
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed === 'string' || typeof parsed === 'number') {
          return String(parsed);
        }
      } catch (e) {
        // Fall through
      }
      
      // Last resort: try to extract any numeric value
      console.warn('🔍 Unhandled claim number object:', claimNum);
      return null;
    }
    
    // Handle string or number
    return String(claimNum);
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
        {/* Search Controls - appears first on mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto order-1 sm:order-2">
          <select
            value={bridgeDirection}
            onChange={(e) => setBridgeDirection(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent w-full sm:w-auto sm:min-w-[200px]"
          >
            <option value="all">All Bridges</option>
            {getBridgeDirections().map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.name}
              </option>
            ))}
          </select>
          
          <select
            value={rangeHours}
            onChange={(e) => setRangeHours(parseInt(e.target.value))}
            className="bg-dark-800 border border-dark-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent w-full sm:w-auto sm:min-w-[140px]"
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
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full sm:w-auto ${
              isSearching
                ? 'bg-dark-700 text-secondary-500 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700 cursor-pointer'
            }`}
            title="Search for claims and transfers in selected direction"
          >
            {isSearching ? (
              'Searching...'
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Search
              </>
            )}
          </button>
        </div>

        {/* Filter Toggle - appears below on mobile */}
        <div className="flex items-center gap-3 order-2 sm:order-1">
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
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <Clock9 className="w-4 h-4" />
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
            </button>
          </div>
        </div>
      </div>

      {/* Prominent update notification removed - using green link in cache status instead */}

      {/* Cache Status */}
      {(() => {
        // Check if there's actual cached data in storage
        const cachedClaims = getCachedClaims();
        const cachedTransfers = getCachedTransfers();
        const cachedAggregated = getCachedAggregated();
        const hasActualCache = (cachedClaims && cachedClaims.length > 0) || 
                              (cachedTransfers && cachedTransfers.length > 0) || 
                              (cachedAggregated && cachedAggregated.completedTransfers && cachedAggregated.completedTransfers.length > 0);
        
        // Only show cache status if there's actual cached data
        return hasActualCache && (
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
                  onClick={clearCache}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                  title="Clear cache"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Parallel Discovery Progress removed per request */}

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
      {(() => {
        // Check if we're not loading or searching
        const isNotLoading = !loading && !isSearching && !cacheStatus.isLoadingCached;
        
        // Check if there's no aggregated data OR if aggregatedData exists but has no items
        const hasNoAggregatedData = !aggregatedData || (
          aggregatedData.completedTransfers.length === 0 && 
          aggregatedData.suspiciousClaims.length === 0 && 
          aggregatedData.pendingTransfers.length === 0
        );
        
        // Check if there's no cached data in storage
        const cachedClaims = getCachedClaims();
        const cachedTransfers = getCachedTransfers();
        const cachedAggregated = getCachedAggregated();
        const hasNoCachedData = (!cachedClaims || cachedClaims.length === 0) && 
                                (!cachedTransfers || cachedTransfers.length === 0) && 
                                (!cachedAggregated || !cachedAggregated.completedTransfers || cachedAggregated.completedTransfers.length === 0);
        
        // Show empty state if not loading and there's no data from either source
        const shouldShowEmpty = isNotLoading && hasNoAggregatedData && hasNoCachedData;
        
        return shouldShowEmpty && (
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
            </div>
          </div>
        );
      })()}

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
            
            // If block numbers are the same or missing, sort by time (most recent first)
            const timeA = (a.timestamp ?? a.txts ?? a.blockTimestamp ?? 0);
            const timeB = (b.timestamp ?? b.txts ?? b.blockTimestamp ?? 0);
            return timeB - timeA;
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
              key={`${claim.bridgeAddress}-${getClaimNumber(claim) || claim.transactionHash || index}`}
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
                      {isPending ? `Transfer #${index + 1}` : (isTransfer ? `Transfer #${index + 1}` : `Claim #${getClaimNumber(claim) || 'N/A'}`)}
                    </span>
                    {isSuspicious && status === 'withdrawn' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {isSuspicious && status === 'active' && <Clock9 className="w-4 h-4 text-warning-500" />}
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
                          disabled={claimUpdates.updatingClaims.has(`${claim.bridgeAddress}-${getClaimNumber(claim)}`)}
                        >
                          <RefreshCw 
                            className={`w-4 h-4 text-blue-400 hover:text-blue-300 ${
                              claimUpdates.updatingClaims.has(`${claim.bridgeAddress}-${getClaimNumber(claim)}`) ? 'animate-spin' : ''
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
                                {claim.txts ? new Date(claim.txts * 1000).toLocaleString() : 'N/A'}
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
                        <div className="col-span-full mb-3 p-2 bg-gray-900/20 border border-gray-500/50 rounded text-xs">
                          <div className="text-gray-400 font-medium mb-1">Loading claim data...</div>
                        </div>
                      )}
                      
                      {/* Debug: Show currentBlock status - removed warning message */}
                      
                      <div className="col-span-full">
                      <div>
                      <h4 className="text-sm font-medium text-secondary-300 mb-3">
                        <span className="text-secondary-400 mb-3">Period {(() => {
                          return claim.period_number !== undefined && claim.period_number !== null ? `#${claim.period_number + 1} -` : '';
                        })()}</span>
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
                                const requiredNetwork = getRequiredNetworkForTransfer(claim);
                                const switchSuccess = await checkAndSwitchNetwork(requiredNetwork);

                                if (!switchSuccess) {
                                  return;
                                }

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

