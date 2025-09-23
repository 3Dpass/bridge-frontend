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
import { 
  X, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  Info,
  ExternalLink,
  Coins
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

const NewClaim = ({ isOpen, onClose, selectedToken = null, selectedTransfer = null }) => {
  const { account, provider, network, isConnected, signer } = useWeb3();
  const { getBridgeInstancesWithSettings, getNetworkWithSettings } = useSettings();
  
  // Form state
  const [formData, setFormData] = useState({
    tokenAddress: '',
    amount: '',
    reward: '',
    txid: '',
    txts: '',
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

  // Initialize form when component mounts or token changes
  useEffect(() => {
    if (isOpen) {
      if (selectedTransfer) {
        // Pre-fill form with transfer data
        console.log('🔍 Pre-filling form with transfer data:', selectedTransfer);
        
        // Use the timestamp that was already fetched when the expatriation was discovered
        const calculateTxts = () => {
          const txtsValue = selectedTransfer.timestamp || selectedTransfer.blockTimestamp;
          
          console.log('🔍 Available timestamp data:', {
            transferTimestamp: selectedTransfer.timestamp,
            blockTimestamp: selectedTransfer.blockTimestamp,
            blockNumber: selectedTransfer.blockNumber
          });
          
          console.log(`🔍 Using timestamp: ${txtsValue} (${new Date(txtsValue * 1000).toISOString()})`);
          return txtsValue;
        };
        
        const txtsValue = calculateTxts();
        // Determine the correct token address based on the network we're on
        let tokenAddress = '';
        if (network?.id === 1333) {
          // On 3DPass: use foreignTokenAddress (token on 3DPass side)
          tokenAddress = selectedTransfer.foreignTokenAddress || selectedTransfer.toTokenAddress || '';
        } else if (network?.id === 1) {
          // On Ethereum: use homeTokenAddress (token on Ethereum side)
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
          selectedTokenAddress: tokenAddress
        });
        
        setFormData(prev => ({
          ...prev,
          tokenAddress: tokenAddress.toLowerCase(),
          amount: selectedTransfer.amount ? 
            (typeof selectedTransfer.amount === 'string' ? selectedTransfer.amount : 
             ethers.utils.formatUnits(selectedTransfer.amount, 6)) : '',
          txid: selectedTransfer.txid || selectedTransfer.transactionHash || '',
          txts: txtsValue,
          senderAddress: selectedTransfer.fromAddress || selectedTransfer.senderAddress || '',
          recipientAddress: selectedTransfer.toAddress || selectedTransfer.recipientAddress || account || '',
          data: selectedTransfer.data || '0x'
        }));
      } else if (selectedToken) {
        setFormData(prev => ({
          ...prev,
          tokenAddress: selectedToken.address,
          recipientAddress: account || '',
          senderAddress: account || ''
        }));
      } else if (account) {
        // If no selected token but account is available, still set the addresses
        setFormData(prev => ({
          ...prev,
          recipientAddress: account,
          senderAddress: account
        }));
      }
      // Reset approval state when form opens or token changes
      setNeedsApproval(true);
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
        
        // For export bridges: foreignTokenAddress is the token on 3DPass side (where we are)
        if (bridge.type === 'export' && bridge.foreignTokenAddress) {
          tokenAddresses.add(bridge.foreignTokenAddress.toLowerCase());
          console.log('✅ Added export bridge token:', bridge.foreignTokenAddress);
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
          
          if (network?.id === 1333) {
            // On 3DPass: use foreignTokenAddress (token on 3DPass side)
            if (bridge.foreignTokenAddress) {
              tokenAddresses.add(bridge.foreignTokenAddress.toLowerCase());
              console.log('✅ Added import_wrapper bridge foreign token (3DPass):', bridge.foreignTokenAddress);
            } else {
              console.log('❌ Import_wrapper bridge has no foreignTokenAddress');
            }
          } else if (network?.id === 1) {
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
          if (network?.id === 1333) {
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
      setAvailableTokens(tokens);
    } catch (error) {
      console.error('Error loading available tokens:', error);
      toast.error('Failed to load available tokens');
    }
  }, [provider, getBridgeInstancesWithSettings, network?.id, network?.name]);

  // Load token metadata
  const loadTokenMetadata = useCallback(async () => {
    if (!formData.tokenAddress || !provider) return;

    try {
      let metadata;
      
      // For 3DPass network, use 3DPass token metadata
      if (network?.id === 1333) {
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
      if (network?.id === 1333) {
        balance = await get3DPassTokenBalance(provider, formData.tokenAddress, account);
      } else {
        // For other networks (like Ethereum), use standard ERC20 balance
        const tokenContract = new ethers.Contract(formData.tokenAddress, [
          'function balanceOf(address) view returns (uint256)'
        ], provider);
        
        const balanceWei = await tokenContract.balanceOf(account);
        const decimals = tokenMetadata?.decimals || 18;
        balance = ethers.utils.formatUnits(balanceWei, decimals);
      }
      
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading token balance:', error);
      setTokenBalance('0');
    }
  }, [formData.tokenAddress, provider, account, network?.id, tokenMetadata?.decimals]);

  // Load stake token balance (P3D)
  const loadStakeTokenBalance = useCallback(async () => {
    if (!selectedBridge || !provider || !account) return;

    setIsLoadingStakeBalance(true);
    try {
      const stakeTokenAddress = selectedBridge.stakeTokenAddress;
      if (stakeTokenAddress) {
        let balance;
        
        // For 3DPass network, use 3DPass token balance
        if (network?.id === 1333) {
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
      currentNetworkId: network?.id
    });
    console.log('📋 All available bridges:', allBridges);

    // For 3DPass network (export and import_wrapper bridges)
    if (network?.id === 1333) {
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
           else if (network?.id === 1) {
             console.log('🔍 Looking for export bridge for repatriation claim on Ethereum');
             
             // Look for export bridge for this token
             // For export bridges, the token address should match homeTokenAddress (Ethereum side)
             const exportBridge = Object.values(allBridges).find(bridge => {
               const matches = bridge.type === 'export' && 
                 bridge.homeTokenAddress?.toLowerCase() === formData.tokenAddress.toLowerCase();
               
               console.log('🔍 Checking export bridge:', {
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
  }, [formData.tokenAddress, getBridgeInstancesWithSettings, network?.id, network?.name]);

  // Load required stake with a specific amount
  const loadRequiredStakeWithAmount = useCallback(async (amount) => {
    if (!selectedBridge || !provider) return;

    try {
      const bridgeContract = new ethers.Contract(
        selectedBridge.address,
        COUNTERSTAKE_ABI,
        provider
      );

      const amountWei = ethers.utils.parseUnits(amount, tokenMetadata?.decimals || 18);
      const stake = await bridgeContract.getRequiredStake(amountWei);
      
      // Get stake token decimals for correct formatting
      let stakeTokenDecimals;
      if (network?.id === 1333) {
        stakeTokenDecimals = 18; // P3D has 18 decimals
      } else {
        // For other networks (like Ethereum), get stake token decimals
        const stakeTokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, [
          'function decimals() view returns (uint8)'
        ], provider);
        stakeTokenDecimals = await stakeTokenContract.decimals();
      }
      
      setRequiredStake(ethers.utils.formatUnits(stake, stakeTokenDecimals));
    } catch (error) {
      console.error('Error loading required stake:', error);
      setRequiredStake('0');
    }
  }, [selectedBridge, provider, tokenMetadata, network?.id]);


  // Check allowance
  const checkAllowance = useCallback(async () => {
    if (!selectedBridge || !formData.amount || !provider || !account) return;

    try {
      let currentAllowance;
      let stakeTokenDecimals;
      
      // For 3DPass network, use 3DPass token allowance
      if (network?.id === 1333) {
        currentAllowance = await get3DPassTokenAllowance(
          provider,
          selectedBridge.stakeTokenAddress, // P3D token address
          account,
          selectedBridge.address
        );
        stakeTokenDecimals = 18; // P3D has 18 decimals
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
        needsApproval: allowanceWei.lt(stakeWei)
      });
      
      setAllowance(currentAllowance);
      setNeedsApproval(allowanceWei.lt(stakeWei)); // Allow if allowance >= required stake
    } catch (error) {
      console.error('Error checking stake token allowance:', error);
      setAllowance('0');
      setNeedsApproval(true);
    }
  }, [selectedBridge, formData.amount, provider, account, requiredStake, network?.id]);

  // Load available tokens
  useEffect(() => {
    if (isOpen && (network?.id === 1333 || network?.id === 1)) {
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
  }, [selectedBridge, formData.amount, provider, account, checkAllowance]);

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
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle approval
  const handleApproval = async () => {
    if (!signer || !selectedBridge || !formData.amount) return;

    setSubmitting(true);
    try {
      // Approve the stake token, not the claim token
      if (network?.id === 1333) {
        // For 3DPass network, use 3DPass token approval
        await approve3DPassToken(
          signer,
          selectedBridge.stakeTokenAddress, // P3D token address for staking
          selectedBridge.address,           // Bridge contract address
          requiredStake                     // P3D stake amount
        );
      } else {
        // For other networks (like Ethereum), use standard ERC20 approval
        const tokenContract = new ethers.Contract(selectedBridge.stakeTokenAddress, [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)'
        ], signer);
        
        const decimals = await tokenContract.decimals();
        const stakeWei = ethers.utils.parseUnits(requiredStake, decimals);
        const approvalTx = await tokenContract.approve(selectedBridge.address, stakeWei);
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

      const amountWei = ethers.utils.parseUnits(formData.amount, tokenMetadata?.decimals || 18);
      const rewardWei = ethers.utils.parseUnits(formData.reward || '0', tokenMetadata?.decimals || 18);
      const txts = parseInt(formData.txts) || Math.floor(Date.now() / 1000);
      const stakeWei = ethers.utils.parseEther(requiredStake);

      console.log('🔍 Parsed values:', {
        amountWei: amountWei.toString(),
        rewardWei: rewardWei.toString(),
        txts: txts,
        txtsHex: '0x' + txts.toString(16),
        stakeWei: stakeWei.toString(),
        txid: formData.txid,
        senderAddress: formData.senderAddress,
        recipientAddress: formData.recipientAddress,
        data: formData.data
      });

      // Validate that all required fields are present
      if (!formData.txid || formData.txid.trim() === '') {
        throw new Error('Transaction ID is required');
      }
      if (!formData.senderAddress || formData.senderAddress.trim() === '') {
        throw new Error('Sender address is required');
      }
      if (!formData.recipientAddress || formData.recipientAddress.trim() === '') {
        throw new Error('Recipient address is required');
      }

      console.log('🔍 Calling claim function with parameters:', [
        formData.txid,
        txts,
        amountWei,
        rewardWei,
        stakeWei,
        formData.senderAddress,
        formData.recipientAddress,
        formData.data
      ]);

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
            if (claim.txid === formData.txid && 
                claim.sender_address === formData.senderAddress &&
                claim.recipient_address.toLowerCase() === formData.recipientAddress.toLowerCase()) {
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

      const claimTx = await bridgeContract.claim(
        formData.txid,
        txts,
        amountWei,
        rewardWei,
        stakeWei,
        formData.senderAddress,
        formData.recipientAddress,
        formData.data,
        { 
          value: 0, // No ETH value needed, P3D is transferred via transferFrom
          gasLimit: 500000 // Higher gas limit for claim transaction
        }
      );

      console.log('🔍 Claim transaction submitted:', claimTx.hash);
      toast.success('Claim submitted! Waiting for confirmation...');
      
      const receipt = await claimTx.wait();
      console.log('🔍 Claim transaction confirmed:', receipt);
      toast.success(`Claim confirmed! Transaction: ${receipt.transactionHash}`);
      
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
      
      if (error.code === 4001 || error.message?.includes('User denied transaction') || error.message?.includes('user rejected transaction')) {
        errorMessage = 'Transaction cancelled by user';
      } else if (error.code === -32603 || error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction';
      } else if (error.message?.includes('gas')) {
        errorMessage = 'Transaction failed due to gas issues. Please try again.';
      } else if (error.message?.includes('execution reverted') || error.message?.includes('revert')) {
        errorMessage = 'Transaction failed. Please check your inputs and try again.';
      } else if (error.message?.includes('Internal JSON-RPC error') || error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else {
        errorMessage = `Claim failed: ${error.message}`;
      }
      
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

       // Check if form is valid (for button state)
  const isFormValid = () => {
    if (!isConnected) return false;
    if (network?.id !== 1333 && network?.id !== 1) return false; // Support both 3DPass and Ethereum
    if (!formData.tokenAddress) return false;
    if (!formData.amount || parseFloat(formData.amount) <= 0) return false;
    if (!formData.txid) return false;
    if (!formData.senderAddress) return false;
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
                      {availableTokens.map((token) => (
                        <option key={token.address} value={token.address}>
                          {token.symbol} - {token.name}
                        </option>
                      ))}
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
                                {isLoadingStakeBalance ? 'Loading...' : stakeTokenBalance}
                                {!isLoadingStakeBalance && parseFloat(stakeTokenBalance) < parseFloat(requiredStake) && (
                                  <span className="text-xs text-red-400 ml-1">
                                    (Insufficient for stake: {requiredStake})
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
                      <p className="font-medium text-white font-mono text-xs">
                        {selectedBridge.address.slice(0, 6)}...{selectedBridge.address.slice(-4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-secondary-400">Required Stake</p>
                      <p className="font-medium text-white">
                        {requiredStake} {selectedBridge?.stakeTokenSymbol || 'stake'}
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

              {/* Form Fields */}
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <ExternalLink className="w-5 h-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-white">Transaction Details</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-300 mb-2">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.amount}
                      onChange={(e) => handleInputChange('amount', e.target.value)}
                      className="input-field w-full"
                      placeholder="0.0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-300 mb-2">
                      Reward (optional)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.reward}
                      onChange={(e) => handleInputChange('reward', e.target.value)}
                      className="input-field w-full"
                      placeholder="0.0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary-300 mb-2">
                    Transaction ID (from source network)
                  </label>
                  <input
                    type="text"
                    value={formData.txid}
                    onChange={(e) => handleInputChange('txid', e.target.value)}
                    className="input-field w-full"
                    placeholder="0x..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-300 mb-2">
                      Timestamp (optional)
                    </label>
                    <input
                      type="number"
                      value={formData.txts}
                      onChange={(e) => handleInputChange('txts', e.target.value)}
                      className="input-field w-full"
                      placeholder="Unix timestamp from transaction"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-300 mb-2">
                      Additional data from transaction (optional)
                    </label>
                    <input
                      type="text"
                      value={formData.data}
                      onChange={(e) => handleInputChange('data', e.target.value)}
                      className="input-field w-full"
                      placeholder="0x"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary-300 mb-2">
                    Sender Address
                  </label>
                  <input
                    type="text"
                    value={formData.senderAddress}
                    onChange={(e) => handleInputChange('senderAddress', e.target.value)}
                    className="input-field w-full"
                    placeholder="0x..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary-300 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={formData.recipientAddress}
                    onChange={(e) => handleInputChange('recipientAddress', e.target.value)}
                    className="input-field w-full"
                    placeholder="0x..."
                  />
                </div>
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
                    Current {selectedBridge?.stakeTokenSymbol || 'stake'} allowance: {allowance} {selectedBridge?.stakeTokenSymbol || 'stake'}
                  </p>
                  
                  <div className="bg-warning-900/20 border border-warning-700 rounded-lg p-3 mb-4">
                    <p className="text-sm text-warning-200">
                      <strong>Required:</strong> {requiredStake} {selectedBridge?.stakeTokenSymbol || 'stake'} for staking
                    </p>
                    <p className="text-sm text-warning-200">
                      <strong>Your Balance:</strong> {stakeTokenBalance} {selectedBridge?.stakeTokenSymbol || 'stake'}
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleApproval}
                    disabled={submitting || !isFormValid()}
                    className="btn-warning flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Approve {selectedBridge?.stakeTokenSymbol || 'Stake Token'} for Bridge
                  </button>
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
                        <span className="text-success-400 font-medium text-sm">{allowance} {selectedBridge?.stakeTokenSymbol || 'stake'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-success-300 text-sm">Required for staking:</span>
                        <span className="text-success-400 font-medium text-sm">{requiredStake} {selectedBridge?.stakeTokenSymbol || 'stake'}</span>
                      </div>
                    </div>
                  </div>
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
