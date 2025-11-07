import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { 
  get3DPassTokenMetadata, 
  get3DPassTokenBalance,
  get3DPassTokenAllowance
} from '../utils/threedpass';
import { getBlockTimestamp } from '../utils/bridge-contracts';
import { fetchClaimDetails } from '../utils/claim-details-fetcher.js';
import { normalizeAmount } from '../utils/data-normalizer.js';
import { convertActualToDisplay } from '../utils/decimal-converter.js';
import { addClaimEventToStorage, createClaimEventData } from '../utils/unified-event-cache';
import { determineClaimBridge } from '../utils/claim-bridge-discriminant.js';
import { 
  EXPORT_ABI,
  IMPORT_ABI,
  IMPORT_WRAPPER_ABI,
  ERC20_ABI,
  IPRECOMPILE_ERC20_ABI,
  IP3D_ABI
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

// Safely convert to EIP-55 checksum if it's an EVM address
const toChecksumAddress = (address) => {
  try {
    return ethers.utils.getAddress(address);
  } catch (e) {
    return address;
  }
};

// Normalize various numeric-like inputs (string, number, BigNumber, {_hex} | {hex}) to a wei string
const toWeiString = (value) => {
  if (value === undefined || value === null) return '0';
  if (ethers.BigNumber.isBigNumber(value)) return value.toString();
  if (typeof value === 'object') {
    // Ethers BigNumber-like objects from JSON
    if (value._isBigNumber) {
      try { return ethers.BigNumber.from(value).toString(); } catch (e) { /* fallthrough */ }
    }
    // Plain objects with hex/type fields from storage
    if (value._hex || value.hex) {
      try { return ethers.BigNumber.from(value._hex || value.hex).toString(); } catch (e) { /* fallthrough */ }
    }
  }
  if (typeof value === 'string') return value;
  return String(value);
};

// Normalize a numeric value to a wei string
// Amounts from blockchain events are always in wei format, so we just normalize the format
const normalizeToWeiString = (value) => {
  const v = toWeiString(value);
  if (!v || v === '0') return '0';
  try {
    return ethers.BigNumber.from(v).toString();
  } catch (_) {
    return v;
  }
};

// Helper functions to get network and token configuration
const getNetworkConfig = (networkId) => {
  return Object.values(NETWORKS).find(network => network.id === networkId);
};

// Note: This function is used outside component context, so it can't use hooks
// It's kept for backward compatibility but should be replaced with SettingsContext methods in components
const getTokenDecimals = (networkId, tokenAddress) => {
  const networkConfig = getNetworkConfig(networkId);
  if (!networkConfig || !networkConfig.tokens) return 18; // Default fallback
  
  const token = Object.values(networkConfig.tokens).find(t => 
    t.address?.toLowerCase() === tokenAddress?.toLowerCase()
  );
  return token?.decimals || 18; // Default fallback
};

const getStakeTokenDecimals = (networkId, stakeTokenAddress = null) => {
  const networkConfig = getNetworkConfig(networkId);
  if (!networkConfig) return 18; // Default fallback
  
  // If stakeTokenAddress is provided, try to find the token in the network configuration
  if (stakeTokenAddress) {
    // Check if it's a native token (zero address)
    if (stakeTokenAddress === ethers.constants.AddressZero) {
      return networkConfig.nativeCurrency?.decimals || 18;
    }
    
    // Look for the token in the network's tokens configuration
    const token = Object.values(networkConfig.tokens || {}).find(
      t => t.address?.toLowerCase() === stakeTokenAddress.toLowerCase()
    );
    if (token) {
      return token.decimals;
    }
  }
  
  // Fallback to network-specific defaults
  // For 3DPass, P3D has 18 decimals
  if (networkId === NETWORKS.THREEDPASS.id) {
    return 18;
  }
  
  // For Ethereum, default to ETH decimals (18) instead of hardcoded USDT decimals (6)
  if (networkId === NETWORKS.ETHEREUM.id) {
    return networkConfig.nativeCurrency?.decimals || 18;
  }
  
  return 18; // Default fallback
};

// Helper function to format amounts for display (always uses decimal-converter)
// This ensures consistent formatting and proper multiplier handling
// Can handle both wei (BigNumber/string) and human-readable amounts
const formatAmountForDisplay = (weiAmount, decimals, tokenAddress, getTokenDecimalsDisplayMultiplier) => {
  if (!weiAmount || weiAmount === '0') return '0';
  
  // Convert wei to human-readable format
  const humanReadable = ethers.utils.formatUnits(weiAmount, decimals);
  
  // Use decimal-converter utility for consistent formatting and multiplier handling
  return convertActualToDisplay(humanReadable, decimals, tokenAddress, getTokenDecimalsDisplayMultiplier);
};

// Helper to format human-readable amounts for display (converts to wei first, then formats)
const formatHumanReadableForDisplay = (humanReadableAmount, decimals, tokenAddress, getTokenDecimalsDisplayMultiplier) => {
  if (!humanReadableAmount || humanReadableAmount === '0') return '0';
  
  // Convert human-readable amount to wei, then format
  const weiAmount = ethers.utils.parseUnits(humanReadableAmount || '0', decimals);
  return formatAmountForDisplay(weiAmount, decimals, tokenAddress, getTokenDecimalsDisplayMultiplier);
};

// Helper function to check if this is a third-party claim
const checkThirdPartyClaim = (account, recipientAddress, reward) => {
  if (!account || !recipientAddress) return false;
  
  // Third-party claim condition: signer != recipient AND reward > 0
  const isDifferentRecipient = account.toLowerCase() !== recipientAddress.toLowerCase();
  
  // Handle reward in wei format - normalize it first
  let hasReward = false;
  if (reward) {
    try {
      // Normalize reward to wei string and check if it's greater than 0
      const rewardWei = toWeiString(reward);
      hasReward = ethers.BigNumber.from(rewardWei || '0').gt(0);
    } catch (error) {
      // Fallback to parseFloat if BigNumber conversion fails
      hasReward = parseFloat(reward || '0') > 0;
    }
  }
  
  return isDifferentRecipient && hasReward;
};

// Get maximum allowance value (2^256 - 1)
const getMaxAllowance = () => {
  return ethers.constants.MaxUint256;
};

// Helper function to parse and categorize errors
const parseError = (error) => {
  const errorMessage = error.message || error.toString();
  
  // User rejection/cancellation
  if (errorMessage.includes('user rejected') || 
      errorMessage.includes('ACTION_REJECTED') ||
      errorMessage.includes('User denied') ||
      errorMessage.includes('cancelled') ||
      error.code === 'ACTION_REJECTED') {
    return {
      type: 'user_rejection',
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction. No changes were made.',
      canRetry: true,
      isUserError: true
    };
  }
  
  // Transaction replaced/repriced (user adjusted gas)
  if (errorMessage.includes('transaction was replaced') ||
      error.code === 'TRANSACTION_REPLACED') {
    return {
      type: 'transaction_replaced',
      title: 'Transaction Repriced',
      message: 'Your wallet automatically adjusted the gas price for faster confirmation. The transaction was successful.',
      canRetry: false,
      isUserError: false,
      isSuccess: true
    };
  }
  
  // Transaction hash issues (specific to your problem)
  if (errorMessage.includes('Transaction does not have a transaction hash') ||
      errorMessage.includes('there was a problem') ||
      error.code === -32603) {
    return {
      type: 'transaction_hash_error',
      title: 'Transaction Submission Failed',
      message: 'The transaction could not be submitted properly. This often happens with allowance increases.',
      canRetry: true,
      isUserError: false
    };
  }
  
  // Insufficient funds
  if (errorMessage.includes('insufficient funds') || 
      errorMessage.includes('insufficient balance')) {
    return {
      type: 'insufficient_funds',
      title: 'Insufficient Funds',
      message: 'You don\'t have enough tokens or ETH to complete this transaction.',
      canRetry: false,
      isUserError: true
    };
  }
  
  // Gas estimation failed
  if (errorMessage.includes('gas required exceeds allowance') ||
      errorMessage.includes('gas estimation failed') ||
      errorMessage.includes('UNPREDICTABLE_GAS_LIMIT')) {
    return {
      type: 'gas_error',
      title: 'Gas Estimation Failed',
      message: 'The transaction requires more gas than available. Try increasing gas limit.',
      canRetry: true,
      isUserError: false
    };
  }
  
  // Network issues
  if (errorMessage.includes('network') || 
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection')) {
    return {
      type: 'network_error',
      title: 'Network Error',
      message: 'There was a network issue. Please check your connection and try again.',
      canRetry: true,
      isUserError: false
    };
  }
  
  // ERC20 burn amount exceeds balance (third-party claim insufficient balance)
  if (errorMessage.includes('ERC20: burn amount exceeds balance')) {
    return {
      type: 'insufficient_balance_for_assist',
      title: 'Insufficient Balance',
      message: 'Insufficient balance to assist with this transfer',
      canRetry: false,
      isUserError: true
    };
  }
  
  // Contract/transaction errors
  if (errorMessage.includes('execution reverted') ||
      errorMessage.includes('revert')) {
    return {
      type: 'contract_error',
      title: 'Transaction Failed',
      message: 'The transaction was rejected by the smart contract. Please check your inputs.',
      canRetry: true,
      isUserError: false
    };
  }
  
  // Default error
  return {
    type: 'unknown',
    title: 'Operation Failed',
    message: errorMessage,
    canRetry: true,
    isUserError: false
  };
};

const NewClaim = ({ isOpen, onClose, selectedToken = null, selectedTransfer = null, onClaimSubmitted = null }) => {
  const { account, provider, network, signer } = useWeb3();
  const { getBridgeInstancesWithSettings, getNetworkWithSettings, getTokenDecimalsDisplayMultiplier, get3DPassTokenBySymbol } = useSettings();
  
  
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

  // Helper function to check if balance is insufficient for third-party claim
  const isInsufficientBalanceForThirdPartyClaim = () => {
    if (!isThirdPartyClaim || !formData.amount || !formData.reward || !tokenBalance) {
      return false;
    }
    
    const tokenDecimals = getTokenDecimals(network?.id, formData.tokenAddress);
    
    // All amounts are stored in wei format internally (from blockchain events)
    const amountWei = ethers.BigNumber.from(toWeiString(formData.amount));
    const rewardWei = ethers.BigNumber.from(toWeiString(formData.reward));
    const transferWei = amountWei.sub(rewardWei);
    
    // Token balance is stored as human-readable string from balance queries, convert to wei for comparison
    const balanceWei = ethers.utils.parseUnits(tokenBalance || '0', tokenDecimals);
    
    return transferWei.gt(balanceWei);
  };
  const [requiredStake, setRequiredStake] = useState('0');
  const [allowance, setAllowance] = useState('0');
  const [needsApproval, setNeedsApproval] = useState(true);
  const [availableTokens, setAvailableTokens] = useState([]);
  const [isThirdPartyClaim, setIsThirdPartyClaim] = useState(false);
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [useMaxAllowance, setUseMaxAllowance] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [contractSettings, setContractSettings] = useState(null);
  
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

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      // Reset all state when dialog closes
      setNeedsApproval(true);
      setAllowance('0');
      setSubmitting(false);
      setUseMaxAllowance(false);
      setIsRevoking(false);
      setContractSettings(null);
      setTokenMetadata(null);
      setTokenBalance('0');
      setStakeTokenBalance('0');
      setRequiredStake('0');
      setSelectedBridge(null);
      setAvailableTokens([]);
      setIsThirdPartyClaim(false);
      setShowTransactionDetails(false);
    }
  }, [isOpen]);

  // Initialize form when component mounts or token changes
  useEffect(() => {
    if (isOpen) {
      // Add a small delay to ensure network switch has completed
      const timer = setTimeout(async () => {
        // Declare matchedBridge at function scope so it's accessible throughout
        let matchedBridge = null;
        
        if (selectedTransfer) {
          // Pre-fill form with transfer data
          console.log('🔍 Pre-filling form with transfer data:', selectedTransfer);
          
          // Use the exact block timestamp from the transfer event (following bot pattern)
          const calculateTxts = async () => {
            // The bot uses the block timestamp from the transfer event, not external timestamp
            // This ensures exact consistency with the original transfer event
            const transferBlockTimestamp = selectedTransfer.timestamp || selectedTransfer.blockTimestamp;
            
            console.log('🔍 Using transfer block timestamp (bot pattern):', {
              transferBlockTimestamp: transferBlockTimestamp,
              transferBlockDate: new Date(transferBlockTimestamp * 1000).toISOString(),
              blockNumber: selectedTransfer.blockNumber,
              transferType: selectedTransfer.eventType,
              transactionHash: selectedTransfer.transactionHash
            });
            
            console.log(`🔍 Using transfer block timestamp: ${transferBlockTimestamp} (${new Date(transferBlockTimestamp * 1000).toISOString()})`);
            return transferBlockTimestamp;
          };
          
          const txtsValue = await calculateTxts();
          // Determine the correct token address by looking up bridges in settings based on transfer type
          let tokenAddress = '';

          try {
            // Use the discriminant utility to determine the bridge first
            // This ensures we use bridgeAddress as the primary source
            const determinedBridge = determineClaimBridge({
              tokenAddress: '', // Will be determined from bridge
              selectedTransfer: selectedTransfer,
              getBridgeInstancesWithSettings: getBridgeInstancesWithSettings
            });

            if (determinedBridge) {
              matchedBridge = determinedBridge;
              
              // Determine token address based on bridge type and network
              if (selectedTransfer.eventType === 'NewRepatriation') {
                // For repatriation, token is on home network (where we're claiming)
                tokenAddress = determinedBridge.homeTokenAddress || '';
              } else if (selectedTransfer.eventType === 'NewExpatriation') {
                // For expatriation, token is on foreign network (where we're claiming)
                tokenAddress = determinedBridge.foreignTokenAddress || '';
              }
              
              // Set the bridge immediately so other logic can use it
              setSelectedBridge(matchedBridge);
            }

            // Fallback: If discriminant didn't find a bridge, try to get token address from transfer fields
            if (!tokenAddress) {
              tokenAddress = selectedTransfer.foreignTokenAddress || selectedTransfer.homeTokenAddress || selectedTransfer.toTokenAddress || selectedTransfer.fromTokenAddress || '';
            }
          } catch (err) {
            console.warn('⚠️ Failed to resolve bridge/token via discriminant utility, falling back to event fields:', err?.message);
            tokenAddress = selectedTransfer.foreignTokenAddress || selectedTransfer.homeTokenAddress || selectedTransfer.toTokenAddress || selectedTransfer.fromTokenAddress || '';
          }

          console.log('🔍 Resolved token via settings for network:', {
            networkId: network?.id,
            networkName: network?.name,
            eventType: selectedTransfer.eventType,
            foreignTokenAddress: selectedTransfer.foreignTokenAddress,
            homeTokenAddress: selectedTransfer.homeTokenAddress,
            fromTokenAddress: selectedTransfer.fromTokenAddress,
            toTokenAddress: selectedTransfer.toTokenAddress,
            resolvedTokenAddress: tokenAddress,
            resolvedBridgeType: matchedBridge?.type,
            resolvedBridgeAddress: matchedBridge?.address
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
            // CRITICAL: Preserve exact format to match bot expectations
            // Transfer amounts from blockchain events are already in wei format
            amount: selectedTransfer.amount ? normalizeToWeiString(selectedTransfer.amount) : '',
            reward: selectedTransfer.reward ? normalizeToWeiString(selectedTransfer.reward) : '0',
            txid: selectedTransfer.txid || selectedTransfer.transactionHash || '',
            txts: txtsValue,
            senderAddress: toChecksumAddress(selectedTransfer.fromAddress || selectedTransfer.senderAddress || ''),
            recipientAddress: toChecksumAddress(selectedTransfer.toAddress || selectedTransfer.recipientAddress || account || ''),
            data: selectedTransfer.data || '0x'
          }));
        } else if (selectedToken) {
          // For manual claims without transfer data, use current block timestamp
          // This follows the same pattern as the bot for consistency
          if (provider) {
            try {
              const currentBlock = await provider.getBlock('latest');
              const currentBlockTimestamp = currentBlock.timestamp;
              setFormData(prev => ({
                ...prev,
                tokenAddress: selectedToken.address,
                recipientAddress: toChecksumAddress(account || ''),
                senderAddress: '', // Don't pre-fill sender address for manual claims
                txts: currentBlockTimestamp // Use current block timestamp (bot pattern)
              }));
            } catch (error) {
              console.error('Error getting current block timestamp:', error);
              // Fallback to Date.now() if provider fails
              const currentBlockTimestamp = Math.floor(Date.now() / 1000);
              setFormData(prev => ({
                ...prev,
                tokenAddress: selectedToken.address,
                recipientAddress: toChecksumAddress(account || ''),
                senderAddress: '', // Don't pre-fill sender address for manual claims
                txts: currentBlockTimestamp // Use current block timestamp (bot pattern)
              }));
            }
          }
        } else if (account) {
          // If no selected token but account is available, still set the recipient address
          // For manual claims without transfer data, use current block timestamp
          if (provider) {
            try {
              const currentBlock = await provider.getBlock('latest');
              const currentBlockTimestamp = currentBlock.timestamp;
              setFormData(prev => ({
                ...prev,
                recipientAddress: toChecksumAddress(account),
                senderAddress: '', // Don't pre-fill sender address for manual claims
                txts: currentBlockTimestamp // Use current block timestamp (bot pattern)
              }));
            } catch (error) {
              console.error('Error getting current block timestamp:', error);
              // Fallback to Date.now() if provider fails
              const currentBlockTimestamp = Math.floor(Date.now() / 1000);
              setFormData(prev => ({
                ...prev,
                recipientAddress: toChecksumAddress(account),
                senderAddress: '', // Don't pre-fill sender address for manual claims
                txts: currentBlockTimestamp // Use current block timestamp (bot pattern)
              }));
            }
          }
        }
        // Reset approval state when form opens or token changes
        // But skip this if matchedBridge (from selectedTransfer) is a native token
        // The native token effect will handle setting needsApproval to false when selectedBridge is set
        // Check matchedBridge if it was set in this timeout, otherwise reset to true
        if (!matchedBridge || matchedBridge.stakeTokenAddress !== ethers.constants.AddressZero) {
          setNeedsApproval(true);
        }
        
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
  }, [isOpen, selectedToken, selectedTransfer, account, provider, getNetworkWithSettings, getBridgeInstancesWithSettings, network?.id, network?.name]);

  // Load available tokens from bridge configurations
  const loadAvailableTokens = useCallback(async () => {
    if (!provider) return;

    // Validate network connection before proceeding
    try {
      const currentNetwork = await provider.getNetwork();
      console.log('🔍 Current network in loadAvailableTokens:', {
        expectedNetworkId: network?.id,
        actualChainId: currentNetwork.chainId,
        networkName: currentNetwork.name
      });

      // Check if we're on the expected network
      if (network?.id && currentNetwork.chainId !== network.id) {
        console.warn('⚠️ Network mismatch detected, skipping token loading:', {
          expected: network.id,
          actual: currentNetwork.chainId
        });
        return;
      }
    } catch (networkError) {
      console.warn('⚠️ Failed to get current network, skipping token loading:', networkError);
      return;
    }

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
        // - On 3DPass: homeTokenAddress is the token on 3DPass side (where we are)
        // - On Ethereum/BSC: homeTokenAddress is the token on Ethereum/BSC side (where we are for repatriation claims)
        if (bridge.type === 'export') {
          if (network?.id === NETWORKS.THREEDPASS.id) {
            // On 3DPass: load homeTokenAddress (token on 3DPass side)
            if (bridge.homeTokenAddress) {
              tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
              console.log('✅ Added export bridge home token (3DPass):', bridge.homeTokenAddress);
            }
          } else if (network?.id === NETWORKS.ETHEREUM.id) {
            // On Ethereum: only load homeTokenAddress if the bridge's homeNetwork is Ethereum
            if (bridge.homeNetwork === 'Ethereum' && bridge.homeTokenAddress) {
              tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
              console.log('✅ Added export bridge home token (Ethereum):', bridge.homeTokenAddress);
            } else {
              console.log('⏭️ Skipping export bridge - homeNetwork is not Ethereum:', {
                bridgeType: bridge.type,
                homeNetwork: bridge.homeNetwork,
                foreignNetwork: bridge.foreignNetwork,
                currentNetwork: network?.name
              });
            }
          } else if (network?.id === NETWORKS.BSC.id) {
            // On BSC: only load homeTokenAddress if the bridge's homeNetwork is BSC
            if (bridge.homeNetwork === 'BSC' && bridge.homeTokenAddress) {
              tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
              console.log('✅ Added export bridge home token (BSC):', bridge.homeTokenAddress);
            } else {
              console.log('⏭️ Skipping export bridge - homeNetwork is not BSC:', {
                bridgeType: bridge.type,
                homeNetwork: bridge.homeNetwork,
                foreignNetwork: bridge.foreignNetwork,
                currentNetwork: network?.name
              });
            }
          }
        }
        // For import wrapper bridges: 
        // - On 3DPass: foreignTokenAddress is the token on 3DPass side (where we are)
        // - On Ethereum/BSC: homeTokenAddress is the token on Ethereum/BSC side (where we are for repatriation claims)
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
          } else if (network?.id === NETWORKS.BSC.id) {
            // On BSC: use homeTokenAddress (token on BSC side for repatriation claims)
            if (bridge.homeTokenAddress) {
              tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
              console.log('✅ Added import_wrapper bridge home token (BSC):', bridge.homeTokenAddress);
            } else {
              console.log('❌ Import_wrapper bridge has no homeTokenAddress');
            }
          }
        }
        // For import bridges:
        // - On 3DPass: foreignTokenAddress is the token on 3DPass side (where bridge is deployed)
        // - On Ethereum/BSC: homeTokenAddress is the token on Ethereum/BSC side (where tokens come from)
        else if (bridge.type === 'import') {
          console.log('🔍 Found import bridge, checking token addresses:', {
            bridgeType: bridge.type,
            homeTokenAddress: bridge.homeTokenAddress,
            foreignTokenAddress: bridge.foreignTokenAddress,
            hasHomeToken: !!bridge.homeTokenAddress,
            hasForeignToken: !!bridge.foreignTokenAddress,
            currentNetwork: network?.name,
            currentNetworkId: network?.id
          });
          
          if (network?.id === NETWORKS.THREEDPASS.id) {
            // On 3DPass: use foreignTokenAddress (token on 3DPass side where bridge is deployed)
            if (bridge.foreignTokenAddress) {
              tokenAddresses.add(bridge.foreignTokenAddress.toLowerCase());
              console.log('✅ Added import bridge foreign token (3DPass):', bridge.foreignTokenAddress);
            } else {
              console.log('❌ Import bridge has no foreignTokenAddress');
            }
          } else if (network?.id === NETWORKS.ETHEREUM.id || network?.id === NETWORKS.BSC.id) {
            // On Ethereum/BSC: use homeTokenAddress (token on Ethereum/BSC side where tokens come from)
            if (bridge.homeTokenAddress) {
              tokenAddresses.add(bridge.homeTokenAddress.toLowerCase());
              console.log(`✅ Added import bridge home token (${network?.name}):`, bridge.homeTokenAddress);
            } else {
              console.log('❌ Import bridge has no homeTokenAddress');
            }
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
          // Double-check network before loading metadata
          const currentNetwork = await provider.getNetwork();
          if (network?.id && currentNetwork.chainId !== network.id) {
            console.warn(`⚠️ Network changed during token loading for ${address}, skipping`);
            continue;
          }

          // For 3DPass network, use 3DPass token metadata
          if (network?.id === NETWORKS.THREEDPASS.id) {
            const metadata = await get3DPassTokenMetadata(provider, address);
            tokens.push(metadata);
          } else {
            // For other networks (like Ethereum), use standard ERC20 metadata
            const tokenContract = new ethers.Contract(address, ERC20_ABI, provider);
            
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
          
          // If it's a network error, don't add the token
          if (error.code === 'NETWORK_ERROR' || error.message?.includes('underlying network changed')) {
            console.warn(`⚠️ Network error for ${address}, skipping token`);
            continue;
          }
          
          // For other errors, try to add a fallback token entry
          tokens.push({
            address,
            symbol: 'Unknown',
            name: 'Unknown Token',
            decimals: 18
          });
        }
      }

      console.log('🔍 Loaded tokens from bridges:', tokens.map(t => ({ symbol: t.symbol, address: t.address })));
      console.log('🔍 Token addresses found:', Array.from(tokenAddresses));
      console.log('🔍 Current formData.tokenAddress:', formData.tokenAddress);
      console.log('🔍 Available tokens for dropdown:', tokens);
      setAvailableTokens(tokens);
    } catch (error) {
      console.error('Error loading available tokens:', error);
      
      // Provide more specific error messages based on error type
      if (error.code === 'NETWORK_ERROR' || error.message?.includes('underlying network changed')) {
        toast.error(
          <div>
            <h3 className="text-warning-400 font-medium">Network Switch Required</h3>
            <p className="text-warning-300 text-sm mt-1">
              Please wait for the network switch to complete, then try again.
            </p>
          </div>,
          {
            duration: 6000,
            style: {
              background: '#92400e',
              border: '1px solid #f59e0b',
              color: '#fff',
              padding: '16px',
              borderRadius: '8px',
            },
          }
        );
      } else {
      toast.error('Failed to load available tokens');
      }
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
        throw new Error(`Unknown bridge type: ${bridgeType}`);
    }
  }, []);

  // Load contract settings including min_tx_age
  const loadContractSettings = useCallback(async () => {
    if (!selectedBridge || !provider) return;

    try {
      console.log('🔍 Loading contract settings for bridge:', selectedBridge.address);
      
      const bridgeContract = new ethers.Contract(
        selectedBridge.address,
        getBridgeABI(selectedBridge.type),
        provider
      );

      const settings = await bridgeContract.settings();
      console.log('🔍 Contract settings loaded:', {
        tokenAddress: settings.tokenAddress,
        ratio100: settings.ratio100.toString(),
        counterstake_coef100: settings.counterstake_coef100.toString(),
        min_tx_age: settings.min_tx_age.toString(),
        min_stake: settings.min_stake.toString(),
        large_threshold: settings.large_threshold.toString()
      });
      
      setContractSettings({
        tokenAddress: settings.tokenAddress,
        ratio100: settings.ratio100,
        counterstake_coef100: settings.counterstake_coef100,
        min_tx_age: settings.min_tx_age,
        min_stake: settings.min_stake,
        large_threshold: settings.large_threshold
      });
    } catch (error) {
      console.error('Error loading contract settings:', error);
      setContractSettings(null);
    }
  }, [selectedBridge, provider, getBridgeABI]);

  // Validate timestamp requirement (min_tx_age)
  const validateTimestampRequirement = useCallback(async () => {
    if (!contractSettings || !formData.txts || !provider) return { isValid: true, message: '' };

    try {
      // Get current block timestamp from the provider (force fresh fetch)
      console.log('🔍 Fetching fresh current block for timestamp validation...');
      const currentBlock = await provider.getBlock('latest');
      const currentBlockTimestamp = currentBlock.timestamp;
      
      console.log('🔍 Fresh block data:', {
        blockNumber: currentBlock.number,
        timestamp: currentBlockTimestamp,
        timestampDate: new Date(currentBlockTimestamp * 1000).toISOString(),
        blockHash: currentBlock.hash
      });
      
      const transferTimestamp = parseInt(formData.txts);
      const minTxAge = contractSettings.min_tx_age?.toNumber ? contractSettings.min_tx_age.toNumber() : parseInt(contractSettings.min_tx_age);
      
      // Check if the current block timestamp seems stale (more than 30 seconds old)
      const now = Math.floor(Date.now() / 1000);
      const blockAge = now - currentBlockTimestamp;
      console.log('🔍 Block age check:', {
        currentTime: now,
        blockTimestamp: currentBlockTimestamp,
        blockAgeSeconds: blockAge,
        blockAgeMinutes: Math.floor(blockAge / 60),
        isStale: blockAge > 30
      });
      
      // If block seems stale, try to get a more recent block
      let finalCurrentTimestamp = currentBlockTimestamp;
      if (blockAge > 30) {
        console.log('⚠️ Block seems stale, trying to get a more recent block...');
        try {
          // Try to get a block that's a few blocks ahead
          const recentBlock = await provider.getBlock(currentBlock.number + 3);
          if (recentBlock && recentBlock.timestamp > currentBlockTimestamp) {
            finalCurrentTimestamp = recentBlock.timestamp;
            console.log('✅ Got more recent block:', {
              blockNumber: recentBlock.number,
              timestamp: finalCurrentTimestamp,
              timestampDate: new Date(finalCurrentTimestamp * 1000).toISOString()
            });
          }
        } catch (error) {
          console.log('⚠️ Could not get more recent block, using original:', error.message);
        }
      }
      
      const requiredTimestamp = transferTimestamp + minTxAge;
      const timeRemaining = requiredTimestamp - finalCurrentTimestamp;
      
      console.log('🔍 Timestamp validation:', {
        originalBlockTimestamp: currentBlockTimestamp,
        finalCurrentTimestamp,
        currentBlockNumber: currentBlock.number,
        transferTimestamp,
        minTxAge,
        requiredTimestamp,
        timeRemaining,
        isValid: finalCurrentTimestamp >= requiredTimestamp
      });

      if (finalCurrentTimestamp < requiredTimestamp) {
        const minutesRemaining = Math.ceil(timeRemaining / 60);
        const hoursRemaining = Math.floor(minutesRemaining / 60);
        const remainingMinutes = minutesRemaining % 60;
        
        let timeMessage = '';
        if (hoursRemaining > 0) {
          timeMessage = `${hoursRemaining}h ${remainingMinutes}m`;
        } else {
          timeMessage = `${minutesRemaining}m`;
        }
        
        return {
          isValid: false,
          message: `Claim is too early. Please wait ${timeMessage} more. Min time since transfer: ${minTxAge}s`
        };
      }

      return { isValid: true, message: '' };
    } catch (error) {
      console.error('Error validating timestamp requirement:', error);
      return { isValid: true, message: '' }; // Allow submission if validation fails
    }
  }, [contractSettings, formData.txts, provider]);

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
          // Check if this is a native token (zero address) - for native tokens, get ETH balance
          if (stakeTokenAddress === ethers.constants.AddressZero) {
            // For native ETH, get the account's ETH balance
            const balanceWei = await provider.getBalance(account);
            const stakeTokenDecimals = getStakeTokenDecimals(network?.id, stakeTokenAddress); // Use decimals from settings
            balance = ethers.utils.formatUnits(balanceWei, stakeTokenDecimals);
          } else {
            // For ERC20 tokens, use standard ERC20 balance
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

  // Determine the correct bridge based on transfer bridgeAddress
  // Uses the new discriminant utility that works for all bridge types and transfer directions
  const determineBridge = useCallback(() => {
    if (!formData.tokenAddress) return;

    // Use the new claim bridge discriminant utility
    // This works for all transfer types (NewRepatriation, NewExpatriation) and all bridge types
    const matchedBridge = determineClaimBridge({
      tokenAddress: formData.tokenAddress,
      selectedTransfer: selectedTransfer,
      getBridgeInstancesWithSettings: getBridgeInstancesWithSettings
    });

    if (matchedBridge) {
      console.log('✅ Bridge determined by discriminant:', matchedBridge);
      setSelectedBridge(matchedBridge);
    } else {
      console.log('❌ No bridge found by discriminant for token:', formData.tokenAddress);
      setSelectedBridge(null);
    }
  }, [formData.tokenAddress, getBridgeInstancesWithSettings, selectedTransfer]);

  // Load required stake with a specific amount
  const loadRequiredStakeWithAmount = useCallback(async (amount) => {
    if (!selectedBridge || !provider) return;

    try {
      console.log('🔍 Loading required stake with amount:', amount);
      console.log('🔍 Selected bridge:', selectedBridge);
      console.log('🔍 Debug - amount details:', {
        amount: amount,
        amountType: typeof amount,
        hasDecimal: amount.includes('.'),
        isFromTransfer: selectedTransfer !== null,
        selectedTransfer: selectedTransfer ? 'present' : 'null'
      });
      
      const bridgeContract = new ethers.Contract(
        selectedBridge.address,
        getBridgeABI(selectedBridge.type),
        provider
      );

      // Use the correct decimals for the amount from configuration
      const amountDecimals = getTokenDecimals(network?.id, formData.tokenAddress);
      
      // Amount from transfer events is always in wei format
      const amountWei = ethers.BigNumber.from(toWeiString(amount));
      console.log('🔍 Amount is wei format (from transfer event):', {
          originalAmount: amount,
          amountWei: amountWei.toString(),
          humanReadable: ethers.utils.formatUnits(amountWei, amountDecimals)
        });
      
      console.log('🔍 Final amountWei for stake calculation:', {
        amountWei: amountWei.toString(),
        humanReadable: ethers.utils.formatUnits(amountWei, amountDecimals),
        amountDecimals: amountDecimals
      });
      
      const stake = await bridgeContract.getRequiredStake(amountWei);
      console.log('🔍 Raw stake from contract:', stake.toString());
      
      // Get stake token decimals from configuration
      const stakeTokenDecimals = getStakeTokenDecimals(network?.id, selectedBridge.stakeTokenAddress);
      
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
  }, [selectedBridge, provider, formData.tokenAddress, network?.id, getBridgeABI, selectedTransfer]);


  // Check allowance
  const checkAllowance = useCallback(async (stakeAmount = requiredStake) => {
    if (!selectedBridge || !provider || !account) return;
    
    // For native tokens (zero address), no allowance check needed - exit early
    if (selectedBridge.stakeTokenAddress === ethers.constants.AddressZero) {
      setAllowance('N/A (Native Token)');
      setNeedsApproval(false);
      return;
    }
    
    // For non-native tokens, require amount to be set
    if (!formData.amount) return;

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
        stakeTokenDecimals = getStakeTokenDecimals(network?.id, selectedBridge.stakeTokenAddress);
      } else {
        // For other networks (like Ethereum), use standard ERC20 allowance
        // For ERC20 tokens, check allowance
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, ERC20_ABI, provider);
        
        const [allowanceWei, decimals] = await Promise.all([
          tokenContract.allowance(account, selectedBridge.address),
          tokenContract.decimals()
        ]);
        
        currentAllowance = ethers.utils.formatUnits(allowanceWei, decimals);
        stakeTokenDecimals = decimals;
      }

      // Parse the required stake with correct decimals
      const stakeWei = ethers.utils.parseUnits(stakeAmount, stakeTokenDecimals);
      
      // For third-party claims, calculate total amount needed (stake + transfer amount)
      // The bridge needs to transfer both the stake and the transfer amount (amount - reward)
      let totalRequiredWei = stakeWei;
      if (isThirdPartyClaim && formData.amount && formData.reward) {
        // Check if claim token is the same as stake token (Export bridge case)
        if (formData.tokenAddress.toLowerCase() === selectedBridge.stakeTokenAddress?.toLowerCase()) {
          // Since claim token = stake token, use the same decimals from contract
          const amountWei = ethers.BigNumber.from(normalizeAmount(formData.amount));
          const rewardWei = ethers.BigNumber.from(normalizeAmount(formData.reward));
          const transferAmountWei = amountWei.sub(rewardWei);
          
          // Total required = stake + transfer amount
          totalRequiredWei = stakeWei.add(transferAmountWei);
          
          console.log('🔍 Third-party claim allowance calculation:', {
            stakeWei: stakeWei.toString(),
            transferAmountWei: transferAmountWei.toString(),
            totalRequiredWei: totalRequiredWei.toString(),
            stakeTokenDecimals
          });
        }
      }
      
      const allowanceWei = ethers.utils.parseUnits(currentAllowance, stakeTokenDecimals);
      
      // Check if current allowance is at maximum value and display "Max" instead
      const isMaxAllowance = allowanceWei.eq(ethers.constants.MaxUint256) || allowanceWei.gt(ethers.utils.parseUnits('1000000000', stakeTokenDecimals));
      
      console.log('🔍 Allowance check results:', {
        currentAllowance,
        stakeAmount,
        allowanceWei: allowanceWei.toString(),
        stakeWei: stakeWei.toString(),
        totalRequiredWei: totalRequiredWei.toString(),
        isThirdPartyClaim,
        isMaxAllowance,
        needsApproval: allowanceWei.lt(totalRequiredWei),
        allowanceComparison: `${allowanceWei.toString()} >= ${totalRequiredWei.toString()} = ${allowanceWei.gte(totalRequiredWei)}`
      });
      
      // Handle max allowance display
      if (isMaxAllowance) {
        setAllowance('Max');
        // Automatically check the max allowance checkbox when max allowance is detected
        setUseMaxAllowance(true);
      } else {
        setAllowance(currentAllowance);
      }
      
      // Check if approval is needed
      let needsApprovalResult;
      if (isMaxAllowance) {
        // Already has max allowance, no approval needed regardless of user preference
        needsApprovalResult = false;
      } else {
        // For non-max allowance cases, check if current allowance is sufficient for total required amount
        // For third-party claims, this includes both stake and transfer amount
        needsApprovalResult = allowanceWei.lt(totalRequiredWei);
      }
      
      console.log('🔍 Setting needsApproval to:', needsApprovalResult);
      setNeedsApproval(needsApprovalResult);
    } catch (error) {
      console.error('Error checking stake token allowance:', error);
      setAllowance('0');
      // Don't reset needsApproval to true for native tokens (they don't need approval)
      if (!selectedBridge || selectedBridge.stakeTokenAddress !== ethers.constants.AddressZero) {
        setNeedsApproval(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBridge, formData.amount, formData.reward, provider, account, network?.id, isThirdPartyClaim]);

  // Check allowance with retry mechanism for post-approval refresh
  const checkAllowanceWithRetry = useCallback(async (maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔍 Allowance check attempt ${attempt}/${maxRetries}`);
        await checkAllowance();
        
        // Wait a bit for blockchain state to update
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } catch (error) {
        console.warn(`⚠️ Allowance check attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          console.error('❌ All allowance check attempts failed');
        }
      }
    }
  }, [checkAllowance]);


  // Load available tokens (only for manual claims without selectedTransfer)
  useEffect(() => {
    // Skip loading available tokens if selectedTransfer is provided
    // The token is already determined by the discriminant, and the dropdown is hidden
    if (selectedTransfer) {
      console.log('⏭️ Skipping loadAvailableTokens - token already determined by discriminant');
      return;
    }
    
    if (isOpen && (network?.id === NETWORKS.THREEDPASS.id || network?.id === NETWORKS.ETHEREUM.id)) {
      // Add a delay to ensure network switch has completed
      const timer = setTimeout(() => {
      loadAvailableTokens();
      }, 2000); // Wait 2 seconds for network switch to complete
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, network, loadAvailableTokens, selectedTransfer]);

  // Load token metadata and balance when token address changes
  useEffect(() => {
    if (isOpen && formData.tokenAddress && provider && account) {
      console.log('🔍 Token address changed, loading metadata:', {
        tokenAddress: formData.tokenAddress,
        selectedBridgeAlreadySet: !!selectedBridge,
        hasSelectedTransfer: !!selectedTransfer
      });
      loadTokenMetadata();
      loadTokenBalance();
      
      // Only determine bridge if selectedTransfer is NOT provided
      // If selectedTransfer is provided, the form initialization already used the discriminant to set the bridge
      // We should ONLY use the discriminant, no additional determination
      if (!selectedTransfer) {
        console.log('🔍 No selectedTransfer provided, determining bridge...');
        determineBridge();
      } else {
        console.log('⏭️ Skipping bridge determination - using discriminant result from form initialization only');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, formData.tokenAddress, provider, account, loadTokenMetadata, loadTokenBalance, determineBridge, selectedTransfer]);

  // Load required stake when bridge is determined (even without amount)
  useEffect(() => {
    if (isOpen && selectedBridge && provider) {
      // Load stake with a default amount of 1 if no amount is set
      const amountToUse = formData.amount || '1';
      loadRequiredStakeWithAmount(amountToUse);
    }
  }, [isOpen, selectedBridge, provider, loadRequiredStakeWithAmount, formData.amount]);

  // Load contract settings when bridge is selected
  useEffect(() => {
    if (isOpen && selectedBridge && provider) {
      loadContractSettings();
    }
  }, [isOpen, selectedBridge, provider, loadContractSettings]);

  // Load stake token balance when bridge is selected
  useEffect(() => {
    if (isOpen && selectedBridge && provider && account) {
      loadStakeTokenBalance();
    }
  }, [isOpen, selectedBridge, provider, account, loadStakeTokenBalance]);


  // Set needsApproval to false for native tokens (AddressZero stake token) immediately
  // This effect must run whenever selectedBridge changes to ensure native tokens always have needsApproval=false
  // Use a separate effect with higher priority to ensure it runs after other effects that might reset needsApproval
  useEffect(() => {
    if (isOpen && selectedBridge && selectedBridge.stakeTokenAddress === ethers.constants.AddressZero) {
      // Native tokens don't need approval - set immediately and keep it false
      // Use setTimeout to ensure this runs after any synchronous state updates
      const timer = setTimeout(() => {
        setNeedsApproval(false);
        setAllowance('N/A (Native Token)');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedBridge]);

  // Check allowance when bridge and amount change (only when dialog is open)
  useEffect(() => {
    if (isOpen && selectedBridge && formData.amount && provider && account) {
      // Skip allowance check for native tokens (already handled above)
      if (selectedBridge.stakeTokenAddress !== ethers.constants.AddressZero) {
        checkAllowance();
      }
    }
  }, [isOpen, selectedBridge, formData.amount, provider, account, checkAllowance]);

  // Check if this is a third-party claim
  useEffect(() => {
    if (isOpen) {
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
    }
  }, [isOpen, account, formData.recipientAddress, formData.reward]);

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
      
      // Use the same approach for both networks - direct contract interaction
      // Choose the appropriate ABI based on network and token type
      let tokenABI;
      if (network?.id === NETWORKS.THREEDPASS.id) {
        // For 3DPass, use IP3D_ABI for P3D tokens or IPRECOMPILE_ERC20_ABI for other precompile tokens
        // Use SettingsContext to get P3D token address
        const p3dToken = get3DPassTokenBySymbol('P3D');
        const isP3DToken = p3dToken && selectedBridge.stakeTokenAddress?.toLowerCase() === p3dToken.address?.toLowerCase();
        tokenABI = isP3DToken ? IP3D_ABI : IPRECOMPILE_ERC20_ABI;
      } else {
        // For other networks (like Ethereum), use standard ERC20 ABI
        tokenABI = ERC20_ABI;
      }
      const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, tokenABI, signer);
        
      console.log('🔐 Revoking allowance (setting to 0)...');
        const revokeTx = await tokenContract.approve(selectedBridge.address, 0, { 
          gasLimit: 100000 
        });
        
        console.log('⏳ Waiting for revocation transaction confirmation...');
        await revokeTx.wait();
        console.log('✅ Allowance revoked successfully');
      
      toast.success('Allowance revoked successfully!');
      
      // Refresh allowance display
      await checkAllowance();
      
    } catch (error) {
      console.error('❌ Allowance revocation failed:', error);
      
      const errorInfo = parseError(error);
      
      // Handle transaction replacement as success
      if (errorInfo.type === 'transaction_replaced') {
        console.log('✅ Revoke transaction was repriced and successful');
        
        // Show success notification
        toast.success(
          <div>
            <h3 className="text-success-400 font-medium">Allowance Revoked</h3>
            <p className="text-success-300 text-sm mt-1">
              Your wallet automatically adjusted the gas price. The allowance was successfully revoked.
            </p>
          </div>,
          {
            duration: 6000,
            style: {
              background: '#065f46',
              border: '1px solid #047857',
              color: '#fff',
              padding: '16px',
              borderRadius: '8px',
            },
          }
        );
        
        // Refresh allowance display
        await checkAllowance();
        return;
      }
      
      // Show error notification
      toast.error(
        <div>
          <h3 className="text-error-400 font-medium">{errorInfo.title}</h3>
          <p className="text-error-300 text-sm mt-1">{errorInfo.message}</p>
          {errorInfo.type === 'user_rejection' && (
            <p className="text-error-200 text-xs mt-2">💡 You can try again by clicking the revoke button.</p>
          )}
        </div>,
        {
          duration: 6000,
          style: {
            background: '#7f1d1d',
            border: '1px solid #dc2626',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
          },
        }
      );
    } finally {
      setIsRevoking(false);
    }
  };

  // Handle approval with two-step process for existing allowances
  const handleApproval = async (retryCount = 0) => {
    if (!signer || !selectedBridge || !formData.amount) return;

    setSubmitting(true);
    try {
      console.log('🔍 Starting approval process...', retryCount > 0 ? `(Retry ${retryCount})` : '');
      console.log('📋 Approval details:', {
        stakeTokenAddress: selectedBridge.stakeTokenAddress,
        bridgeAddress: selectedBridge.address,
        requiredStake: requiredStake,
        useMaxAllowance: useMaxAllowance
      });

      // Approve the stake token, not the claim token
      if (network?.id === NETWORKS.THREEDPASS.id) {
        // For 3DPass network, use 3DPass token approval with two-step process
        // Use IP3D_ABI for P3D tokens or IPRECOMPILE_ERC20_ABI for other precompile tokens
        // Use SettingsContext to get P3D token address
        const p3dToken = get3DPassTokenBySymbol('P3D');
        const isP3DToken = p3dToken && selectedBridge.stakeTokenAddress?.toLowerCase() === p3dToken.address?.toLowerCase();
        const tokenABI = isP3DToken ? IP3D_ABI : IPRECOMPILE_ERC20_ABI;
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, tokenABI, signer);
        
        const decimals = await tokenContract.decimals();
        
        // For third-party claims where claim token = stake token, calculate total needed (stake + transfer)
        let approvalAmount;
        if (useMaxAllowance) {
          approvalAmount = getMaxAllowance();
        } else {
          const stakeWei = ethers.utils.parseUnits(requiredStake, decimals);
          
          // Check if this is a third-party claim with same claim/stake token
          if (isThirdPartyClaim && formData.tokenAddress && formData.amount && formData.reward &&
              formData.tokenAddress.toLowerCase() === selectedBridge.stakeTokenAddress?.toLowerCase()) {
            // Since claim token = stake token, use the same decimals from contract
            const amountWei = ethers.BigNumber.from(normalizeAmount(formData.amount));
            const rewardWei = ethers.BigNumber.from(normalizeAmount(formData.reward));
            const transferAmountWei = amountWei.sub(rewardWei);
            
            // Total = stake + transfer amount
            approvalAmount = stakeWei.add(transferAmountWei);
            
            console.log('🔍 3DPass third-party approval calculation:', {
              stakeWei: stakeWei.toString(),
              transferAmountWei: transferAmountWei.toString(),
              totalApprovalAmount: approvalAmount.toString()
            });
          } else {
            approvalAmount = stakeWei;
          }
        }
        
        console.log('💰 Parsed amount for 3DPass approval:', ethers.utils.formatUnits(approvalAmount, decimals));
        console.log('🔐 3DPass approval amount:', useMaxAllowance ? 'Max' : ethers.utils.formatUnits(approvalAmount, decimals));
        
        // Check current allowance
        const currentAllowanceBN = await tokenContract.allowance(await signer.getAddress(), selectedBridge.address);
        console.log('📊 Current 3DPass allowance:', ethers.utils.formatUnits(currentAllowanceBN, decimals));
        
        // For max allowance, check if it's already set to max
        if (useMaxAllowance && currentAllowanceBN.eq(getMaxAllowance())) {
          console.log('✅ Maximum 3DPass allowance already set');
          toast.success('Maximum allowance already set!');
          await checkAllowance();
          return;
        }
        
        // For specific amount, check if current allowance is sufficient
        if (!useMaxAllowance && currentAllowanceBN.gte(approvalAmount)) {
          console.log('✅ Sufficient 3DPass allowance already exists');
          toast.success('Sufficient allowance already exists!');
          await checkAllowance();
          return;
        }

        // For allowance increases, we need to handle this more carefully
        const hasExistingAllowance = currentAllowanceBN.gt(0);
        console.log('🔍 Has existing 3DPass allowance:', hasExistingAllowance);

        console.log('🔐 Approving 3DPass bridge to spend stake tokens...');
        
        // Use different gas strategies based on whether this is an increase or new approval
        const gasOptions = hasExistingAllowance ? {
          gasLimit: 150000, // Higher gas limit for allowance increases
          gasPrice: undefined, // Let the provider estimate
        } : {
          gasLimit: 100000, // Standard gas limit for new approvals
          gasPrice: undefined,
        };

        // First, try to estimate gas to ensure the transaction is valid
        let gasEstimate;
        try {
          gasEstimate = await tokenContract.estimateGas.approve(selectedBridge.address, approvalAmount);
          console.log('⛽ 3DPass gas estimate:', gasEstimate.toString());
          // Add 20% buffer to gas estimate
          gasOptions.gasLimit = gasEstimate.mul(120).div(100);
        } catch (gasError) {
          console.warn('⚠️ 3DPass gas estimation failed, using fallback:', gasError);
          // If gas estimation fails, use a higher fallback
          gasOptions.gasLimit = hasExistingAllowance ? 200000 : 150000;
        }

        console.log('⛽ Using 3DPass gas limit:', gasOptions.gasLimit.toString());

        // For allowance increases, we might need to reset to 0 first
        if (hasExistingAllowance && retryCount === 0) {
          console.log('🔄 Attempting two-step 3DPass approval (reset then approve)...');
          try {
            // Step 1: Reset allowance to 0
            console.log('🔄 Step 1: Resetting 3DPass allowance to 0...');
            const resetTx = await tokenContract.approve(selectedBridge.address, 0, {
              gasLimit: 100000
            });
            await resetTx.wait();
            console.log('✅ 3DPass allowance reset successful');
            
            // Step 2: Set new allowance
            console.log('🔄 Step 2: Setting new 3DPass allowance...');
            const approveTx = await tokenContract.approve(selectedBridge.address, approvalAmount, gasOptions);
            
            console.log('⏳ Waiting for 3DPass approval transaction confirmation...');
            const receipt = await approveTx.wait();
            
            console.log('✅ 3DPass approval transaction confirmed:', receipt.transactionHash);
            
          } catch (twoStepError) {
            console.warn('⚠️ Two-step 3DPass approval failed, trying direct approval:', twoStepError);
            // Fall through to direct approval
            throw twoStepError;
          }
        } else {
          // Direct approval (either new approval or retry)
          const approveTx = await tokenContract.approve(selectedBridge.address, approvalAmount, gasOptions);
          
          console.log('⏳ Waiting for 3DPass approval transaction confirmation...');
          const receipt = await approveTx.wait();
          
          console.log('✅ 3DPass approval transaction confirmed:', receipt.transactionHash);
        }
      } else {
        // For other networks (like Ethereum), use standard ERC20 approval
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, ERC20_ABI, signer);
        
        const decimals = await tokenContract.decimals();
        
        // For third-party claims where claim token = stake token, calculate total needed (stake + transfer)
        let approvalAmount;
        if (useMaxAllowance) {
          approvalAmount = getMaxAllowance();
        } else {
          const stakeWei = ethers.utils.parseUnits(requiredStake, decimals);
          
          // Check if this is a third-party claim with same claim/stake token
          if (isThirdPartyClaim && formData.tokenAddress && formData.amount && formData.reward &&
              formData.tokenAddress.toLowerCase() === selectedBridge.stakeTokenAddress?.toLowerCase()) {
            // Since claim token = stake token, use the same decimals from contract
            const amountWei = ethers.BigNumber.from(normalizeAmount(formData.amount));
            const rewardWei = ethers.BigNumber.from(normalizeAmount(formData.reward));
            const transferAmountWei = amountWei.sub(rewardWei);
            
            // Total = stake + transfer amount
            approvalAmount = stakeWei.add(transferAmountWei);
            
            console.log('🔍 Third-party approval calculation:', {
              stakeWei: stakeWei.toString(),
              transferAmountWei: transferAmountWei.toString(),
              totalApprovalAmount: approvalAmount.toString()
            });
          } else {
            approvalAmount = stakeWei;
          }
        }
        
        console.log('💰 Parsed amount for approval:', ethers.utils.formatUnits(approvalAmount, decimals));
        console.log('🔐 Approval amount:', useMaxAllowance ? 'Max' : ethers.utils.formatUnits(approvalAmount, decimals));
        
        // Check current allowance
        const currentAllowanceBN = await tokenContract.allowance(await signer.getAddress(), selectedBridge.address);
        console.log('📊 Current allowance:', ethers.utils.formatUnits(currentAllowanceBN, decimals));
        
        // For max allowance, check if it's already set to max
        if (useMaxAllowance && currentAllowanceBN.eq(getMaxAllowance())) {
          console.log('✅ Maximum allowance already set');
          toast.success('Maximum allowance already set!');
          await checkAllowance();
          return;
        }
        
        // For specific amount, check if current allowance is sufficient
        if (!useMaxAllowance && currentAllowanceBN.gte(approvalAmount)) {
          console.log('✅ Sufficient allowance already exists');
          toast.success('Sufficient allowance already exists!');
          await checkAllowance();
          return;
        }

        // For allowance increases, we need to handle this more carefully
        const hasExistingAllowance = currentAllowanceBN.gt(0);
        console.log('🔍 Has existing allowance:', hasExistingAllowance);

        console.log('🔐 Approving bridge to spend stake tokens...');
        
        // Use different gas strategies based on whether this is an increase or new approval
        const gasOptions = hasExistingAllowance ? {
          gasLimit: 150000, // Higher gas limit for allowance increases
          gasPrice: undefined, // Let the provider estimate
        } : {
          gasLimit: 100000, // Standard gas limit for new approvals
          gasPrice: undefined,
        };

        // First, try to estimate gas to ensure the transaction is valid
        let gasEstimate;
        try {
          gasEstimate = await tokenContract.estimateGas.approve(selectedBridge.address, approvalAmount);
          console.log('⛽ Gas estimate:', gasEstimate.toString());
          // Add 20% buffer to gas estimate
          gasOptions.gasLimit = gasEstimate.mul(120).div(100);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using fallback:', gasError);
          // If gas estimation fails, use a higher fallback
          gasOptions.gasLimit = hasExistingAllowance ? 200000 : 150000;
        }

        console.log('⛽ Using gas limit:', gasOptions.gasLimit.toString());

        // For allowance increases, we might need to reset to 0 first
        if (hasExistingAllowance && retryCount === 0) {
          console.log('🔄 Attempting two-step approval (reset then approve)...');
          try {
            // Step 1: Reset allowance to 0
            console.log('🔄 Step 1: Resetting allowance to 0...');
            const resetTx = await tokenContract.approve(selectedBridge.address, 0, {
              gasLimit: 100000
            });
            await resetTx.wait();
            console.log('✅ Allowance reset successful');
            
            // Step 2: Set new allowance
            console.log('🔄 Step 2: Setting new allowance...');
            const approveTx = await tokenContract.approve(selectedBridge.address, approvalAmount, gasOptions);
            
            console.log('⏳ Waiting for approval transaction confirmation...');
            const receipt = await approveTx.wait();
            
            console.log('✅ Approval transaction confirmed:', receipt.transactionHash);
            
          } catch (twoStepError) {
            console.warn('⚠️ Two-step approval failed, trying direct approval:', twoStepError);
            // Fall through to direct approval
            throw twoStepError;
          }
        } else {
          // Direct approval (either new approval or retry)
          const approveTx = await tokenContract.approve(selectedBridge.address, approvalAmount, gasOptions);
          
          console.log('⏳ Waiting for approval transaction confirmation...');
          const receipt = await approveTx.wait();
          
          console.log('✅ Approval transaction confirmed:', receipt.transactionHash);
        }
      }

      toast.success('Stake token approval successful!');
      
      // Check allowance after approval with retry mechanism
      console.log('🔍 Checking allowance after approval...');
      await checkAllowanceWithRetry();
    } catch (error) {
      console.error('❌ Approval failed:', error);
      
      const errorInfo = parseError(error);
      
      // Handle transaction replacement as success
      if (errorInfo.type === 'transaction_replaced') {
        console.log('✅ Transaction was repriced and successful');
        
        // Show success notification
        toast.success(
          <div>
            <h3 className="text-success-400 font-medium">Approval Successful</h3>
            <p className="text-success-300 text-sm mt-1">
              Your wallet automatically adjusted the gas price. The approval was successful.
            </p>
          </div>,
          {
            duration: 6000,
            style: {
              background: '#065f46',
              border: '1px solid #047857',
              color: '#fff',
              padding: '16px',
              borderRadius: '8px',
            },
          }
        );
        
        // Refresh allowance display
        await checkAllowance();
        return;
      }
      
      // Check if this is a retryable error and we haven't exceeded retry limit
      if (errorInfo.canRetry && retryCount < 2) {
        console.log(`🔄 Retrying approval (attempt ${retryCount + 1}/2)...`);
        
        // Show retry notification
        toast.error(
          <div>
            <h3 className="text-warning-400 font-medium">Approval Failed - Retrying</h3>
            <p className="text-warning-300 text-sm mt-1">
              The approval transaction failed. Retrying with different parameters... (Attempt {retryCount + 1}/2)
            </p>
          </div>,
          {
            duration: 4000,
            style: {
              background: '#92400e',
              border: '1px solid #f59e0b',
              color: '#fff',
              padding: '16px',
              borderRadius: '8px',
            },
          }
        );
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Retry with different approach
        return handleApproval(retryCount + 1);
      }
      
      // Show final error notification
      toast.error(
        <div>
          <h3 className="text-error-400 font-medium">{errorInfo.title}</h3>
          <p className="text-error-300 text-sm mt-1">{errorInfo.message}</p>
          {errorInfo.type === 'user_rejection' && (
            <p className="text-error-200 text-xs mt-2">💡 You can try again by clicking the approve button.</p>
          )}
          {errorInfo.type === 'gas_error' && (
            <p className="text-error-200 text-xs mt-2">💡 Try increasing the gas limit in your wallet settings.</p>
          )}
          {errorInfo.type === 'contract_error' && (
            <p className="text-error-200 text-xs mt-2">💡 This often happens with existing allowances. Try revoking the current allowance first.</p>
          )}
          {errorInfo.canRetry && retryCount >= 2 && (
            <p className="text-error-200 text-xs mt-2">💡 Multiple retry attempts failed. Try refreshing the page or switching networks.</p>
          )}
        </div>,
        {
          duration: 6000,
          style: {
            background: '#7f1d1d',
            border: '1px solid #dc2626',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
          },
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

     // Handle claim submission
   const handleSubmit = async (e) => {
    console.log('🚀 ===== CLAIM SUBMISSION STARTED =====');
     e.preventDefault();
    
    console.log('🔍 Pre-submission checks...');
    console.log('🔍 Signer:', !!signer);
    console.log('🔍 Selected bridge:', !!selectedBridge);
    console.log('🔍 Needs approval:', needsApproval);
     
     if (!signer || !selectedBridge) {
      console.log('❌ Missing signer or bridge');
       toast.error('Please connect wallet and select a valid token');
       return;
     }

    if (needsApproval) {
      console.log('❌ Approval needed');
      toast.error('Please approve the bridge to spend your tokens first');
      return;
    }

    console.log('🔍 Validating timestamp requirement...');
    // Validate timestamp requirement before submission
    const timestampValidation = await validateTimestampRequirement();
    console.log('🔍 Timestamp validation result:', timestampValidation);
    if (!timestampValidation.isValid) {
      console.log('❌ Timestamp validation failed');
      toast.error(timestampValidation.message);
      return;
    }
    console.log('✅ Timestamp validation passed');

    console.log('🔍 Setting submitting state...');
    setSubmitting(true);
    console.log('🔍 Starting try block...');
    try {
      console.log('🔍 Starting claim submission with data:', {
        bridgeAddress: selectedBridge.address,
        bridgeType: selectedBridge.type,
        formData: formData,
        tokenMetadata: tokenMetadata,
        requiredStake: requiredStake
      });
      
      console.log('🔍 Step 1: Creating bridge contract...');

      // Select the correct ABI based on bridge type (following bot's approach)
      let contractABI;
      switch (selectedBridge.type) {
        case 'export':
          contractABI = EXPORT_ABI;
          console.log('🔍 Using EXPORT_ABI for export bridge');
          break;
        case 'import':
          contractABI = IMPORT_ABI;
          console.log('🔍 Using IMPORT_ABI for import bridge');
          break;
        case 'import_wrapper':
          contractABI = IMPORT_WRAPPER_ABI;
          console.log('🔍 Using IMPORT_WRAPPER_ABI for import wrapper bridge');
          break;
        default:
          throw new Error(`Unknown bridge type: ${selectedBridge.type}`);
      }

      const bridgeContract = new ethers.Contract(
        selectedBridge.address,
        contractABI,
        signer
      );
      console.log('✅ Bridge contract created successfully');
      console.log('🔍 Contract details:');
      console.log('  - Address:', selectedBridge.address);
      console.log('  - Bridge type:', selectedBridge.type);
      console.log('  - ABI length:', contractABI.length);
      console.log('  - Has claim function:', !!bridgeContract.claim);
      console.log('  - Claim function signature:', bridgeContract.interface.getFunction('claim').format());
      
      // Verify the contract address is valid
      if (!ethers.utils.isAddress(selectedBridge.address)) {
        throw new Error(`Invalid contract address: ${selectedBridge.address}`);
      }
      
      // Check if the contract has the expected functions (compatible with older ethers versions)
      const hasClaim = !!bridgeContract.claim;
      const hasGetRequiredStake = !!bridgeContract.getRequiredStake;
      const hasSettings = !!bridgeContract.settings;
      
      console.log('🔍 Contract function availability:');
      console.log('  - has claim function:', hasClaim);
      console.log('  - has getRequiredStake function:', hasGetRequiredStake);
      console.log('  - has settings function:', hasSettings);
      
      if (!hasClaim) {
        throw new Error(`Contract at ${selectedBridge.address} does not have a claim function`);
      }

      // CRITICAL: Ensure exact format matching with bot expectations
      // Parse amounts with exact decimal precision to avoid format mismatches
      console.log('🔍 Step 2: Parsing amounts...');
      const tokenDecimals = getTokenDecimals(network?.id, formData.tokenAddress);
      console.log('🔍 Token decimals:', tokenDecimals);
      
      // Amount from transfer events is always in wei format
      let amountWei;
        amountWei = ethers.BigNumber.from(toWeiString(formData.amount));
      console.log('🔍 Amount is wei format (from transfer event):', {
          originalAmount: formData.amount,
          amountWei: amountWei.toString(),
          humanReadable: ethers.utils.formatUnits(amountWei, tokenDecimals)
        });
      
      // Validate and parse reward (match amount parsing logic)
      const rewardValue = formData.reward || '0';
      console.log('🔍 Raw reward value:', rewardValue, 'Type:', typeof rewardValue);
      
      // Ensure we have a valid string for parseUnits
      const cleanRewardValue = rewardValue.toString().trim();
      let rewardWei;
      
      if (!cleanRewardValue || cleanRewardValue === '') {
        console.log('🔍 Reward is empty, using 0');
        rewardWei = ethers.utils.parseUnits('0', tokenDecimals);
        console.log('🔍 Reward parsed (default 0):', rewardWei.toString());
      } else {
        // Validate it's a valid number string
        if (isNaN(parseFloat(cleanRewardValue))) {
          throw new Error(`Invalid reward value: ${cleanRewardValue} - must be a valid number`);
        }
        
        // Reward from transfer events is always in wei format
          rewardWei = ethers.BigNumber.from(toWeiString(cleanRewardValue));
        console.log('🔍 Reward is wei format (from transfer event):', {
            originalReward: cleanRewardValue,
            rewardWei: rewardWei.toString(),
            humanReadable: ethers.utils.formatUnits(rewardWei, tokenDecimals)
          });
        
        if (!rewardWei) {
          throw new Error(`Failed to parse reward value: ${cleanRewardValue}`);
        }
      }
      
      // Keep amount as BigNumber for proper uint encoding
      const amountBigNumber = amountWei;
      console.log('🔍 Amount BigNumber:', amountBigNumber.toString());
      
      // CRITICAL: Reward should be passed as int, not BigNumber for claim function
      // The ABI expects "int reward", not "uint reward" - convert to integer
      console.log('🔍 Step 3: Converting reward to integer...');
      const rewardBigNumber = rewardWei; // Keep as BigNumber, don't convert to int
      console.log('🔍 Reward BigNumber:', rewardBigNumber.toString());
      console.log('🔍 Reward BigNumber type:', typeof rewardBigNumber);
      console.log('🔍 Reward BigNumber is BigNumber:', ethers.BigNumber.isBigNumber(rewardBigNumber));
      
      // Validate reward is within reasonable bounds
      if (rewardBigNumber.lt(0)) {
        throw new Error('Reward cannot be negative');
      }
      console.log('✅ Reward validation passed');
      
      console.log('🔍 Bot-compatible format validation:', {
        originalAmount: formData.amount,
        originalReward: formData.reward,
        amountWei: amountWei.toString(),
        rewardWei: rewardWei.toString(),
        amountBigNumber: amountBigNumber.toString(),
        rewardBigNumber: rewardBigNumber.toString(),
        tokenDecimals: tokenDecimals,
        formatConsistent: true
      });
      // txts should be passed as BigNumber for proper uint32 encoding
      // Use the exact timestamp from the transfer event (bot pattern)
      console.log('🔍 Step 4: Processing timestamp and addresses...');
      const txtsBigNumber = ethers.BigNumber.from(parseInt(formData.txts));
      console.log('🔍 Timestamp BigNumber:', txtsBigNumber.toString());
      
      const stakeWei = ethers.utils.parseUnits(requiredStake, getStakeTokenDecimals(network?.id, selectedBridge.stakeTokenAddress));
      console.log('🔍 Stake Wei:', stakeWei.toString());

      const senderChecksummed = toChecksumAddress(formData.senderAddress);
      const recipientChecksummed = toChecksumAddress(formData.recipientAddress);
      console.log('🔍 Addresses checksummed:', { senderChecksummed, recipientChecksummed });

      console.log('🔍 Parsed values:', {
        amountWei: amountWei.toString(),
        amountBigNumber: amountBigNumber.toString(),
        rewardWei: rewardWei.toString(),
        rewardBigNumber: rewardBigNumber.toString(),
        txtsBigNumber: txtsBigNumber.toString(),
        stakeWei: stakeWei.toString(),
        txid: formData.txid,
        senderAddress: senderChecksummed,
        recipientAddress: recipientChecksummed,
        data: formData.data
      });

      // Validate that all required fields are present
      console.log('🔍 Step 5: Validating required fields...');
      if (!formData.txid || formData.txid.trim() === '') {
        throw new Error('Transaction ID is required');
      }
      console.log('✅ Transaction ID validation passed');
      
      if (!senderChecksummed || senderChecksummed.trim() === '') {
        throw new Error('Sender address is required');
      }
      console.log('✅ Sender address validation passed');
      
      if (!recipientChecksummed || recipientChecksummed.trim() === '') {
        throw new Error('Recipient address is required');
      }
      console.log('✅ Recipient address validation passed');
      
      if (!ethers.utils.isAddress(recipientChecksummed)) {
        throw new Error('Invalid recipient address format');
      }
      console.log('✅ Address format validation passed');

      // CRITICAL: Validate format consistency with original transfer data
      console.log('🔍 Step 6: Validating format consistency...');
      if (selectedTransfer) {
        console.log('🔍 Selected transfer found, validating format consistency');
        
        // Validate amount format consistency
        if (selectedTransfer.amount) {
          const transferAmountWei = normalizeToWeiString(selectedTransfer.amount);
          const currentAmountWei = toWeiString(formData.amount);
          
          console.log('🔍 Bot format validation - Amount (wei):', {
            transferAmountWei,
            currentAmountWei,
            exactMatch: transferAmountWei === currentAmountWei
          });
          
          // CRITICAL: Ensure exact wei format match to prevent bot challenges
          if (transferAmountWei !== currentAmountWei) {
            throw new Error(`Amount format mismatch: Transfer has "${transferAmountWei}" but claim has "${currentAmountWei}". This will cause bot challenges.`);
          }
        }
        
        // Validate reward format consistency (match amount validation logic)
        if (selectedTransfer.reward) {
          const transferRewardWei = normalizeToWeiString(selectedTransfer.reward);
          const currentRewardWei = toWeiString(formData.reward || '0');
          
          console.log('🔍 Bot format validation - Reward (wei):', {
            transferRewardWei,
            currentRewardWei,
            exactMatch: transferRewardWei === currentRewardWei
          });
          
          // CRITICAL: Ensure exact wei format match to prevent bot challenges
          if (transferRewardWei !== currentRewardWei) {
            throw new Error(`Reward format mismatch: Transfer has "${transferRewardWei}" but claim has "${currentRewardWei}". This will cause bot challenges.`);
          }
        }
        
        // CRITICAL: Validate data field format consistency
        if (selectedTransfer.data !== undefined) {
          // Normalize data field formats for comparison
          const normalizeData = (data) => {
            if (!data) return '0x';
            if (typeof data === 'string') {
              if (data === '0x' || data === '') return '0x';
              if (!data.startsWith('0x')) return '0x' + data;
              return data.toLowerCase();
            }
            return data.toString();
          };
          
          const transferDataNormalized = normalizeData(selectedTransfer.data);
          const currentDataNormalized = normalizeData(formData.data);
          
          console.log('🔍 Bot format validation - Data:', {
            transferData: selectedTransfer.data,
            transferDataNormalized,
            currentData: formData.data,
            currentDataNormalized,
            exactMatch: transferDataNormalized === currentDataNormalized,
            formatConsistent: true
          });
          
          // CRITICAL: Ensure exact format match to prevent bot challenges
          if (transferDataNormalized !== currentDataNormalized) {
            throw new Error(`Data format mismatch: Transfer has "${transferDataNormalized}" but claim has "${currentDataNormalized}". This will cause bot challenges.`);
          }
        }
      }

      // Keep txid in original format (hex string with 0x prefix as expected by bot)
      console.log('🔍 Step 7: Processing transaction ID...');
      const txidString = formData.txid;
      console.log('🔍 Original txid:', txidString);
      
      // Validate txid format
      if (!txidString || txidString.trim() === '') {
        throw new Error('Transaction ID is required');
      }
      console.log('✅ Transaction ID present');
      
      // Ensure txid is properly formatted
      let processedTxid = txidString.trim();
      if (!processedTxid.startsWith('0x')) {
        processedTxid = '0x' + processedTxid;
      }
      console.log('🔍 Processed txid:', processedTxid);
      
      // Check if txid is a valid hex string
      if (!/^0x[0-9a-fA-F]+$/.test(processedTxid)) {
        throw new Error('Transaction ID must be a valid hexadecimal string');
      }
      console.log('✅ Transaction ID format valid');
      
      // Check txid length (should be 66 characters for a 32-byte hash: 0x + 64 hex chars)
      if (processedTxid.length !== 66) {
        console.warn('⚠️ Transaction ID length is unusual:', {
          txid: processedTxid,
          length: processedTxid.length,
          expectedLength: 66
        });
      }
      console.log('✅ Transaction ID processing complete');
      
      // Ensure data parameter is properly formatted
      console.log('🔍 Step 8: Processing data parameter...');
      let processedData = formData.data || '0x';
      console.log('🔍 Original data:', formData.data);
      console.log('🔍 Processed data:', processedData);
      
      // Ensure data is a valid hex string
      if (typeof processedData !== 'string') {
        processedData = '0x';
      }
      
      // Ensure data starts with 0x
      if (!processedData.startsWith('0x')) {
        processedData = '0x' + processedData;
      }
      
      // Validate hex format
      if (!/^0x[0-9a-fA-F]*$/.test(processedData)) {
        console.warn('⚠️ Invalid data format, using default 0x');
        processedData = '0x';
      }
      
      console.log('🔍 Final data parameter:', processedData);
      console.log('✅ Data parameter processing complete');
      
      // Comprehensive logging of all claim transaction parameters
      console.log('🚀 ===== CLAIM TRANSACTION PARAMETERS =====');
      console.log('🔍 Starting parameter logging...');
      
      try {
        console.log('📋 Function: claim()');
        console.log('📋 Bridge Contract:', selectedBridge?.address);
        console.log('📋 Bridge Type:', selectedBridge?.type);
        console.log('📋 Network ID:', network?.id);
        console.log('📋 Network Name:', network?.name);
        console.log('🔍 Basic info logged successfully');
        
        // Check each variable individually to identify the problematic one
        console.log('🔍 Checking individual variables...');
        console.log('🔍 processedTxid:', processedTxid);
        console.log('🔍 txtsBigNumber:', txtsBigNumber?.toString());
        console.log('🔍 amountBigNumber:', amountBigNumber?.toString());
        console.log('🔍 rewardBigNumber:', rewardBigNumber.toString());
        console.log('🔍 stakeWei:', stakeWei?.toString());
        console.log('🔍 senderChecksummed:', senderChecksummed);
        console.log('🔍 recipientChecksummed:', recipientChecksummed);
        console.log('🔍 processedData:', processedData);
        console.log('🔍 All variables checked successfully');
      
        console.log('🔍 Raw Parameters Array (in order):');
        console.log('  [0] txid (bytes32):', processedTxid);
        console.log('  [1] txts (uint32):', txtsBigNumber.toString());
        console.log('  [2] amount (uint256):', amountBigNumber.toString());
        console.log('  [3] reward (int256):', rewardBigNumber.toString());
        console.log('  [4] stake (uint256):', stakeWei.toString(), '(will use stakeWeiForCheck in actual call)');
        console.log('  [5] sender_address (string):', senderChecksummed);
        console.log('  [6] recipient_address (address):', recipientChecksummed);
        console.log('  [7] data (string):', processedData);
        console.log('🔍 Raw parameters logged successfully');
      
        console.log('🔍 Parameter Details:');
        console.log('  📄 Transaction ID:');
        console.log('    - Original:', formData.txid);
        console.log('    - Processed:', processedTxid);
        console.log('    - Length:', processedTxid.length);
        console.log('    - Valid hex:', /^0x[0-9a-fA-F]+$/.test(processedTxid));
      
        console.log('  ⏰ Timestamp:');
        console.log('    - Raw value:', formData.txts);
        console.log('    - BigNumber:', txtsBigNumber.toString());
        console.log('    - Date:', new Date(parseInt(formData.txts) * 1000).toISOString());
        
        console.log('  💰 Amount:');
        console.log('    - Original:', formData.amount);
        console.log('    - Token decimals:', tokenDecimals);
        console.log('    - Wei value:', amountWei.toString());
        console.log('    - BigNumber:', amountBigNumber.toString());
        
        console.log('  🎁 Reward:');
        console.log('    - Original:', formData.reward);
        console.log('    - Wei value:', rewardWei.toString());
        console.log('    - BigNumber value:', rewardBigNumber.toString());
        
        console.log('  🏦 Stake:');
        console.log('    - Required stake:', requiredStake);
        console.log('    - Stake token decimals:', getStakeTokenDecimals(network?.id, selectedBridge.stakeTokenAddress));
        console.log('    - Wei value:', stakeWei.toString());
        console.log('    - Stake token address:', selectedBridge?.stakeTokenAddress);
        console.log('    - Stake token symbol:', selectedBridge?.stakeTokenSymbol);
        
        console.log('  👤 Addresses:');
        console.log('    - Sender (original):', formData.senderAddress);
        console.log('    - Sender (checksummed):', senderChecksummed);
        console.log('    - Recipient (original):', formData.recipientAddress);
        console.log('    - Recipient (checksummed):', recipientChecksummed);
        console.log('    - Current account:', account);
        
        console.log('  📊 Data:');
        console.log('    - Original:', formData.data);
        console.log('    - Processed:', processedData);
        console.log('    - Length:', processedData.length);
        console.log('    - Valid hex:', /^0x[0-9a-fA-F]*$/.test(processedData));
        
        console.log('🔍 Token Information:');
        console.log('  - Token address:', formData.tokenAddress);
        console.log('  - Token symbol:', tokenMetadata?.symbol);
        console.log('  - Token name:', tokenMetadata?.name);
        console.log('  - Token decimals:', tokenMetadata?.decimals);
        console.log('  - Token balance:', tokenBalance);
        
        console.log('🔍 Bridge Information:');
        console.log('  - Bridge address:', selectedBridge?.address);
        console.log('  - Bridge type:', selectedBridge?.type);
        console.log('  - Home network:', selectedBridge?.homeNetwork);
        console.log('  - Foreign network:', selectedBridge?.foreignNetwork);
        console.log('  - Home token address:', selectedBridge?.homeTokenAddress);
        console.log('  - Foreign token address:', selectedBridge?.foreignTokenAddress);
        console.log('  - Stake token address:', selectedBridge?.stakeTokenAddress);
        console.log('  - Stake token symbol:', selectedBridge?.stakeTokenSymbol);
        
        console.log('🔍 Contract Settings:');
        if (contractSettings) {
          console.log('  - Min transaction age:', contractSettings.min_tx_age.toString(), 'seconds');
          console.log('  - Counterstake coefficient:', contractSettings.counterstake_coef100.toString(), '%');
          console.log('  - Ratio:', contractSettings.ratio100.toString(), '%');
          console.log('  - Min stake:', contractSettings.min_stake.toString());
          console.log('  - Large threshold:', contractSettings.large_threshold.toString());
        } else {
          console.log('  - Contract settings: Not loaded');
        }
        
        console.log('🔍 Validation Results:');
        console.log('  - Amount format valid:', formData.amount && !isNaN(parseFloat(formData.amount)));
        console.log('  - Reward format valid:', !formData.reward || !isNaN(parseFloat(formData.reward)));
        console.log('  - Timestamp valid:', formData.txts && !isNaN(parseInt(formData.txts)));
        console.log('  - Sender address valid:', ethers.utils.isAddress(senderChecksummed));
        console.log('  - Recipient address valid:', ethers.utils.isAddress(recipientChecksummed));
        console.log('  - Transaction ID valid:', /^0x[0-9a-fA-F]+$/.test(processedTxid));
        console.log('  - Data field valid:', /^0x[0-9a-fA-F]*$/.test(processedData));
        
        console.log('🔍 Third-party claim check:');
        console.log('  - Is third-party claim:', isThirdPartyClaim);
        console.log('  - Account:', account);
        console.log('  - Recipient:', formData.recipientAddress);
        console.log('  - Reward amount:', formData.reward);
        console.log('🔍 All parameter details logged successfully');
      
        console.log('🚀 ===== END CLAIM TRANSACTION PARAMETERS =====');
      
      console.log('🔍 Calling claim function with parameters:', [
        processedTxid,
        txtsBigNumber,
        amountBigNumber,
          rewardBigNumber,
        stakeWei,
        senderChecksummed,
        recipientChecksummed,
          processedData
        ]);
        
      } catch (loggingError) {
        console.error('❌ ===== PARAMETER LOGGING ERROR =====');
        console.error('❌ Error during parameter logging:', loggingError);
        console.error('❌ Error message:', loggingError.message);
        console.error('❌ Error stack:', loggingError.stack);
        console.error('❌ Error details:', {
          name: loggingError.name,
          message: loggingError.message,
          stack: loggingError.stack
        });
        console.log('🚀 ===== END CLAIM TRANSACTION PARAMETERS (ERROR) =====');
        
        // Re-throw the error so it can be caught by the outer try-catch
        throw loggingError;
      }

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
            const claim = await fetchClaimDetails({
              contract: bridgeContract,
              claimNum: claimNum.toString()
            });
            
            if (!claim) {
              continue; // Skip if claim doesn't exist
            }
            
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
      const amountDecimals = getTokenDecimals(network?.id, formData.tokenAddress);
      
      // Amount from transfer events is always in wei format
      let amountWeiForStake;
      amountWeiForStake = ethers.BigNumber.from(toWeiString(formData.amount));
      console.log('🔍 Pre-flight amount is wei format (from transfer event):', {
          originalAmount: formData.amount,
          amountWeiForStake: amountWeiForStake.toString(),
          humanReadable: ethers.utils.formatUnits(amountWeiForStake, amountDecimals)
        });
      const stake = await bridgeContract.getRequiredStake(amountWeiForStake);
      
      // Use the raw stake value directly to avoid precision issues from double conversion
      const stakeWeiForCheck = stake;
      
      // Check stake token balance and allowance
      let balance, allowance, decimals;
      
      if (selectedBridge.stakeTokenAddress === ethers.constants.AddressZero) {
        // Native token (ETH) - no allowance needed, get balance directly
        console.log('🔍 Native token (ETH) - no allowance needed for pre-flight check');
        balance = await provider.getBalance(account);
        allowance = ethers.BigNumber.from(0); // Native tokens don't need allowance
        decimals = getStakeTokenDecimals(network?.id, selectedBridge.stakeTokenAddress);
        
        const balanceFormatted = ethers.utils.formatUnits(balance, decimals);
        const stakeFormatted = ethers.utils.formatUnits(stakeWeiForCheck, decimals);
        
        console.log('🔍 Pre-flight stake calculation (Native ETH):', {
          rawStake: stake.toString(),
          stakeWei: stakeWeiForCheck.toString(),
          stakeFormatted,
          balance: balance.toString(),
          balanceFormatted,
          decimals,
          hasEnoughBalance: balance.gte(stakeWeiForCheck)
        });
      } else {
        // ERC20 token - check balance and allowance
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, [
          'function balanceOf(address owner) view returns (uint256)',
          'function allowance(address owner, address spender) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ], provider);
        
        [balance, allowance, decimals] = await Promise.all([
          tokenContract.balanceOf(account),
          tokenContract.allowance(account, selectedBridge.address),
          tokenContract.decimals()
        ]);
        
        const balanceFormatted = ethers.utils.formatUnits(balance, decimals);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, decimals);
        const stakeFormatted = ethers.utils.formatUnits(stakeWeiForCheck, decimals);
        
        console.log('🔍 Pre-flight stake calculation (ERC20):', {
          rawStake: stake.toString(),
          stakeWei: stakeWeiForCheck.toString(),
          stakeFormatted,
          balance: balance.toString(),
          balanceFormatted,
          allowance: allowance.toString(),
          allowanceFormatted,
          decimals,
          hasEnoughBalance: balance.gte(stakeWeiForCheck),
          hasEnoughAllowance: allowance.gte(stakeWeiForCheck)
        });
      }
      
      // Final validation checks
      if (balance.lt(stakeWeiForCheck)) {
        const balanceFormatted = ethers.utils.formatUnits(balance, decimals);
        const stakeFormatted = ethers.utils.formatUnits(stakeWeiForCheck, decimals);
        throw new Error(`Insufficient balance. Required: ${stakeFormatted}, Available: ${balanceFormatted}`);
      }
      
      // Only check allowance for ERC20 tokens (not native tokens)
      if (selectedBridge.stakeTokenAddress !== ethers.constants.AddressZero && allowance.lt(stakeWeiForCheck)) {
        const allowanceFormatted = ethers.utils.formatUnits(allowance, decimals);
        const stakeFormatted = ethers.utils.formatUnits(stakeWeiForCheck, decimals);
        throw new Error(`Insufficient allowance. Required: ${stakeFormatted}, Allowed: ${allowanceFormatted}`);
      }

      // Validate parameter ranges before calling
      const txtsValue = parseInt(formData.txts);
      if (txtsValue < 0 || txtsValue > 4294967295) { // uint32 max
        throw new Error(`Invalid txts value: ${txtsValue}. Must be within uint32 range (0-4294967295)`);
      }

      // Use network-specific gas parameters (following bot's approach)
      let gasParams;
      if (network?.id === NETWORKS.THREEDPASS.id) {
        // 3DPass-specific gas parameters (following bot's approach)
        gasParams = {
          value: 0, // For 3DPass, stake is always in P3D token, not native ETH
          gasLimit: 500000,
          maxFeePerGas: 100, // 100 wei (not gwei!)
          maxPriorityFeePerGas: 10 // 10 wei (not gwei!)
        };
        console.log('🔍 Using 3DPass-specific gas parameters:', gasParams);
      } else {
        // For other networks, determine value based on stake token (following bot's logic)
        const stakeTokenAddress = selectedBridge.stakeTokenAddress;
        const isNativeToken = stakeTokenAddress === '0x0000000000000000000000000000000000000000';
        
        if (isNativeToken) {
          // If staking with native token (ETH), send the stake amount as ETH value
          gasParams = {
            value: stakeWeiForCheck.toString()
          };
          console.log('🔍 Using native token stake - sending ETH value:', gasParams.value);
        } else {
          // If staking with ERC20 token, send 0 ETH value
          gasParams = {
            value: 0
          };
          console.log('🔍 Using ERC20 token stake - sending 0 ETH value');
        }
        console.log('🔍 Using default gas handling for network:', network?.name);
      }

      console.log('🔍 About to submit claim transaction...');
      console.log('🔍 Transaction parameters:', {
        processedTxid,
        txtsValue,
        amountBigNumber: amountBigNumber.toString(),
        rewardBigNumber,
        stakeWeiForCheck: stakeWeiForCheck.toString(),
        senderChecksummed,
        recipientChecksummed,
        processedData,
        gasParams
      });
      
      console.log('🔍 Final parameters for claim call:');
      console.log('  - txid:', processedTxid, '(string)');
      console.log('  - txts:', txtsValue, '(uint32)');
      console.log('  - amount:', amountBigNumber.toString(), '(uint256 wei)');
      console.log('  - reward:', rewardBigNumber.toString(), '(int256 wei)');
      console.log('  - stake:', stakeWeiForCheck.toString(), '(uint256 wei)');
      console.log('  - sender_address:', senderChecksummed, '(string)');
      console.log('  - recipient_address:', recipientChecksummed, '(address)');
      console.log('  - data:', processedData, '(string)');
      
      // Additional detailed logging for reward in wei
      console.log('🔍 Reward details in wei format:');
      console.log('  - Original reward input:', formData.reward);
      console.log('  - Reward in wei (BigNumber):', rewardBigNumber.toString());
      console.log('  - Reward human-readable:', ethers.utils.formatUnits(rewardBigNumber, tokenDecimals));
      console.log('  - Token decimals used:', tokenDecimals);
      
      // Debug: Check if any values are undefined or invalid
      console.log('🔍 Parameter validation:');
      console.log('  - txid valid:', !!processedTxid && processedTxid.length > 0);
      console.log('  - txts valid:', !isNaN(txtsValue) && txtsValue >= 0);
      console.log('  - amount valid:', amountBigNumber && amountBigNumber.gt(0));
      console.log('  - reward valid:', rewardBigNumber && ethers.BigNumber.isBigNumber(rewardBigNumber));
      console.log('  - stake valid:', stakeWeiForCheck && stakeWeiForCheck.gt(0));
      console.log('  - sender valid:', !!senderChecksummed && ethers.utils.isAddress(senderChecksummed));
      console.log('  - recipient valid:', !!recipientChecksummed && ethers.utils.isAddress(recipientChecksummed));
      console.log('  - data valid:', typeof processedData === 'string');
      
      // Debug: Log the exact transaction data being sent
      console.log('🔍 About to call contract.claim with these exact parameters:');
      console.log('  - processedTxid:', processedTxid, '(string)');
      console.log('  - txtsValue:', txtsValue, '(number)');
      console.log('  - amountBigNumber:', amountBigNumber.toString(), '(BigNumber)');
      console.log('  - rewardBigNumber:', rewardBigNumber.toString(), '(BigNumber)');
      console.log('  - stakeWeiForCheck:', stakeWeiForCheck.toString(), '(BigNumber)');
      console.log('  - senderChecksummed:', senderChecksummed, '(string)');
      console.log('  - recipientChecksummed:', recipientChecksummed, '(string)');
      console.log('  - processedData:', processedData, '(string)');
      console.log('  - gasParams:', gasParams);
      
      // Try to get the raw transaction data
      try {
        const populatedTx = await bridgeContract.populateTransaction.claim(
          processedTxid,
          txtsValue,
          amountBigNumber,
          rewardBigNumber,
          stakeWeiForCheck,
          senderChecksummed,
          recipientChecksummed,
          processedData
        );
        console.log('🔍 Populated transaction data:', populatedTx);
      } catch (populateError) {
        console.error('🔍 Error populating transaction:', populateError);
      }

      // Try the transaction with network-specific gas parameters
      console.log('🔍 Attempting claim transaction with gas parameters:', gasParams);

      // For native token stakes (ETH), include the stake amount as transaction value
      const transactionParams = {
        ...gasParams
      };

      // If stake token is native (ETH), include the stake amount as value
      if (selectedBridge.stakeTokenAddress === ethers.constants.AddressZero) {
        transactionParams.value = stakeWeiForCheck;
        console.log('🔍 Native token stake - including value in transaction:', stakeWeiForCheck.toString());
      }

      console.log('🔍 Final transaction parameters:', transactionParams);
      
      // Log the complete transaction call with all parameters
      console.log('🔍 Complete transaction call parameters:');
      console.log('  - Function: claim');
      console.log('  - txid:', processedTxid);
      console.log('  - txts:', txtsValue);
      console.log('  - amount (wei):', amountBigNumber.toString());
      console.log('  - reward (wei):', rewardBigNumber.toString());
      console.log('  - stake (wei):', stakeWeiForCheck.toString());
      console.log('  - sender:', senderChecksummed);
      console.log('  - recipient:', recipientChecksummed);
      console.log('  - data:', processedData);
      console.log('  - transaction options:', transactionParams);

      const claimTx = await bridgeContract.claim(
        processedTxid,
        txtsValue, // Use validated uint32 value
        amountBigNumber,
        rewardBigNumber,
        stakeWeiForCheck,
        senderChecksummed,
        recipientChecksummed,
        processedData,
        transactionParams
      );
      
      console.log('✅ Claim transaction submitted successfully:', claimTx.hash);

      console.log('🔍 Claim transaction submitted:', claimTx.hash);
      toast.success('Claim submitted! Waiting for confirmation...');
      
      const receipt = await claimTx.wait();
      console.log('🔍 Claim transaction confirmed:', receipt);
      toast.success(`Claim confirmed! Transaction: ${receipt.transactionHash}`);
      
      // Extract NewClaim event from transaction receipt and fetch complete event data
      try {
        console.log('🔍 Extracting NewClaim event from transaction receipt...');
        
        // Find the NewClaim event in the transaction receipt
        const newClaimEvent = receipt.logs.find(log => {
          try {
            // Parse the log to check if it's a NewClaim event
            const parsedLog = bridgeContract.interface.parseLog(log);
            return parsedLog && parsedLog.name === 'NewClaim';
          } catch (e) {
            return false;
          }
        });
        
        if (!newClaimEvent) {
          console.warn('⚠️ No NewClaim event found in transaction receipt');
          throw new Error('No NewClaim event found in transaction receipt');
        }
        
        // Parse the NewClaim event to get the claim_num
        const parsedEvent = bridgeContract.interface.parseLog(newClaimEvent);
        const claimNum = parsedEvent.args.claim_num.toNumber();
        
        console.log('🔍 Found NewClaim event with claim_num:', claimNum);
        console.log('🔍 NewClaim event data:', {
          claim_num: claimNum,
          author_address: parsedEvent.args.author_address,
          sender_address: parsedEvent.args.sender_address,
          recipient_address: parsedEvent.args.recipient_address,
          txid: parsedEvent.args.txid,
          txts: parsedEvent.args.txts.toString(),
          amount: parsedEvent.args.amount.toString(),
          reward: parsedEvent.args.reward.toString(),
          stake: parsedEvent.args.stake.toString(),
          data: parsedEvent.args.data,
          expiry_ts: parsedEvent.args.expiry_ts.toString()
        });
        
        // CRITICAL: Fetch complete claim details from contract (like normal flow does)
        console.log('🔍 Fetching complete claim details from contract...');
        let claimDetails = null;
        try {
          // Use centralized fetcher
          claimDetails = await fetchClaimDetails({
            contract: bridgeContract,
            claimNum: claimNum.toString()
          });
          
          if (claimDetails) {
            console.log('🔍 Successfully fetched claim details from contract:', claimDetails);
            console.log('🔍 Claim details fields:', {
              claimant_address: claimDetails.claimant_address,
              recipient_address: claimDetails.recipient_address,
              current_outcome: claimDetails.current_outcome,
              finished: claimDetails.finished,
              withdrawn: claimDetails.withdrawn,
              period_number: claimDetails.period_number
            });
          }
        } catch (claimDetailsError) {
          console.warn('⚠️ Failed to fetch claim details from contract:', claimDetailsError.message);
          // Continue with event data only if claim details fetch fails
        }
        
        // Get the network key by matching network ID to NETWORKS configuration
        // This ensures we use the proper key (THREEDPASS, ETHEREUM, BSC) instead of ID or lowercase name
        let networkKey = null;
        if (network?.id) {
          networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].id === network.id);
        }
        // Fallback to network name lookup if ID match fails
        if (!networkKey && network?.name) {
          networkKey = Object.keys(NETWORKS).find(key => 
            NETWORKS[key].name?.toLowerCase() === network.name.toLowerCase()
          );
        }
        // Handle special cases
        if (!networkKey && network?.name) {
          const lowerName = network.name.toLowerCase();
          if (lowerName === '3dpass' || lowerName === '3dpass network') {
            networkKey = 'THREEDPASS';
          } else if (lowerName === 'bsc' || lowerName === 'binance smart chain') {
            networkKey = 'BSC';
          }
        }
        
        if (!networkKey) {
          console.warn('⚠️ Could not determine network key for claim, using network name as fallback:', network?.name);
          networkKey = network?.name || 'Unknown';
        }
        
        // Create the complete event data structure using unified format
        const eventData = createClaimEventData({
          claimNum: claimNum,
          authorAddress: parsedEvent.args.author_address,
          senderAddress: parsedEvent.args.sender_address,
          recipientAddress: parsedEvent.args.recipient_address,
          txid: parsedEvent.args.txid,
          txts: parsedEvent.args.txts,
          amount: parsedEvent.args.amount,
          reward: parsedEvent.args.reward,
          stake: parsedEvent.args.stake,
          data: parsedEvent.args.data,
          expiryTs: parsedEvent.args.expiry_ts,
          blockNumber: receipt.blockNumber,
          transactionHash: receipt.transactionHash,
          logIndex: newClaimEvent.logIndex,
          timestamp: await getBlockTimestamp(signer.provider, receipt.blockNumber),
          bridgeAddress: selectedBridge.address,
          bridgeType: selectedBridge.type,
          homeNetwork: selectedBridge.homeNetwork,
          foreignNetwork: selectedBridge.foreignNetwork,
          homeTokenSymbol: selectedBridge.homeTokenSymbol,
          foreignTokenSymbol: selectedBridge.foreignTokenSymbol,
          networkKey: networkKey,
          networkName: network?.name || 'Unknown'
        });
        
        // Add claim details from contract if available
        if (claimDetails) {
          eventData.current_outcome = claimDetails.current_outcome;
          eventData.yes_stake = normalizeAmount(claimDetails.yes_stake);
          eventData.no_stake = normalizeAmount(claimDetails.no_stake);
          eventData.finished = claimDetails.finished;
          eventData.withdrawn = claimDetails.withdrawn;
          eventData.claimant_address = claimDetails.claimant_address;
          eventData.period_number = claimDetails.period_number;
          eventData.currentOutcome = claimDetails.current_outcome;
          eventData.yesStake = normalizeAmount(claimDetails.yes_stake);
          eventData.noStake = normalizeAmount(claimDetails.no_stake);
        } else {
          // Default values if claim details fetch failed
          eventData.current_outcome = null;
          eventData.yes_stake = null;
          eventData.no_stake = null;
          eventData.finished = false;
          eventData.withdrawn = false;
          eventData.claimant_address = null;
          eventData.period_number = 0;
          eventData.currentOutcome = null;
          eventData.yesStake = null;
          eventData.noStake = null;
        }
        
        console.log('💾 Adding NewClaim event to storage (from contract event):', eventData);
        console.log('🔍 Key fields for aggregation:', {
          claimNum: eventData.claimNum,
          actualClaimNum: eventData.actualClaimNum,
          senderAddress: eventData.senderAddress,
          recipientAddress: eventData.recipientAddress,
          txid: eventData.txid,
          amount: eventData.amount?.toString(),
          reward: eventData.reward?.toString(),
          transactionHash: eventData.transactionHash,
          claimTransactionHash: eventData.claimTransactionHash
        });
        await addClaimEventToStorage(eventData);
        
        // Also update the original transfer status if it exists in storage
        if (selectedTransfer) {
          try {
            const existingTransfers = JSON.parse(localStorage.getItem('bridge_transfers_cache') || '[]');
            const originalTransferIndex = existingTransfers.findIndex(t => 
              t.transactionHash === selectedTransfer.transactionHash || 
              t.txid === selectedTransfer.txid
            );
            
            if (originalTransferIndex >= 0) {
              // Update the original transfer to show it has been claimed
              existingTransfers[originalTransferIndex] = {
                ...existingTransfers[originalTransferIndex],
                status: 'claimed',
                claimTransactionHash: receipt.transactionHash,
                claimBlockNumber: receipt.blockNumber,
                claimTimestamp: await getBlockTimestamp(signer.provider, receipt.blockNumber),
                claimerAddress: await signer.getAddress()
              };
              
              localStorage.setItem('bridge_transfers_cache', JSON.stringify(existingTransfers));
              console.log('✅ Updated original transfer status to claimed');
            }
          } catch (updateError) {
            console.warn('⚠️ Failed to update original transfer status:', updateError);
          }
        }
      } catch (storageError) {
        console.warn('⚠️ Failed to add claim event to storage:', storageError);
      }
      
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
      console.error('❌ ===== CLAIM SUBMISSION ERROR =====');
      console.error('❌ Error submitting claim:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        data: error.data,
        transaction: error.transaction,
        stack: error.stack
      });
      console.error('❌ ===== END CLAIM SUBMISSION ERROR =====');
      
      // Handle different types of errors gracefully
      let errorMessage = 'Claim failed';
      const providerMessage = error.data?.message || error.message;
      
      // Handle transaction repricing (this is actually a success case)
      if (error.code === 'TRANSACTION_REPLACED') {
        console.log('✅ Transaction was repriced successfully');
        console.log('🔍 Replacement transaction details:', {
          newHash: error.replacement?.hash,
          reason: error.reason,
          cancelled: error.cancelled,
          receipt: error.receipt
        });
        
        // Check if the replacement transaction was successful
        if (error.receipt && error.receipt.status === 1) {
          console.log('✅ Replacement transaction confirmed successfully');
          toast.success('Claim submitted successfully! Transaction was repriced for better gas fees.');
          
          // Reset form and close dialog
          setFormData({
            tokenAddress: '',
            amount: '',
            reward: '',
            txid: '',
            txts: '',
            senderAddress: '',
            recipientAddress: '',
            data: '0x'
          });
          
          if (onClose) {
            onClose();
          }
          return; // Exit early since this is actually a success
        } else {
          errorMessage = 'Transaction was repriced but failed. Please try again.';
        }
      } else if (error.code === 4001 || providerMessage?.includes('User denied transaction') || providerMessage?.includes('user rejected transaction')) {
        errorMessage = 'Transaction cancelled by user';
      } else if (providerMessage?.toLowerCase().includes('insufficient funds') || providerMessage?.toLowerCase().includes('insufficient balance')) {
        errorMessage = 'Insufficient funds for gas fees.';
      } else if (error.code === -32603) {
        // Generic provider error; surface original message if any
        errorMessage = providerMessage ? `Provider error (-32603): ${providerMessage}` : 'Provider internal error (-32603). Please try again or reconnect your wallet.';
      } else if (providerMessage?.includes('this transfer has already been claimed') || providerMessage?.includes('already been claimed')) {
        errorMessage = 'Transfer has already been claimed';
      } else if (providerMessage?.includes('ERC20: burn amount exceeds balance') || 
                 error.message?.includes('ERC20: burn amount exceeds balance') ||
                 providerMessage?.includes('execution reverted: ERC20: burn amount exceeds balance') ||
                 error.message?.includes('execution reverted: ERC20: burn amount exceeds balance')) {
        errorMessage = 'Insufficient balance to assist with this transfer';
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
      console.log('🔍 Setting submitting state to false...');
      setSubmitting(false);
      console.log('🚀 ===== CLAIM SUBMISSION COMPLETED =====');
    }
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
          <div className="flex items-center justify-between p-3 border-b border-secondary-800">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-primary-500" />
              <h2 className="text-lg font-bold text-white">
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
          <div className="p-3 sm:p-4 overflow-y-auto max-h-[calc(96vh-8rem)] sm:max-h-[calc(96vh-10rem)]">
            <div className="space-y-4">

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Token Selection */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-4 h-4 text-primary-500" />
                    <h3 className="text-base font-semibold text-white">Token to receive</h3>
                  </div>
                  
                  {/* Only show token selection if no transfer is pre-selected */}
                  {!selectedTransfer && (
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
                  )}
                  
                  {/* Show pre-selected token info when transfer is provided */}
                  {selectedTransfer && formData.tokenAddress && (
                    <div className="p-2 bg-primary-800/30 rounded-lg border border-primary-700">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-3 h-3 text-primary-400" />
                        <span className="text-sm font-medium text-primary-300">Token details</span>
                      </div>
                      <div className="text-sm text-secondary-300">
                        <span className="font-medium">{tokenMetadata?.symbol || 'Token'}</span>
                        <span className="text-secondary-400 ml-2">({ethers.utils.getAddress(formData.tokenAddress)})</span>
                      </div>
                    </div>
                  )}

                  {/* Token Info */}
                  {tokenMetadata && (
                    <div className="bg-dark-800 border border-secondary-700 rounded-lg p-3 mt-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-white text-sm">{tokenMetadata.symbol}</h3>
                          <p className="text-xs text-secondary-400">{tokenMetadata.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-secondary-400">Balance</p>
                          <p className="font-medium text-white">
                            {formatHumanReadableForDisplay(
                              tokenBalance,
                              tokenMetadata?.decimals || getTokenDecimals(network?.id, formData.tokenAddress),
                              formData.tokenAddress,
                              getTokenDecimalsDisplayMultiplier
                            )}
                          </p>
                        </div>
                      </div>
                      
                      {/* Stake Token Balance Display */}
                      {selectedBridge && (
                        <div className="mt-2 p-2 bg-dark-800 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-secondary-400">Stake Token Balance</p>
                              <p className="text-xs text-white">{selectedBridge.stakeTokenSymbol || 'stake'}</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-medium ${
                                !isLoadingStakeBalance && parseFloat(stakeTokenBalance) < parseFloat(requiredStake) 
                                  ? 'text-red-400' 
                                  : 'text-white'
                              }`}>
                                {isLoadingStakeBalance ? 'Loading...' : formatHumanReadableForDisplay(
                                  stakeTokenBalance,
                                  getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress),
                                  selectedBridge?.stakeTokenAddress,
                                  getTokenDecimalsDisplayMultiplier
                                )}
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
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-primary-500" />
                    <h3 className="text-base font-semibold text-white">Bridge Interaction</h3>
                    <span className="px-1.5 py-0.5 bg-primary-600 text-white text-xs rounded-full capitalize">
                      {selectedBridge.type.replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-secondary-400">Bridge Type</p>
                      <p className="font-medium text-white capitalize">{selectedBridge.type.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-secondary-400">Direction</p>
                      <p className="font-medium text-white">
                        {(() => {
                          // Determine direction based on source bridge type (from selectedTransfer.bridgeAddress)
                          if (!selectedTransfer?.bridgeAddress) {
                            // Fallback to mapped bridge direction if no source bridge info
                            return `${selectedBridge.homeNetwork || 'Unknown'} → ${selectedBridge.foreignNetwork || 'Unknown'}`;
                          }
                          
                          // Find the source bridge (the one from selectedTransfer.bridgeAddress)
                          const allBridges = getBridgeInstancesWithSettings();
                          const sourceBridge = Object.values(allBridges || {}).find(bridge => 
                            bridge.address?.toLowerCase() === selectedTransfer.bridgeAddress.toLowerCase()
                          );
                          
                          if (!sourceBridge) {
                            // Fallback to mapped bridge direction if source bridge not found
                            return `${selectedBridge.homeNetwork || 'Unknown'} → ${selectedBridge.foreignNetwork || 'Unknown'}`;
                          }
                          
                          const sourceType = sourceBridge.type?.toLowerCase();
                          
                          // Logic:
                          // 1. If source bridge is Import/ImportWrapper → direction is foreignNetwork → homeNetwork
                          // 2. If source bridge is Export → direction is homeNetwork → foreignNetwork
                          if (sourceType === 'import' || sourceType === 'import_wrapper') {
                            // Source is import/import_wrapper → direction is foreignNetwork → homeNetwork
                            return `${selectedBridge.foreignNetwork || 'Unknown'} → ${selectedBridge.homeNetwork || 'Unknown'}`;
                          } else if (sourceType === 'export') {
                            // Source is export → direction is homeNetwork → foreignNetwork
                            return `${selectedBridge.homeNetwork || 'Unknown'} → ${selectedBridge.foreignNetwork || 'Unknown'}`;
                          } else {
                            // Fallback
                            return `${selectedBridge.homeNetwork || 'Unknown'} → ${selectedBridge.foreignNetwork || 'Unknown'}`;
                          }
                        })()}
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
                        {(() => {
                          // For third-party claims where claim token = stake token, show total needed
                          if (isThirdPartyClaim && formData.tokenAddress && formData.amount && formData.reward &&
                              formData.tokenAddress.toLowerCase() === selectedBridge.stakeTokenAddress?.toLowerCase()) {
                            // Since claim token = stake token, use normalizeAmount and formatAmountForDisplay
                            const amountWei = ethers.BigNumber.from(normalizeAmount(formData.amount));
                            const rewardWei = ethers.BigNumber.from(normalizeAmount(formData.reward));
                            const transferAmountWei = amountWei.sub(rewardWei);
                            const stakeTokenDecimals = getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress);
                            const stakeWei = ethers.utils.parseUnits(requiredStake, stakeTokenDecimals);
                            const totalWei = stakeWei.add(transferAmountWei);
                            
                            return formatAmountForDisplay(
                              totalWei,
                              stakeTokenDecimals,
                              formData.tokenAddress,
                              getTokenDecimalsDisplayMultiplier
                            ) + ` ${selectedBridge?.stakeTokenSymbol || 'stake'} (stake + transfer)`;
                          }
                          return formatHumanReadableForDisplay(
                            requiredStake,
                            getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress),
                            selectedBridge?.stakeTokenAddress,
                            getTokenDecimalsDisplayMultiplier
                          ) + ` ${selectedBridge?.stakeTokenSymbol || 'stake'}`;
                        })()}
                        {formData.amount && (
                          <span className="text-xs text-secondary-400 ml-1">
                            (for {formatAmountForDisplay(
                              ethers.BigNumber.from(normalizeAmount(formData.amount)),
                              getTokenDecimals(network?.id, formData.tokenAddress),
                              formData.tokenAddress,
                              getTokenDecimalsDisplayMultiplier
                            )} {tokenMetadata?.symbol})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  
                  {/* Contract Settings Info */}
                  {contractSettings && (
                    <div className="mt-2 p-2 bg-dark-800 rounded-lg">
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Min Transfer Transaction Age:</span>
                          <span className="text-white">{contractSettings.min_tx_age.toString()}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Counterstake Coefficient:</span>
                          <span className="text-white">{contractSettings.counterstake_coef100.toString()}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Ratio:</span>
                          <span className="text-white">{contractSettings.ratio100.toString()}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Third-Party Claim Warning */}
              {isThirdPartyClaim && selectedBridge && (
                <div className="card border-primary-700 bg-primary-900/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-primary-500" />
                    <h3 className="text-base font-semibold text-white">Third-Party Claim</h3>
                    <span className="px-1.5 py-0.5 bg-warning-600 text-white text-xs rounded-full">
                      Extra Token Required
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm text-secondary-400">
                      You are about to claim on behalf of the sender to speed up the transfer and get rewarded for that.
                    </p>
                    
                    <div className="bg-dark-800 border border-secondary-700 rounded-lg p-2">
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Claim Amount:</span>
                          <span className="font-medium text-white">
                            {(() => {
                              if (!formData.amount) return '0';
                              
                              // Use tokenMetadata decimals if available, otherwise fall back to config
                              const tokenDecimals = tokenMetadata?.decimals ?? getTokenDecimals(network?.id, formData.tokenAddress);
                              
                              // Amount from transfer events is always in wei format
                              const amountWei = ethers.BigNumber.from(toWeiString(formData.amount));
                              const humanReadableAmount = ethers.utils.formatUnits(amountWei, tokenDecimals);
                              
                              // Use decimal-converter utility for consistent formatting
                              return convertActualToDisplay(humanReadableAmount, tokenDecimals, formData.tokenAddress, getTokenDecimalsDisplayMultiplier);
                            })()} {tokenMetadata?.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Reward:</span>
                          <span className="font-medium text-white">
                            {(() => {
                              if (!formData.reward) return '0';
                              
                              // Use tokenMetadata decimals if available, otherwise fall back to config
                              const tokenDecimals = tokenMetadata?.decimals ?? getTokenDecimals(network?.id, formData.tokenAddress);
                              
                              // Reward from transfer events is always in wei format
                              const rewardWei = ethers.BigNumber.from(toWeiString(formData.reward));
                              const humanReadableReward = ethers.utils.formatUnits(rewardWei, tokenDecimals);
                              
                              // Use decimal-converter utility for consistent formatting
                              return convertActualToDisplay(humanReadableReward, tokenDecimals, formData.tokenAddress, getTokenDecimalsDisplayMultiplier);
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Tokens to Transfer:</span>
                          <span className="font-medium text-white">
                            {(() => {
                              if (!formData.amount || !formData.reward) return '0';
                              
                              // Use tokenMetadata decimals if available, otherwise fall back to config
                              const tokenDecimals = tokenMetadata?.decimals ?? getTokenDecimals(network?.id, formData.tokenAddress);
                              
                              // Amount and reward from transfer events are always in wei format
                              const amountWei = ethers.BigNumber.from(toWeiString(formData.amount));
                              const rewardWei = ethers.BigNumber.from(toWeiString(formData.reward));
                              
                              const transferWei = amountWei.sub(rewardWei);
                              
                              // Ensure we don't get negative values
                              if (transferWei.lt(0)) {
                                return '0';
                              }
                              
                              const humanReadableTransfer = ethers.utils.formatUnits(transferWei, tokenDecimals);
                              
                              // Use decimal-converter utility for consistent formatting
                              return convertActualToDisplay(humanReadableTransfer, tokenDecimals, formData.tokenAddress, getTokenDecimalsDisplayMultiplier);
                            })()} {tokenMetadata?.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Your {tokenMetadata?.symbol} Balance:</span>
                          <span className={`font-medium ${
                            (() => {
                              if (!formData.amount || !formData.reward) return false;
                              
                              // Use tokenMetadata decimals if available, otherwise fall back to config
                              const tokenDecimals = tokenMetadata?.decimals ?? getTokenDecimals(network?.id, formData.tokenAddress);
                              
                              // Amount and reward from transfer events are always in wei format
                              const amountWei = ethers.BigNumber.from(toWeiString(formData.amount));
                              const rewardWei = ethers.BigNumber.from(toWeiString(formData.reward));
                              
                              const transferWei = amountWei.sub(rewardWei);
                              
                              // Ensure we don't get negative values
                              if (transferWei.lt(0)) {
                                return false; // Can't check insufficiency if transfer is negative
                              }
                              
                              const balanceWei = ethers.utils.parseUnits(tokenBalance, tokenDecimals);
                              
                              return transferWei.gt(balanceWei);
                            })()
                              ? 'text-red-400' 
                              : 'text-white'
                          }`}>
                            {(() => {
                              // Use tokenMetadata decimals if available, otherwise fall back to config
                              const tokenDecimals = tokenMetadata?.decimals ?? getTokenDecimals(network?.id, formData.tokenAddress);
                              
                              // Use decimal-converter utility for consistent formatting
                              return convertActualToDisplay(tokenBalance, tokenDecimals, formData.tokenAddress, getTokenDecimalsDisplayMultiplier);
                            })()} {tokenMetadata?.symbol}
                            {(() => {
                              if (!formData.amount || !formData.reward) return null;
                              
                              // Use tokenMetadata decimals if available, otherwise fall back to config
                              const tokenDecimals = tokenMetadata?.decimals ?? getTokenDecimals(network?.id, formData.tokenAddress);
                              
                              // Amount and reward from transfer events are always in wei format
                              const amountWei = ethers.BigNumber.from(toWeiString(formData.amount));
                              const rewardWei = ethers.BigNumber.from(toWeiString(formData.reward));
                              
                              const transferWei = amountWei.sub(rewardWei);
                              
                              // Ensure we don't get negative values
                              if (transferWei.lt(0)) {
                                return null; // Don't show insufficiency if transfer is negative
                              }
                              
                              const balanceWei = ethers.utils.parseUnits(tokenBalance, tokenDecimals);
                              
                              return transferWei.gt(balanceWei) ? (
                                <span className="text-xs text-red-400 ml-1">
                                  (Insufficient)
                                </span>
                              ) : null;
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-xs text-secondary-400">
                      <strong>Note:</strong> The bridge will charge your balance with {(() => {
                        if (!formData.amount || !formData.reward) return '0';
                        
                        // Use tokenMetadata decimals if available, otherwise fall back to config
                        const tokenDecimals = tokenMetadata?.decimals ?? getTokenDecimals(network?.id, formData.tokenAddress);
                        
                        // Amount and reward from transfer events are always in wei format
                        const amountWei = ethers.BigNumber.from(toWeiString(formData.amount));
                        const rewardWei = ethers.BigNumber.from(toWeiString(formData.reward));
                        
                        const transferWei = amountWei.sub(rewardWei);
                        
                        // Ensure we don't get negative values
                        if (transferWei.lt(0)) {
                          return '0';
                        }
                        
                        const humanReadableTransfer = ethers.utils.formatUnits(transferWei, tokenDecimals);
                        
                        // Use decimal-converter utility for consistent formatting
                        return convertActualToDisplay(humanReadableTransfer, tokenDecimals, formData.tokenAddress, getTokenDecimalsDisplayMultiplier);
                      })()} {tokenMetadata?.symbol} excluding the reward and transfer it to the recipient. 
                      After the challenge period expires, you will be able to withdraw both the stake 
                      and the transferred amount back to your balance, as long as you win the counterstake.
                    </p>
                  </div>
                </div>
              )}

              {/* Form Fields */}
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-primary-500" />
                    <h3 className="text-base font-semibold text-white">Transaction Details</h3>
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
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                        Timestamp (transfer block timestamp)
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
                      placeholder="Transfer block Unix timestamp"
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
              {needsApproval && selectedBridge && selectedBridge.stakeTokenAddress !== ethers.constants.AddressZero && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-warning-500" />
                    <h3 className="text-base font-semibold text-white">{selectedBridge?.stakeTokenSymbol || 'Stake Token'} Approval Required</h3>
                  </div>
                  
                  <p className="text-xs text-secondary-400 mb-2">
                    {isThirdPartyClaim && formData.tokenAddress && formData.tokenAddress.toLowerCase() === selectedBridge.stakeTokenAddress?.toLowerCase() 
                      ? `The bridge needs permission to spend your ${selectedBridge?.stakeTokenSymbol || 'stake'} tokens for both staking and transferring to the recipient (third-party claim).`
                      : `The bridge needs permission to spend your ${selectedBridge?.stakeTokenSymbol || 'stake'} tokens for staking.`}
                  </p>
                  
                  <div className="bg-warning-900/20 border border-warning-700 rounded-lg p-2 mb-2">
                    <p className="text-xs text-warning-200">
                      <strong>Required:</strong> {(() => {
                        // For third-party claims where claim token = stake token, show total needed
                        if (isThirdPartyClaim && formData.tokenAddress && formData.amount && formData.reward &&
                            formData.tokenAddress.toLowerCase() === selectedBridge.stakeTokenAddress?.toLowerCase()) {
                          // Since claim token = stake token, use normalizeAmount and formatAmountForDisplay
                          const amountWei = ethers.BigNumber.from(normalizeAmount(formData.amount));
                          const rewardWei = ethers.BigNumber.from(normalizeAmount(formData.reward));
                          const transferAmountWei = amountWei.sub(rewardWei);
                          const stakeTokenDecimals = getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress);
                          const stakeWei = ethers.utils.parseUnits(requiredStake, stakeTokenDecimals);
                          const totalWei = stakeWei.add(transferAmountWei);
                          
                          return formatAmountForDisplay(
                            totalWei,
                            stakeTokenDecimals,
                            formData.tokenAddress,
                            getTokenDecimalsDisplayMultiplier
                          ) + ` ${selectedBridge?.stakeTokenSymbol || 'stake'} (stake + transfer for third-party claim)`;
                        }
                        return formatHumanReadableForDisplay(
                          requiredStake,
                          getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress),
                          selectedBridge?.stakeTokenAddress,
                          getTokenDecimalsDisplayMultiplier
                        ) + ` ${selectedBridge?.stakeTokenSymbol || 'stake'} for staking`;
                      })()}
                    </p>
                    <p className="text-xs text-warning-200 mt-1">
                      <strong>Current allowance:</strong> {allowance === 'Max' ? 'Max' : formatHumanReadableForDisplay(
                        allowance,
                        getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress),
                        selectedBridge?.stakeTokenAddress,
                        getTokenDecimalsDisplayMultiplier
                      )} {selectedBridge?.stakeTokenSymbol || 'stake'}
                    </p>
                  </div>
                  
                  {/* Max Allowance Option */}
                  <div className="border-t border-warning-700 pt-2 mb-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
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
                        <p className="text-warning-400 text-xs mt-0.5">
                          Approve unlimited spending to avoid future approval transactions.
                        </p>
                      </div>
                    </label>
                  </div>
                  
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleApproval}
                      disabled={submitting}
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
                    {allowance !== '0' && allowance !== 'Max' && (
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
              {!needsApproval && selectedBridge && selectedBridge.stakeTokenAddress !== ethers.constants.AddressZero && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-success-500" />
                    <h3 className="text-base font-semibold text-white">{selectedBridge?.stakeTokenSymbol || 'Stake Token'} Approval Complete</h3>
                  </div>
                  
                  <p className="text-success-300 text-xs mb-2">
                    Bridge contract is now approved to spend your {selectedBridge?.stakeTokenSymbol || 'stake'} tokens for staking.
                  </p>
                  
                  <div className="bg-success-900/20 border border-success-700 rounded-lg p-2">
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-success-300 text-xs">Current allowance:</span>
                        <span className="text-success-400 font-medium text-xs">
                          {allowance === 'Max' ? 'Max' : formatHumanReadableForDisplay(
                            allowance,
                            getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress),
                            selectedBridge?.stakeTokenAddress,
                            getTokenDecimalsDisplayMultiplier
                          )} {selectedBridge?.stakeTokenSymbol || 'stake'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-success-300 text-xs">Required for staking:</span>
                        <span className="text-success-400 font-medium text-xs">{(() => {
                          // For third-party claims where claim token = stake token, show total needed
                          if (isThirdPartyClaim && formData.tokenAddress && formData.amount && formData.reward &&
                              formData.tokenAddress.toLowerCase() === selectedBridge.stakeTokenAddress?.toLowerCase()) {
                            // Since claim token = stake token, use normalizeAmount and formatAmountForDisplay
                            const amountWei = ethers.BigNumber.from(normalizeAmount(formData.amount));
                            const rewardWei = ethers.BigNumber.from(normalizeAmount(formData.reward));
                            const transferAmountWei = amountWei.sub(rewardWei);
                            const stakeTokenDecimals = getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress);
                            const stakeWei = ethers.utils.parseUnits(requiredStake, stakeTokenDecimals);
                            const totalWei = stakeWei.add(transferAmountWei);
                            
                            return formatAmountForDisplay(
                              totalWei,
                              stakeTokenDecimals,
                              formData.tokenAddress,
                              getTokenDecimalsDisplayMultiplier
                            ) + ` ${selectedBridge?.stakeTokenSymbol || 'stake'} (stake + transfer)`;
                          }
                          return formatHumanReadableForDisplay(
                            requiredStake,
                            getStakeTokenDecimals(network?.id, selectedBridge?.stakeTokenAddress),
                            selectedBridge?.stakeTokenAddress,
                            getTokenDecimalsDisplayMultiplier
                          ) + ` ${selectedBridge?.stakeTokenSymbol || 'stake'}`;
                        })()}</span>
                      </div>
                      {allowance === 'Max' && (
                        <div className="text-xs text-success-300 mt-1.5 p-1.5 bg-success-800/30 rounded border border-success-700">
                          ✅ Maximum allowance set - no future approvals needed for this token
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Revoke Allowance Button - Show if there's any allowance */}
                  {allowance !== '0' && (
                    <button
                      type="button"
                      onClick={handleRevokeAllowance}
                      disabled={isRevoking}
                      className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
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
              <div className="flex gap-2 pt-4">
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
                    disabled={submitting || isInsufficientBalanceForThirdPartyClaim()}
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
