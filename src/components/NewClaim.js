import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
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

const NewClaim = ({ isOpen, onClose, selectedToken = null }) => {
  const { account, provider, network, isConnected, signer } = useWeb3();
  const { getBridgeInstancesWithSettings } = useSettings();
  
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
  const [selectedBridge, setSelectedBridge] = useState(null);
  const [requiredStake, setRequiredStake] = useState('0');
  const [allowance, setAllowance] = useState('0');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [availableTokens, setAvailableTokens] = useState([]);

  // Initialize form when component mounts or token changes
  useEffect(() => {
    if (isOpen && selectedToken) {
      setFormData(prev => ({
        ...prev,
        tokenAddress: selectedToken.address,
        recipientAddress: account || ''
      }));
    }
  }, [isOpen, selectedToken, account]);

  // Load available tokens for 3DPass network
  const loadAvailableTokens = useCallback(async () => {
    if (!provider) return;

    try {
      const tokens = [];
      
      // Add P3D (native token)
      const p3dMetadata = await get3DPassTokenMetadata(provider, NETWORKS.THREEDPASS.tokens.P3D.address);
      tokens.push(p3dMetadata);
      
      // Add other 3DPass tokens
      const tokenAddresses = [
        '0xfBFBfbFA000000000000000000000000000000de', // wUSDT
        '0xFbfbFBfA0000000000000000000000000000006f', // wUSDC
        '0xFbFBFBfA0000000000000000000000000000014D', // wBUSD
        '0xFbfBFBfA000000000000000000000000000001bC', // FIRE
        '0xfBFBFBfa0000000000000000000000000000022b', // WATER
      ];

      for (const address of tokenAddresses) {
        try {
          const metadata = await get3DPassTokenMetadata(provider, address);
          tokens.push(metadata);
        } catch (error) {
          console.warn(`Failed to load metadata for ${address}:`, error);
        }
      }

      setAvailableTokens(tokens);
    } catch (error) {
      console.error('Error loading available tokens:', error);
      toast.error('Failed to load available tokens');
    }
  }, [provider]);

  // Load token metadata
  const loadTokenMetadata = useCallback(async () => {
    if (!formData.tokenAddress || !provider) return;

    try {
      const metadata = await get3DPassTokenMetadata(provider, formData.tokenAddress);
      setTokenMetadata(metadata);
    } catch (error) {
      console.error('Error loading token metadata:', error);
      setTokenMetadata(null);
    }
  }, [formData.tokenAddress, provider]);

  // Load token balance
  const loadTokenBalance = useCallback(async () => {
    if (!formData.tokenAddress || !provider || !account) return;

    try {
      const balance = await get3DPassTokenBalance(provider, formData.tokenAddress, account);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading token balance:', error);
      setTokenBalance('0');
    }
  }, [formData.tokenAddress, provider, account]);

  // Determine the correct bridge based on token
  const determineBridge = useCallback(() => {
    if (!formData.tokenAddress) return;

    const tokenSymbol = getTokenSymbolFromPrecompile(formData.tokenAddress);
    if (!tokenSymbol) return;

    const allBridges = getBridgeInstancesWithSettings();
    console.log('🔍 determineBridge called with:', { tokenAddress: formData.tokenAddress, tokenSymbol });
    console.log('📋 All available bridges:', allBridges);
    console.log('📋 Bridge keys:', Object.keys(allBridges));
    console.log('📋 Bridge values:', Object.values(allBridges).map(bridge => ({
      key: Object.keys(allBridges).find(key => allBridges[key] === bridge),
      type: bridge.type,
      homeTokenAddress: bridge.homeTokenAddress,
      foreignTokenAddress: bridge.foreignTokenAddress,
      homeTokenSymbol: bridge.homeTokenSymbol,
      foreignTokenSymbol: bridge.foreignTokenSymbol
    })));

    // Check if this is a wrapped token (import case)
    if (tokenSymbol.startsWith('w') && tokenSymbol !== 'wP3D') {
      console.log('🔍 Looking for import wrapper bridge for wrapped token:', tokenSymbol);
      
      // Look for import wrapper bridge for this token
      // For import wrapper bridges, the token address should match foreignTokenAddress (3DPass side)
      const importBridge = Object.values(allBridges).find(bridge => {
        const matches = bridge.type === 'import_wrapper' && 
          bridge.foreignTokenAddress?.toLowerCase() === formData.tokenAddress.toLowerCase();
        
        console.log('🔍 Checking import bridge:', {
          bridgeType: bridge.type,
          bridgeForeignTokenAddress: bridge.foreignTokenAddress,
          bridgeHomeTokenAddress: bridge.homeTokenAddress,
          bridgeHomeTokenSymbol: bridge.homeTokenSymbol,
          bridgeForeignTokenSymbol: bridge.foreignTokenSymbol,
          formDataTokenAddress: formData.tokenAddress,
          matches
        });
        
        return matches;
      });
      
      if (importBridge) {
        console.log('✅ Found import wrapper bridge:', importBridge);
        setSelectedBridge(importBridge);
        return;
      } else {
        console.log('❌ No import wrapper bridge found for token address:', formData.tokenAddress);
        // Let's also check what import wrapper bridges exist
        const importWrapperBridges = Object.values(allBridges).filter(bridge => bridge.type === 'import_wrapper');
        console.log('📋 Available import wrapper bridges:', importWrapperBridges);
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

    console.log('❌ No bridge found for token:', tokenSymbol);
    setSelectedBridge(null);
  }, [formData.tokenAddress, getBridgeInstancesWithSettings]);

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
      setRequiredStake(ethers.utils.formatEther(stake));
    } catch (error) {
      console.error('Error loading required stake:', error);
      setRequiredStake('0');
    }
  }, [selectedBridge, provider, tokenMetadata]);

  // Load required stake
  const loadRequiredStake = useCallback(async () => {
    if (!selectedBridge || !formData.amount || !provider) return;

    try {
      const bridgeContract = new ethers.Contract(
        selectedBridge.address,
        COUNTERSTAKE_ABI,
        provider
      );

      const amountWei = ethers.utils.parseUnits(formData.amount, tokenMetadata?.decimals || 18);
      const stake = await bridgeContract.getRequiredStake(amountWei);
      setRequiredStake(ethers.utils.formatEther(stake));
    } catch (error) {
      console.error('Error loading required stake:', error);
      setRequiredStake('0');
    }
  }, [selectedBridge, formData.amount, provider, tokenMetadata]);

  // Check allowance
  const checkAllowance = useCallback(async () => {
    if (!selectedBridge || !formData.amount || !provider || !account) return;

    try {
      const amountWei = ethers.utils.parseUnits(formData.amount, tokenMetadata?.decimals || 18);
      const stakeWei = ethers.utils.parseEther(requiredStake);
      const totalNeeded = amountWei.add(stakeWei);

      const currentAllowance = await get3DPassTokenAllowance(
        provider,
        formData.tokenAddress,
        account,
        selectedBridge.address
      );

      const allowanceWei = ethers.utils.parseUnits(currentAllowance, tokenMetadata?.decimals || 18);
      setAllowance(currentAllowance);
      setNeedsApproval(allowanceWei.lt(totalNeeded));
    } catch (error) {
      console.error('Error checking allowance:', error);
      setAllowance('0');
      setNeedsApproval(true);
    }
  }, [selectedBridge, formData.amount, formData.tokenAddress, provider, account, tokenMetadata, requiredStake]);

  // Load available tokens
  useEffect(() => {
    if (isOpen && network?.id === 1333) {
      loadAvailableTokens();
    }
  }, [isOpen, network, loadAvailableTokens]);

  // Load token metadata and balance when token address changes
  useEffect(() => {
    if (formData.tokenAddress && provider && account) {
      loadTokenMetadata();
      loadTokenBalance();
      determineBridge();
    }
  }, [formData.tokenAddress, provider, account, loadTokenMetadata, loadTokenBalance, determineBridge]);

  // Load required stake when bridge is determined (even without amount)
  useEffect(() => {
    if (selectedBridge && provider) {
      // Load stake with a default amount of 1 if no amount is set
      const amountToUse = formData.amount || '1';
      loadRequiredStakeWithAmount(amountToUse);
    }
  }, [selectedBridge, provider, loadRequiredStakeWithAmount, formData.amount]);

  // Load required stake when bridge and amount change
  useEffect(() => {
    if (selectedBridge && formData.amount && provider) {
      loadRequiredStake();
    }
  }, [selectedBridge, formData.amount, provider, loadRequiredStake]);

  // Check allowance when bridge and amount change
  useEffect(() => {
    if (selectedBridge && formData.amount && provider && account) {
      checkAllowance();
    }
  }, [selectedBridge, formData.amount, provider, account, checkAllowance]);

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
      const amountWei = ethers.utils.parseUnits(formData.amount, tokenMetadata?.decimals || 18);
      const stakeWei = ethers.utils.parseEther(requiredStake);
      const totalNeeded = amountWei.add(stakeWei);

      await approve3DPassToken(
        signer,
        formData.tokenAddress,
        selectedBridge.address,
        ethers.utils.formatUnits(totalNeeded, tokenMetadata?.decimals || 18)
      );

      toast.success('Approval successful!');
      await checkAllowance();
    } catch (error) {
      console.error('Error approving token:', error);
      toast.error(`Approval failed: ${error.message}`);
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
          gasLimit: 900000,
          value: stakeWei // Send stake as ETH value
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
      
      // Provide more specific error messages
      let errorMessage = 'Claim failed';
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction';
      } else if (error.message.includes('gas')) {
        errorMessage = 'Gas estimation failed - check your inputs';
      } else if (error.message.includes('execution reverted')) {
        errorMessage = 'Transaction reverted - check claim parameters';
      } else if (error.message.includes('Internal JSON-RPC error')) {
        errorMessage = 'Network error - please try again';
      } else {
        errorMessage = `Claim failed: ${error.message}`;
      }
      
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

       // Validate form
  const validateForm = () => {
    if (!isConnected) return 'Please connect your wallet';
    if (network?.id !== 1333) return 'This feature is only available on 3DPass network';
     if (!formData.tokenAddress) return 'Please select a token';
     if (!formData.amount || parseFloat(formData.amount) <= 0) return 'Please enter a valid amount';
     if (!formData.txid) return 'Please enter a transaction ID';
     if (!formData.senderAddress) return 'Please enter sender address';
     if (!formData.recipientAddress) return 'Please enter recipient address';
     if (!ethers.utils.isAddress(formData.recipientAddress)) return 'Invalid recipient address';
     if (!selectedBridge) return 'No bridge found for selected token';
     if (needsApproval) return 'Please approve the bridge to spend your tokens';
     
     const amount = parseFloat(formData.amount);
     const balance = parseFloat(tokenBalance);
     if (amount > balance) return 'Insufficient token balance';
     
     return null;
   };

  const validationError = validateForm();

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
          className="bg-dark-900 border border-secondary-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-7.2rem)] sm:max-h-[calc(100vh-10.8rem)] overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-secondary-800">
            <div className="flex items-center gap-3">
              <ExternalLink className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-white">Submit New Claim</h2>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(96vh-14.4rem)] sm:max-h-[calc(96vh-18rem)]">
            <div className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Token Selection */}
                <div className="card">
                  <div className="flex items-center gap-3 mb-4">
                    <Coins className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">Token Selection</h3>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-secondary-300 mb-2">
                      Token
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
                        {requiredStake} P3D
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
                  <h3 className="text-lg font-semibold text-white">Claim Details</h3>
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
                    Transaction ID
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
                      Transaction Timestamp (optional)
                    </label>
                    <input
                      type="number"
                      value={formData.txts}
                      onChange={(e) => handleInputChange('txts', e.target.value)}
                      className="input-field w-full"
                      placeholder="Unix timestamp"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-300 mb-2">
                      Data (optional)
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
                    <h3 className="text-lg font-semibold text-white">Approval Required</h3>
                  </div>
                  
                  <p className="text-sm text-secondary-400 mb-4">
                    The bridge needs permission to spend your tokens. Current allowance: {allowance}
                  </p>
                  
                  <button
                    type="button"
                    onClick={handleApproval}
                    disabled={submitting}
                    className="btn-warning flex items-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Approve Bridge
                  </button>
                </div>
              )}

              {/* Validation Error */}
              {validationError && (
                <div className="card border-error-700 bg-error-900/50">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-error-400" />
                    <p className="text-sm text-error-300">{validationError}</p>
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
                <button
                  type="submit"
                  disabled={!!validationError || submitting || needsApproval}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
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
