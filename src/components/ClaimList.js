import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { 
  getAllClaims, 
  createCounterstakeContract 
} from '../utils/bridge-contracts';
import { 
  Clock, 
  CheckCircle, 
  User,
  Users,
  Plus,
  Download,
  ArrowDown,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import NewClaim from './NewClaim';
import WithdrawClaim from './WithdrawClaim';
import Challenge from './Challenge';

const ClaimList = () => {
  const { account, provider, network, isConnected, getNetworkWithSettings } = useWeb3();
  const { getBridgeInstancesWithSettings } = useSettings();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' or 'my'
  const [currentBlock, setCurrentBlock] = useState(null);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);

  // All useCallback hooks must be at the top level
  const formatAmount = useCallback((amount, decimals = 18) => {
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
      
      // Only trim trailing zeros if the value is not very small
      if (rawValue >= 1e-15) {
        formatted = formatted.replace(/\.?0+$/, '');
      }
      
      console.log(`🔍 formatAmount: formatted result: ${formatted}`);
      return formatted;
    } catch (error) {
      console.error('Error formatting amount:', amount, error);
      return '0.000000';
    }
  }, []);

  const getTransferTokenSymbol = useCallback((claim) => {
    // First, try to use the token symbol from bridge settings (most accurate)
    if (claim.bridgeTokenSymbol) {
      return claim.bridgeTokenSymbol;
    }
    
    // Fallback to bridge configuration
    if (claim.bridgeType === 'import' || claim.bridgeType === 'import_wrapper') {
      return claim.homeTokenSymbol || 'Unknown';
    }
    if (claim.bridgeType === 'export') {
      return claim.foreignTokenSymbol || 'Unknown';
    }
    
    // Final fallback to network symbol
    return network?.symbol || 'Unknown';
  }, [network?.symbol]);

  const getTokenDecimals = useCallback((claim) => {
    // Get decimals from network configuration
    const tokenSymbol = getTransferTokenSymbol(claim);
    
    // For import claims, the token is from the foreign network
    // For export claims, the token is from the current network
    let targetNetworkSymbol = network?.symbol;
    
    if (claim.bridgeType === 'import' || claim.bridgeType === 'import_wrapper') {
      // For imports, token is from the foreign network (e.g., USDT from Ethereum)
      // Try to get the foreign network from bridge instance or use default
      targetNetworkSymbol = claim.bridgeInstance?.foreignNetwork || 
                           claim.foreignNetwork || 
                           'ETHEREUM';
    } else if (claim.bridgeType === 'export') {
      // For exports, token is from the current network (e.g., P3D from 3DPass)
      targetNetworkSymbol = network?.symbol;
    }
    
    console.log(`🔍 Looking for ${tokenSymbol} decimals in ${targetNetworkSymbol} network (bridgeType: ${claim.bridgeType})`);
    
    // Try to get decimals from the target network first
    const networkConfig = getNetworkWithSettings(targetNetworkSymbol);
    if (networkConfig && networkConfig.tokens) {
      const token = networkConfig.tokens[tokenSymbol];
      if (token && token.decimals) {
        console.log(`🔍 Found decimals for ${tokenSymbol} in ${targetNetworkSymbol} config:`, token.decimals);
        return token.decimals;
      }
    }
    
    // If not found in target network, search all networks
    console.log(`🔍 ${tokenSymbol} not found in ${targetNetworkSymbol}, searching all networks...`);
    
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
    
    // If not found in any network config, use a reasonable default
    console.log(`🔍 No decimals found for ${tokenSymbol} in any network config, using default: 18`);
    return 18;
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
    
    return account.toLowerCase() === claim.recipientAddress.toLowerCase();
  }, [account, currentBlock]);

  // Helper function to check if current user is the recipient
  const isCurrentUserRecipient = useCallback((claim) => {
    if (!account || !claim.recipientAddress) {
      return false;
    }
    
    return account.toLowerCase() === claim.recipientAddress.toLowerCase();
  }, [account]);

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

  // Load claims
  const loadClaims = useCallback(async () => {
    // Comprehensive connection check
    if (!isConnected || !account || !provider || !network) {
      console.log('🔍 loadClaims: Missing required connection data', {
        isConnected,
        hasAccount: !!account,
        hasProvider: !!provider,
        hasNetwork: !!network
      });
      return;
    }

    // Additional check to ensure MetaMask is properly connected
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      console.log('🔍 loadClaims: MetaMask not available');
      return;
    }

    // Check if MetaMask is unlocked and has accounts
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        console.log('🔍 loadClaims: No accounts found in MetaMask');
        return;
      }
      
      // Verify the account matches
      if (accounts[0].toLowerCase() !== account.toLowerCase()) {
        console.log('🔍 loadClaims: Account mismatch', {
          expected: account,
          actual: accounts[0]
        });
        return;
      }
    } catch (error) {
      console.log('🔍 loadClaims: Error checking MetaMask accounts:', error);
      return;
    }

    setLoading(true);
    try {
      const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].id === network.id);
      if (!networkKey) {
        throw new Error('Network configuration not found');
      }
      
      const networkConfig = getNetworkWithSettings(networkKey);
      if (!networkConfig || !networkConfig.contracts) {
        throw new Error('Network configuration not found');
      }

      // Get bridges for the current network from network config and custom settings
      const defaultBridges = networkConfig.bridges ? Object.values(networkConfig.bridges) : [];
      
      // Also get import bridges that are defined at the network level (not in bridges object)
      const importBridges = Object.entries(networkConfig)
        .filter(([key, value]) => 
          key !== 'bridges' && 
          key !== 'assistants' && 
          key !== 'tokens' && 
          key !== 'contracts' &&
          typeof value === 'object' && 
          value.address && 
          (value.type === 'import' || value.type === 'import_wrapper')
        )
        .map(([key, value]) => value);
      
      const allDefaultBridges = [...defaultBridges, ...importBridges];
      
      const customBridges = getBridgeInstancesWithSettings();
      const customNetworkBridges = Object.values(customBridges).filter(bridge => {
        // For export bridges: include when current network is the home network
        if (bridge.type === 'export') {
          return bridge.homeNetwork === networkConfig.name;
        }
        // For import bridges: include when current network is the foreign network
        if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          return bridge.foreignNetwork === networkConfig.name;
        }
        // For other types, use the old logic
        return bridge.homeNetwork === networkConfig.name || bridge.foreignNetwork === networkConfig.name;
      });
      
      // Combine default bridges with custom bridges, avoiding duplicates
      const networkBridgeInstances = [...allDefaultBridges];
      customNetworkBridges.forEach(customBridge => {
        const exists = networkBridgeInstances.some(bridge => bridge.address === customBridge.address);
        if (!exists) {
          networkBridgeInstances.push(customBridge);
        }
      });

      // Detailed logging for bridge discovery verification
      console.log('🔍 BRIDGE DISCOVERY DEBUG:', {
        networkKey,
        networkName: networkConfig.name,
        networkId: network.id,
        defaultBridgesCount: defaultBridges.length,
        defaultBridges: defaultBridges.map(bridge => ({
          address: bridge.address,
          type: bridge.type,
          homeNetwork: bridge.homeNetwork,
          foreignNetwork: bridge.foreignNetwork,
          homeTokenSymbol: bridge.homeTokenSymbol,
          foreignTokenSymbol: bridge.foreignTokenSymbol
        })),
        importBridgesCount: importBridges.length,
        importBridges: importBridges.map(bridge => ({
          address: bridge.address,
          type: bridge.type,
          homeNetwork: bridge.homeNetwork,
          foreignNetwork: bridge.foreignNetwork,
          homeTokenSymbol: bridge.homeTokenSymbol,
          foreignTokenSymbol: bridge.foreignTokenSymbol
        })),
        allDefaultBridgesCount: allDefaultBridges.length,
        customBridgesCount: Object.keys(customBridges).length,
        customBridges: Object.values(customBridges).map(bridge => ({
          address: bridge.address,
          type: bridge.type,
          homeNetwork: bridge.homeNetwork,
          foreignNetwork: bridge.foreignNetwork,
          homeTokenSymbol: bridge.homeTokenSymbol,
          foreignTokenSymbol: bridge.foreignTokenSymbol
        })),
        customNetworkBridgesCount: customNetworkBridges.length,
        customNetworkBridges: customNetworkBridges.map(bridge => ({
          address: bridge.address,
          type: bridge.type,
          homeNetwork: bridge.homeNetwork,
          foreignNetwork: bridge.foreignNetwork,
          homeTokenSymbol: bridge.homeTokenSymbol,
          foreignTokenSymbol: bridge.foreignTokenSymbol
        })),
        finalNetworkBridgeInstancesCount: networkBridgeInstances.length,
        finalNetworkBridgeInstances: networkBridgeInstances.map(bridge => ({
          address: bridge.address,
          type: bridge.type,
          homeNetwork: bridge.homeNetwork,
          foreignNetwork: bridge.foreignNetwork,
          homeTokenSymbol: bridge.homeTokenSymbol,
          foreignTokenSymbol: bridge.foreignTokenSymbol
        }))
      });
      
      console.log('🔍 Bridge detection debug:', {
        networkName: network.name,
        networkId: network.id,
        networkChainId: network.chainId,
        networkKey: networkKey,
        totalBridgeInstances: networkBridgeInstances.length,
        bridgeInstances: networkBridgeInstances.map(bridge => ({
          address: bridge.address,
          homeNetwork: bridge.homeNetwork,
          foreignNetwork: bridge.foreignNetwork,
          type: bridge.type
        }))
      });
      
      console.log('🔍 Filtered bridge instances:', networkBridgeInstances.length);

      if (networkBridgeInstances.length === 0) {
        throw new Error('No bridge instances found for this network');
      }

      // Get current block for timestamp calculations
      const block = await provider.getBlock('latest');
      setCurrentBlock(block);

        // Fetch claims from all bridge instances
        const allClaims = [];
        console.log('🔍 FETCHING CLAIMS FROM BRIDGES:', {
          totalBridges: networkBridgeInstances.length,
          filter,
          account: account || 'not connected'
        });
        
        for (const bridgeInstance of networkBridgeInstances) {
          console.log(`🔍 Processing bridge: ${bridgeInstance.address} (${bridgeInstance.type})`);
          try {
            // Additional safety check before creating contract
            if (!provider || !bridgeInstance.address) {
              console.log(`🔍 Skipping bridge ${bridgeInstance.address}: missing provider or address`);
              continue;
            }
            
            const contract = await createCounterstakeContract(provider, bridgeInstance.address);
            console.log(`✅ Contract created for bridge: ${bridgeInstance.address}`);
            
            // Get the RPC URL from the current network settings
            const currentNetwork = getNetworkWithSettings(network?.symbol);
            const rpcUrl = currentNetwork?.rpcUrl || network?.rpcUrl || 'http://127.0.0.1:9978';
            console.log(`🔍 Using RPC URL for claims: ${rpcUrl}`);
            console.log(`🔍 Current network:`, network);
            console.log(`🔍 Network with settings:`, currentNetwork);
            
            let bridgeClaims;
            if (filter === 'my') {
              console.log(`🔍 Fetching claims for recipient: ${account}`);
              // For "My Claims", we need to filter by recipient address
              // Since getClaimsForRecipient gets claims where user is recipient,
              // we'll get all claims and filter by recipient on the frontend
              bridgeClaims = await getAllClaims(contract, 100, rpcUrl);
            } else {
              console.log(`🔍 Fetching all claims`);
              bridgeClaims = await getAllClaims(contract, 100, rpcUrl);
            }
            
            console.log(`✅ Fetched ${bridgeClaims.length} claims from bridge: ${bridgeInstance.address}`);
          console.log(`🔍 Bridge instance data:`, {
            address: bridgeInstance.address,
            type: bridgeInstance.type,
            homeNetwork: bridgeInstance.homeNetwork,
            foreignNetwork: bridgeInstance.foreignNetwork,
            homeTokenSymbol: bridgeInstance.homeTokenSymbol,
            foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
            homeTokenAddress: bridgeInstance.homeTokenAddress,
            foreignTokenAddress: bridgeInstance.foreignTokenAddress
          });

          // Add bridge information to each claim and transform field names
          const claimsWithBridgeInfo = await Promise.all(bridgeClaims.map(async (claim, index) => {
            // Fetch token information from bridge settings
            let bridgeTokenSymbol = null;
            let bridgeTokenAddress = null;
            
            try {
              // Get the bridge settings to find the token address
              const settings = await contract.settings();
              bridgeTokenAddress = settings.tokenAddress;
              
              console.log(`🔍 Bridge settings for ${bridgeInstance.address}:`, {
                tokenAddress: bridgeTokenAddress,
                bridgeType: bridgeInstance.type,
                homeTokenSymbol: bridgeInstance.homeTokenSymbol,
                foreignTokenSymbol: bridgeInstance.foreignTokenSymbol
              });
              
              // For import bridges, the amount should be in the home token (e.g., USDT from Ethereum)
              // For export bridges, the amount should be in the home token (e.g., P3D from 3DPass)
              if (bridgeInstance.type === 'import' || bridgeInstance.type === 'import_wrapper') {
                // Import bridges: amount is in the home token (e.g., USDT from foreign network)
                bridgeTokenSymbol = bridgeInstance.homeTokenSymbol;
                bridgeTokenAddress = bridgeInstance.homeTokenAddress;
              } else if (bridgeInstance.type === 'export') {
                // Export bridges: amount is in the home token (e.g., P3D from current network)
                bridgeTokenSymbol = bridgeInstance.homeTokenSymbol;
                bridgeTokenAddress = bridgeInstance.homeTokenAddress;
              } else {
                // Fallback to bridge settings
                if (bridgeTokenAddress) {
                  // Use the bridge configuration to get the token symbol
                  bridgeTokenSymbol = bridgeInstance.homeTokenSymbol || bridgeInstance.foreignTokenSymbol;
                }
              }
            } catch (error) {
              console.log(`🔍 Could not fetch bridge settings for ${bridgeInstance.address}:`, error.message);
              // Fallback to bridge configuration
              bridgeTokenSymbol = bridgeInstance.homeTokenSymbol || bridgeInstance.foreignTokenSymbol;
              bridgeTokenAddress = bridgeInstance.homeTokenAddress || bridgeInstance.foreignTokenAddress;
            }
            
            const claimWithInfo = {
              // Transform field names to match expected UI structure
              claimNum: index + 1, // Display number for UI
              actualClaimNum: claim.claim_num, // Actual blockchain claim number
              

              amount: claim.amount,
              recipientAddress: claim.recipient_address,
              currentOutcome: claim.current_outcome,
              yesStake: claim.yes_stake,
              noStake: claim.no_stake,
              expiryTs: claim.expiry_ts,
              finished: claim.finished,
              withdrawn: claim.withdrawn,
              senderAddress: claim.sender_address,
              data: claim.data,
              // Keep original fields for debugging
              ...claim,
              // Add bridge information
              bridgeInstance,
              bridgeAddress: bridgeInstance.address,
              bridgeType: bridgeInstance.type,
              homeNetwork: bridgeInstance.homeNetwork,
              foreignNetwork: bridgeInstance.foreignNetwork,
              homeTokenAddress: bridgeInstance.homeTokenAddress,
              foreignTokenAddress: bridgeInstance.foreignTokenAddress,
              homeTokenSymbol: bridgeInstance.homeTokenSymbol,
              foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
              // Add token info from bridge settings
              bridgeTokenAddress,
              bridgeTokenSymbol
            };
            
            console.log(`🔍 Claim ${index + 1} with bridge info:`, {
              claimNum: claimWithInfo.claimNum,
              bridgeType: claimWithInfo.bridgeType,
              homeTokenSymbol: claimWithInfo.homeTokenSymbol,
              foreignTokenSymbol: claimWithInfo.foreignTokenSymbol,
              homeTokenAddress: claimWithInfo.homeTokenAddress,
              foreignTokenAddress: claimWithInfo.foreignTokenAddress,
              bridgeTokenAddress: claimWithInfo.bridgeTokenAddress,
              bridgeTokenSymbol: claimWithInfo.bridgeTokenSymbol,
              homeNetwork: bridgeInstance.homeNetwork,
              foreignNetwork: bridgeInstance.foreignNetwork,
              rawAmount: claim.amount,
              rawAmountString: claim.amount?.toString(),
              rawAmountHex: claim.amount?.toHexString?.(),
              amountType: typeof claim.amount,
              amountHasToNumber: typeof claim.amount?.toNumber === 'function',
              rawYesStake: claim.yes_stake,
              rawNoStake: claim.no_stake,
              yesStakeType: typeof claim.yes_stake,
              noStakeType: typeof claim.no_stake,
              finalTokenSymbol: getTransferTokenSymbol(claimWithInfo),
              finalDecimals: getTokenDecimals(claimWithInfo)
            });
            
            return claimWithInfo;
          }));

          allClaims.push(...claimsWithBridgeInfo);
        } catch (error) {
          console.error(`❌ Error loading claims from bridge ${bridgeInstance.address}:`, {
            error: error.message,
            code: error.code,
            data: error.data,
            bridgeAddress: bridgeInstance.address,
            bridgeType: bridgeInstance.type,
            homeNetwork: bridgeInstance.homeNetwork,
            foreignNetwork: bridgeInstance.foreignNetwork
          });
          
          // Check if it's a circuit breaker error
          if (error.message.includes('circuit breaker') || error.message.includes('Execution prevented')) {
            console.error(`🚨 CIRCUIT BREAKER DETECTED for bridge: ${bridgeInstance.address}`);
            console.error(`🚨 Bridge details:`, bridgeInstance);
          }
        }
      }

      // Filter claims if "My Claims" is selected
      let filteredClaims = allClaims;
      if (filter === 'my') {
        filteredClaims = allClaims.filter(claim => 
          claim.recipientAddress && 
          account && 
          claim.recipientAddress.toLowerCase() === account.toLowerCase()
        );
        console.log(`🔍 Filtered claims for recipient ${account}:`, {
          totalClaims: allClaims.length,
          filteredClaims: filteredClaims.length,
          recipientAddress: account
        });
      }

      // Sort claims by claim number (most recent first)
      filteredClaims.sort((a, b) => b.claimNum - a.claimNum);

      setClaims(filteredClaims);
    } catch (error) {
      console.error('Error loading claims:', error);
      toast.error(`Failed to load claims: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [account, provider, network, isConnected, getNetworkWithSettings, getBridgeInstancesWithSettings, filter, getTransferTokenSymbol, getTokenDecimals]);



  // Load claims on mount and when dependencies change
  useEffect(() => {
    // Only load claims if user is explicitly connected and all required data is available
    if (isConnected && account && provider && network && window.ethereum && window.ethereum.isMetaMask) {
      loadClaims();
    }
  }, [loadClaims, isConnected, account, provider, network, filter]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isConnected || !account || !provider || !network || !window.ethereum || !window.ethereum.isMetaMask) return;

    const interval = setInterval(() => {
      loadClaims();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadClaims, isConnected, account, provider, network]);

  if (!isConnected || !account || !provider || !network || !window.ethereum || !window.ethereum.isMetaMask) {
    return (
      <div className="text-center py-12">
        <div className="text-secondary-400 mb-4">
          <Clock className="w-12 h-12 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet</h3>
          <p className="text-secondary-400">
            {!window.ethereum 
              ? 'MetaMask is not installed. Please install MetaMask to view claims.'
              : !window.ethereum.isMetaMask
                ? 'Please use MetaMask to connect to this app.'
                : !isConnected 
                  ? 'Connect your wallet to view claims'
                  : 'Wallet connection incomplete. Please reconnect your wallet.'
            }
          </p>
        </div>
      </div>
    );
  }

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
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
              All Claims
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
          </div>
          
          {/* New Claim Button */}
          {network?.id === 1333 && (
            <button
              onClick={() => setShowNewClaim(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Claim
            </button>
          )}
          

          
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-secondary-400">Loading claims...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && claims.length === 0 && (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <Clock className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Claims Found</h3>
            <p className="text-secondary-400">
              {filter === 'my' 
                ? 'You don\'t have any claims on this network' 
                : 'No claims found on this network'
              }
            </p>
          </div>
        </div>
      )}

      {/* Claims List */}
      <AnimatePresence>
        {claims.map((claim, index) => {
          // Debug: Log the claim data to see what we're working with
          console.log(`🔍 Claim ${index + 1} data:`, {
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
            rawClaim: claim
          });
          
          const status = getClaimStatus(claim);
          return (
            <motion.div
              key={`${claim.bridgeAddress}-${claim.claimNum}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.1 }}
              className="card mb-4"
            >
              <div className="flex items-start justify-between">
                {/* Claim Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium text-white">
                      Claim #{claim.claimNum}
                    </span>
                    {getStatusIcon(status)}
                    <span className={`text-sm font-medium ${getStatusColor(status)}`}>
                      {getStatusText(status)}
                    </span>
                    <span className="text-sm text-secondary-400">
                      {claim.bridgeType === 'export' ? 'Export' : 'Import'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-secondary-400">Amount:</span>
                      <span className="text-white ml-2 font-medium">
                        {(() => {
                          const decimals = getTokenDecimals(claim);
                          const formatted = formatAmount(claim.amount, decimals);
                          console.log(`🔍 Amount formatting for claim:`, {
                            rawAmount: claim.amount?.toString(),
                            rawAmountHex: claim.amount?.toHexString?.(),
                            tokenSymbol: getTransferTokenSymbol(claim),
                            decimals,
                            formatted,
                            // Test with different decimals
                            testWith6Decimals: formatAmount(claim.amount, 6),
                            testWith18Decimals: formatAmount(claim.amount, 18)
                          });
                          return `${formatted} ${getTransferTokenSymbol(claim)}`;
                        })()}
                      </span>
                    </div>
                    
                    <div>
                      <span className="text-secondary-400">Sender:</span>
                      <span className="text-white ml-2 font-mono">
                        {formatAddress(claim.senderAddress)}
                      </span>
                    </div>
                    
                    <div>
                      <span className="text-secondary-400">Recipient:</span>
                      <span className="text-white ml-2 font-mono">
                        {formatAddress(claim.recipientAddress)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-secondary-400">Current Outcome:</span>
                      <span className="text-white ml-2 font-medium">
                        {getOutcomeText(claim.currentOutcome)}
                      </span>
                    </div>
                    
                    <div>
                      <span className="text-secondary-400">YES Stakes:</span>
                      <span className="text-white ml-2 font-medium">
                        {(() => {
                          const stakeDecimals = getStakeTokenDecimals(claim);
                          const formatted = formatAmount(claim.yesStake, stakeDecimals);
                          console.log(`🔍 YES Stake formatting for claim:`, {
                            rawStake: claim.yesStake?.toString(),
                            rawStakeType: typeof claim.yesStake,
                            rawStakeHasToNumber: typeof claim.yesStake?.toNumber === 'function',
                            stakeTokenSymbol: getStakeTokenSymbol(claim),
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
                          const formatted = formatAmount(claim.noStake, stakeDecimals);
                          console.log(`🔍 NO Stake formatting for claim:`, {
                            rawStake: claim.noStake?.toString(),
                            rawStakeType: typeof claim.noStake,
                            rawStakeHasToNumber: typeof claim.noStake?.toNumber === 'function',
                            stakeTokenSymbol: getStakeTokenSymbol(claim),
                            stakeDecimals,
                            formatted
                          });
                          return `${formatted} ${getStakeTokenSymbol(claim)}`;
                        })()}
                      </span>
                    </div>
                  </div>

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

                  {/* Action Buttons */}
                  <div className="mt-3 flex gap-2">
                    {/* Withdraw Button for Expired Claims with YES Outcome */}
                    {canWithdrawClaim(claim) && (
                      <button
                        onClick={() => {
                          setSelectedClaim(prepareClaimForWithdraw(claim));
                          setShowWithdrawModal(true);
                        }}
                        className="btn-primary flex items-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Withdraw
                      </button>
                    )}
                    
                    {/* Challenge Button for Active Claims */}
                    {canChallengeClaim(claim) && (
                      <button
                        onClick={() => {
                          console.log('🔍 Setting selected claim for challenge:', {
                            displayClaimNum: claim.claimNum,
                            actualClaimNum: claim.actualClaimNum,
                            claim_num: claim.claim_num,
                            fullClaim: claim
                          });
                          setSelectedClaim(claim);
                          setShowChallengeModal(true);
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
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* New Claim Dialog */}
      <NewClaim 
        isOpen={showNewClaim}
        onClose={() => setShowNewClaim(false)}
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
            loadClaims();
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
            loadClaims();
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

