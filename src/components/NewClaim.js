import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { 
  get3DPassTokenMetadata, 
  get3DPassTokenBalance,
  get3DPassTokenAllowance,
  getTokenSymbolFromPrecompile
} from '../utils/threedpass';
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

  // Initialize form when component mounts or token changes
  useEffect(() => {
    if (isOpen) {
      // Add a small delay to ensure network switch has completed
      const timer = setTimeout(async () => {
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
            // CRITICAL: Preserve exact format to match bot expectations
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
              console.log('🔍 Pre-filling reward from transfer (bot-compatible format):', {
                originalReward: selectedTransfer.reward,
                formattedReward: rewardValue,
                tokenDecimals,
                formatPreserved: true
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
      // Get current block timestamp from the provider (after network switch)
      const currentBlock = await provider.getBlock('latest');
      const currentBlockTimestamp = currentBlock.timestamp;
      const transferTimestamp = parseInt(formData.txts);
      const minTxAge = contractSettings.min_tx_age?.toNumber ? contractSettings.min_tx_age.toNumber() : parseInt(contractSettings.min_tx_age);
      
      const requiredTimestamp = transferTimestamp + minTxAge;
      const timeRemaining = requiredTimestamp - currentBlockTimestamp;
      
      console.log('🔍 Timestamp validation:', {
        currentBlockTimestamp,
        currentBlockNumber: currentBlock.number,
        transferTimestamp,
        minTxAge,
        requiredTimestamp,
        timeRemaining,
        isValid: currentBlockTimestamp >= requiredTimestamp
      });

      if (currentBlockTimestamp < requiredTimestamp) {
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
          message: `Claim is too early. Please wait ${timeMessage} more (min_tx_age: ${minTxAge}s)`
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
        getBridgeABI(selectedBridge.type),
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
  }, [selectedBridge, provider, formData.tokenAddress, network?.id, getBridgeABI]);


  // Check allowance
  const checkAllowance = useCallback(async (stakeAmount = requiredStake) => {
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
      const allowanceWei = ethers.utils.parseUnits(currentAllowance, stakeTokenDecimals);
      
      // Check if current allowance is at maximum value and display "Max" instead
      const isMaxAllowance = allowanceWei.eq(ethers.constants.MaxUint256) || allowanceWei.gt(ethers.utils.parseUnits('1000000000', stakeTokenDecimals));
      
      console.log('🔍 Allowance check results:', {
        currentAllowance,
        stakeAmount,
        allowanceWei: allowanceWei.toString(),
        stakeWei: stakeWei.toString(),
        isMaxAllowance,
        needsApproval: allowanceWei.lt(stakeWei),
        allowanceComparison: `${allowanceWei.toString()} >= ${stakeWei.toString()} = ${allowanceWei.gte(stakeWei)}`
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
        // For non-max allowance cases, check if current allowance is sufficient for required stake
        needsApprovalResult = allowanceWei.lt(stakeWei);
      }
      
      console.log('🔍 Setting needsApproval to:', needsApprovalResult);
      setNeedsApproval(needsApprovalResult);
    } catch (error) {
      console.error('Error checking stake token allowance:', error);
      setAllowance('0');
      setNeedsApproval(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBridge, formData.amount, provider, account, network?.id]);

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

  // Periodic allowance check to keep UI in sync
  useEffect(() => {
    if (!isOpen || !selectedBridge || !provider || !account) return;

    // Check allowance immediately
    checkAllowance();

    // Set up periodic check every 10 seconds
    const interval = setInterval(() => {
      console.log('🔄 Periodic allowance check...');
      checkAllowance();
    }, 10000);

    return () => clearInterval(interval);
  }, [isOpen, selectedBridge, provider, account, checkAllowance]);

  // Load available tokens
  useEffect(() => {
    if (isOpen && (network?.id === NETWORKS.THREEDPASS.id || network?.id === NETWORKS.ETHEREUM.id)) {
      // Add a delay to ensure network switch has completed
      const timer = setTimeout(() => {
      loadAvailableTokens();
      }, 2000); // Wait 2 seconds for network switch to complete
      
      return () => clearTimeout(timer);
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

  // Load contract settings when bridge is selected
  useEffect(() => {
    if (selectedBridge && provider) {
      loadContractSettings();
    }
  }, [selectedBridge, provider, loadContractSettings]);

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
      
      // Use the same approach for both networks - direct contract interaction
      // Choose the appropriate ABI based on network and token type
      let tokenABI;
      if (network?.id === NETWORKS.THREEDPASS.id) {
        // For 3DPass, use IP3D_ABI for P3D tokens or IPRECOMPILE_ERC20_ABI for other precompile tokens
        const isP3DToken = selectedBridge.stakeTokenAddress === NETWORKS.THREEDPASS.tokens.P3D.address;
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
        const isP3DToken = selectedBridge.stakeTokenAddress === NETWORKS.THREEDPASS.tokens.P3D.address;
        const tokenABI = isP3DToken ? IP3D_ABI : IPRECOMPILE_ERC20_ABI;
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, tokenABI, signer);
        
        const decimals = await tokenContract.decimals();
        const approvalAmount = useMaxAllowance ? getMaxAllowance() : ethers.utils.parseUnits(requiredStake, decimals);
        
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
        const approvalAmount = useMaxAllowance ? getMaxAllowance() : ethers.utils.parseUnits(requiredStake, decimals);
        
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
      
      const amountWei = ethers.utils.parseUnits(formData.amount, tokenDecimals);
      console.log('🔍 Amount parsed:', amountWei.toString());
      
      // Validate and parse reward
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
        
        rewardWei = ethers.utils.parseUnits(cleanRewardValue, tokenDecimals);
        console.log('🔍 Reward parsed:', rewardWei.toString());
        
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
      
      const stakeWei = ethers.utils.parseUnits(requiredStake, getStakeTokenDecimals(network?.id));
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
        const tokenDecimals = getTokenDecimals(network?.id, formData.tokenAddress);
        
        // Validate amount format consistency
        if (selectedTransfer.amount) {
          const transferAmountFormatted = typeof selectedTransfer.amount === 'string' ? 
            (selectedTransfer.amount.startsWith('0x') ? 
              ethers.utils.formatUnits(selectedTransfer.amount, tokenDecimals) : 
              selectedTransfer.amount) : 
            ethers.utils.formatUnits(selectedTransfer.amount, tokenDecimals);
          
          const currentAmountFormatted = formData.amount;
          
          console.log('🔍 Bot format validation - Amount:', {
            transferAmount: selectedTransfer.amount,
            transferAmountFormatted,
            currentAmount: formData.amount,
            currentAmountFormatted,
            exactMatch: transferAmountFormatted === currentAmountFormatted,
            formatConsistent: true
          });
          
          // CRITICAL: Ensure exact format match to prevent bot challenges
          if (transferAmountFormatted !== currentAmountFormatted) {
            throw new Error(`Amount format mismatch: Transfer has "${transferAmountFormatted}" but claim has "${currentAmountFormatted}". This will cause bot challenges.`);
          }
        }
        
        // Validate reward format consistency
        if (selectedTransfer.reward) {
          const transferRewardFormatted = typeof selectedTransfer.reward === 'string' ? 
            (selectedTransfer.reward.startsWith('0x') ? 
              ethers.utils.formatUnits(selectedTransfer.reward, tokenDecimals) : 
              selectedTransfer.reward) : 
            ethers.utils.formatUnits(selectedTransfer.reward, tokenDecimals);
          
          const currentRewardFormatted = formData.reward || '0';
          
          console.log('🔍 Bot format validation - Reward:', {
            transferReward: selectedTransfer.reward,
            transferRewardFormatted,
            currentReward: formData.reward,
            currentRewardFormatted,
            exactMatch: transferRewardFormatted === currentRewardFormatted,
            formatConsistent: true
          });
          
          // CRITICAL: Ensure exact format match to prevent bot challenges
          if (transferRewardFormatted !== currentRewardFormatted) {
            throw new Error(`Reward format mismatch: Transfer has "${transferRewardFormatted}" but claim has "${currentRewardFormatted}". This will cause bot challenges.`);
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
        console.log('    - Stake token decimals:', getStakeTokenDecimals(network?.id));
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
            const claim = await bridgeContract['getClaim(uint256)'](claimNum);
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
      console.log('  - amount:', amountBigNumber.toString(), '(uint256)');
      console.log('  - reward:', rewardBigNumber.toString(), '(int256)');
      console.log('  - stake:', stakeWeiForCheck.toString(), '(uint256)');
      console.log('  - sender_address:', senderChecksummed, '(string)');
      console.log('  - recipient_address:', recipientChecksummed, '(address)');
      console.log('  - data:', processedData, '(string)');
      
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

      const claimTx = await bridgeContract.claim(
        processedTxid,
        txtsValue, // Use validated uint32 value
        amountBigNumber,
        rewardBigNumber,
        stakeWeiForCheck,
        senderChecksummed,
        recipientChecksummed,
        processedData,
        gasParams
      );
      
      console.log('✅ Claim transaction submitted successfully:', claimTx.hash);

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
                    <div className="p-3 bg-primary-800/30 rounded-lg border border-primary-700">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-4 h-4 text-primary-400" />
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
                    <h3 className="text-lg font-semibold text-white">Bridge Interaction</h3>
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
                        {selectedBridge.type === 'export' ? 
                          (selectedBridge.foreignNetwork || '3DPass') : 
                          (selectedBridge.homeNetwork || 'External')
                        } → {network?.name || 'Current Network'}
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
                  
                  
                  {/* Contract Settings Info */}
                  {contractSettings && (
                    <div className="mt-4 p-3 bg-dark-800 rounded-lg">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-secondary-400">Min Transaction Age:</span>
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
                  <div className="flex items-center gap-3 mb-4">
                    <Info className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">Third-Party Claim</h3>
                    <span className="px-2 py-1 bg-warning-600 text-white text-xs rounded-full">
                      Extra Token Required
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-sm text-secondary-400">
                      You are about to claim on behalf of the sender to speed up the transfer and get rewarded for that.
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
                          <span className="text-secondary-400">Tokens to Transfer:</span>
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
                      <strong>Note:</strong> The bridge will charge your balance with {formData.amount && formData.reward ? 
                        (parseFloat(formData.amount) - parseFloat(formData.reward)).toFixed(6) : 
                        '0'
                      } {tokenMetadata?.symbol} excluding the reward and transfer it to the recipient. 
                      After the challenge period expires, you will be able to withdraw both the stake 
                      and the transferred amount back to your balance, as long as you win the counterstake.
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
                      <strong>Current allowance:</strong> {allowance === 'Max' ? 'Max' : formatStakeTokenForDisplay(allowance, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'}
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
                          {allowance === 'Max' ? 'Max' : formatStakeTokenForDisplay(allowance, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-success-300 text-sm">Required for staking:</span>
                        <span className="text-success-400 font-medium text-sm">{formatStakeTokenForDisplay(requiredStake, network?.id)} {selectedBridge?.stakeTokenSymbol || 'stake'}</span>
                      </div>
                      {allowance === 'Max' && (
                        <div className="text-xs text-success-300 mt-2 p-2 bg-success-800/30 rounded border border-success-700">
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
                    disabled={submitting}
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
