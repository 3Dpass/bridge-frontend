import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { AlertCircle, CheckCircle, ArrowRight, Loader, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { parseAndValidateReward } from '../utils/safe-reward-handler';
import { addTransferEventToStorage, createTransferEventData } from '../utils/unified-event-cache';
import { getBlockTimestamp } from '../utils/bridge-contracts';

// Safely convert to EIP-55 checksum if it's an EVM address
const toChecksumAddress = (address) => {
  try {
    return ethers.utils.getAddress(address);
  } catch (e) {
    return address;
  }
};

// Get maximum allowance value (2^256 - 1)
const getMaxAllowance = () => {
  return ethers.constants.MaxUint256;
};


const Expatriation = ({ 
  bridgeInstance, 
  formData, 
  sourceToken, 
  signer, 
  onSuccess, 
  onError 
}) => {
  const [step, setStep] = useState('approve'); // 'approve', 'approved', 'transfer', 'success'
  const [isLoading, setIsLoading] = useState(false);
  const [approvalTxHash, setApprovalTxHash] = useState('');
  const [transferTxHash, setTransferTxHash] = useState('');
  const [currentAllowance, setCurrentAllowance] = useState('0');
  const [requiredAmount, setRequiredAmount] = useState('0');
  const [isCheckingApproval, setIsCheckingApproval] = useState(true);
  const [useMaxAllowance, setUseMaxAllowance] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

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
        errorMessage.includes('gas estimation failed')) {
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


  // Create token contract for approval
  const createTokenContract = useCallback((tokenAddress) => {
    const tokenABI = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function allowance(address owner, address spender) external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
      'function decimals() external view returns (uint8)',
      'function symbol() external view returns (string)'
    ];
    return new ethers.Contract(tokenAddress, tokenABI, signer);
  }, [signer]);

  // Create export bridge contract
  const createExportContract = useCallback(() => {
    const exportABI = [
      'function transferToForeignChain(string foreign_address, string data, uint amount, int reward) payable',
      'function foreign_network() view returns (string)',
      'function foreign_asset() view returns (string)',
      'function getRequiredStake(uint amount) view returns (uint)',
      'function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)'
    ];
    return new ethers.Contract(bridgeInstance.address, exportABI, signer);
  }, [bridgeInstance.address, signer]);

  // Check if approval is needed
  const checkApprovalNeeded = useCallback(async () => {
    try {
      setIsCheckingApproval(true);
      
      const exportContract = createExportContract();
      // Ensure the selected token matches the bridge's configured token
      let settings;
      try {
        settings = await exportContract.settings();
      } catch (e) {
        console.warn('⚠️ Could not fetch bridge settings:', e);
      }
      const bridgeTokenAddress = settings?.tokenAddress || sourceToken.address;
      if (settings && bridgeTokenAddress.toLowerCase() !== sourceToken.address.toLowerCase()) {
        // Show toast notification for configuration error
        toast.error(
          <div>
            <h3 className="text-error-400 font-medium">Token Mismatch</h3>
            <p className="text-error-300 text-sm mt-1">Selected token does not match the bridge configuration. Please reselect the correct token/network.</p>
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
        return true;
      }

      const tokenContract = createTokenContract(bridgeTokenAddress);
      // Always use actual on-chain decimals to avoid mismatches
      const actualDecimals = await tokenContract.decimals();
      const amount = ethers.utils.parseUnits(formData.amount, actualDecimals);
      const allowance = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
      
      // Store the values for display
      if (allowance.eq(getMaxAllowance())) {
        setCurrentAllowance('∞ (MAX)');
      } else {
        setCurrentAllowance(ethers.utils.formatUnits(allowance, actualDecimals));
      }
      setRequiredAmount(useMaxAllowance ? '∞ (MAX)' : ethers.utils.formatUnits(amount, actualDecimals));
      
      // Check if approval is needed
      let needsApproval;
      if (useMaxAllowance) {
        needsApproval = !allowance.eq(getMaxAllowance());
      } else {
        needsApproval = allowance.lt(amount);
      }
      console.log('🔍 Approval check:', {
        required: ethers.utils.formatUnits(amount, actualDecimals),
        current: ethers.utils.formatUnits(allowance, actualDecimals),
        needsApproval
      });
      
      return needsApproval;
    } catch (error) {
      console.error('Error checking approval:', error);
      const errorInfo = parseError(error);
      
      // Show toast notification
      toast.error(
        <div>
          <h3 className="text-error-400 font-medium">{errorInfo.title}</h3>
          <p className="text-error-300 text-sm mt-1">{errorInfo.message}</p>
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
      return true; // Assume approval is needed if check fails
    } finally {
      setIsCheckingApproval(false);
    }
  }, [sourceToken.address, formData.amount, bridgeInstance.address, signer, createExportContract, createTokenContract, useMaxAllowance]);

  // Handle approval with retry mechanism and proper allowance handling
  const handleApprove = async (retryCount = 0) => {
    setIsLoading(true);
    
    try {
      console.log('🔍 Starting approval process...', retryCount > 0 ? `(Retry ${retryCount})` : '');
      console.log('📋 Approval details:', {
        tokenAddress: sourceToken.address,
        bridgeAddress: bridgeInstance.address,
        amount: formData.amount,
        decimals: sourceToken.decimals
      });

      const exportContract = createExportContract();
      let settings;
      try {
        settings = await exportContract.settings();
      } catch (e) {
        console.warn('⚠️ Could not fetch bridge settings:', e);
      }
      const bridgeTokenAddress = settings?.tokenAddress || sourceToken.address;
      if (settings && bridgeTokenAddress.toLowerCase() !== sourceToken.address.toLowerCase()) {
        throw new Error('Selected token does not match the bridge configuration.');
      }

      const tokenContract = createTokenContract(bridgeTokenAddress);
      const tokenDecimals = await tokenContract.decimals();
      const amount = ethers.utils.parseUnits(formData.amount, tokenDecimals);
      
      // Determine approval amount based on user preference
      const approvalAmount = useMaxAllowance ? getMaxAllowance() : amount;
      
      console.log('💰 Parsed amount for approval:', ethers.utils.formatUnits(amount, tokenDecimals));
      console.log('🔐 Approval amount:', useMaxAllowance ? 'MAX (∞)' : ethers.utils.formatUnits(approvalAmount, tokenDecimals));
      
      // Check current allowance
      const currentAllowanceBN = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
      console.log('📊 Current allowance:', ethers.utils.formatUnits(currentAllowanceBN, tokenDecimals));
      
      // For max allowance, check if it's already set to max
      if (useMaxAllowance && currentAllowanceBN.eq(getMaxAllowance())) {
        console.log('✅ Maximum allowance already set');
        setStep('approved');
        setIsLoading(false);
        return;
      }
      
      // For specific amount, check if current allowance is sufficient
      if (!useMaxAllowance && currentAllowanceBN.gte(amount)) {
        console.log('✅ Sufficient allowance already exists');
        setStep('approved');
        setIsLoading(false);
        return;
      }

      // For allowance increases, we need to handle this more carefully
      const hasExistingAllowance = currentAllowanceBN.gt(0);
      console.log('🔍 Has existing allowance:', hasExistingAllowance);

      console.log('🔐 Approving bridge to spend tokens...');
      
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
        gasEstimate = await tokenContract.estimateGas.approve(bridgeInstance.address, amount);
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
          const resetTx = await tokenContract.approve(bridgeInstance.address, 0, {
            gasLimit: 100000
          });
          await resetTx.wait();
          console.log('✅ Allowance reset successful');
          
          // Step 2: Set new allowance
          console.log('🔄 Step 2: Setting new allowance...');
          const approveTx = await tokenContract.approve(bridgeInstance.address, approvalAmount, gasOptions);
          
          console.log('⏳ Waiting for approval transaction confirmation...');
          const receipt = await approveTx.wait();
          
          console.log('✅ Approval transaction confirmed:', receipt.transactionHash);
          setApprovalTxHash(receipt.transactionHash);
          
        } catch (twoStepError) {
          console.warn('⚠️ Two-step approval failed, trying direct approval:', twoStepError);
          // Fall through to direct approval
          throw twoStepError;
        }
      } else {
        // Direct approval (either new approval or retry)
        const approveTx = await tokenContract.approve(bridgeInstance.address, approvalAmount, gasOptions);
        
        console.log('⏳ Waiting for approval transaction confirmation...');
        const receipt = await approveTx.wait();
        
        console.log('✅ Approval transaction confirmed:', receipt.transactionHash);
        setApprovalTxHash(receipt.transactionHash);
      }
      
      // Refresh allowance display using actual decimals
      try {
        const updatedAllowance = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
        if (updatedAllowance.eq(getMaxAllowance())) {
          setCurrentAllowance('∞ (MAX)');
        } else {
          setCurrentAllowance(ethers.utils.formatUnits(updatedAllowance, tokenDecimals));
        }
        setRequiredAmount(useMaxAllowance ? '∞ (MAX)' : ethers.utils.formatUnits(amount, tokenDecimals));
      } catch (e) {
        console.warn('⚠️ Could not refresh allowance after approval:', e);
      }
      setStep('approved');
      
    } catch (error) {
      console.error('❌ Approval failed:', error);
      
      const errorInfo = parseError(error);
      
      // Handle transaction replacement as success
      if (errorInfo.type === 'transaction_replaced') {
        console.log('✅ Transaction was repriced and successful');
        
        // Try to get the replacement transaction hash
        let replacementTxHash = '';
        if (error.replacement && error.replacement.hash) {
          replacementTxHash = error.replacement.hash;
          setApprovalTxHash(replacementTxHash);
        }
        
        // Refresh allowance display
        try {
          const exportContract = createExportContract();
          let settings;
          try {
            settings = await exportContract.settings();
          } catch (e) {
            console.warn('⚠️ Could not fetch bridge settings:', e);
          }
          const tokenContract = createTokenContract(settings?.tokenAddress || sourceToken.address);
          const tokenDecimals = await tokenContract.decimals();
          const updatedAllowance = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
          if (updatedAllowance.eq(getMaxAllowance())) {
            setCurrentAllowance('∞ (MAX)');
          } else {
            setCurrentAllowance(ethers.utils.formatUnits(updatedAllowance, tokenDecimals));
          }
          setRequiredAmount(useMaxAllowance ? '∞ (MAX)' : ethers.utils.formatUnits(ethers.utils.parseUnits(formData.amount, tokenDecimals), tokenDecimals));
        } catch (e) {
          console.warn('⚠️ Could not refresh allowance after repriced transaction:', e);
        }
        
        setStep('approved');
        
        // Show success notification
        toast.success(
          <div>
            <h3 className="text-success-400 font-medium">Approval Successful</h3>
            <p className="text-success-300 text-sm mt-1">
              Your wallet automatically adjusted the gas price. The approval was successful.
            </p>
            {replacementTxHash && (
              <p className="text-success-300 text-xs mt-2 font-mono">
                TX: {replacementTxHash.slice(0, 10)}...{replacementTxHash.slice(-8)}
              </p>
            )}
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
        
        return;
      }
      
      // Check if this is a retryable error and we haven't exceeded retry limit
      const errorMessage = error.message || error.toString();
      const isRetryableError = (
        errorMessage.includes('Transaction does not have a transaction hash') ||
        errorMessage.includes('there was a problem') ||
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        error.code === -32603
      );
      
      if (isRetryableError && retryCount < 2) {
        console.log(`🔄 Retrying approval (attempt ${retryCount + 1}/2)...`);
        
        // Show retry notification
        toast.error(
          <div>
            <h3 className="text-warning-400 font-medium">Transaction Failed - Retrying</h3>
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
        return handleApprove(retryCount + 1);
      }
      
      // Show final error notification
      toast.error(
        <div>
          <h3 className="text-error-400 font-medium">{errorInfo.title}</h3>
          <p className="text-error-300 text-sm mt-1">{errorInfo.message}</p>
          {errorInfo.type === 'user_rejection' && (
            <p className="text-error-200 text-xs mt-2">💡 You can try again by clicking the approve button.</p>
          )}
          {isRetryableError && retryCount >= 2 && (
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
      
      // Call error callback if provided
      if (onError) {
        onError(errorInfo.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle transfer
  const handleTransfer = async () => {
    setIsLoading(true);
    
    try {
      console.log('🌉 Starting transfer process...');
      console.log('📋 Transfer details:', {
        bridgeAddress: bridgeInstance.address,
        foreignAddress: formData.destinationAddress,
        amount: formData.amount,
        reward: formData.reward,
        decimals: sourceToken.decimals
      });

      const exportContract = createExportContract();
      
      // Get actual token decimals from contract to avoid configuration mismatches
      let settings;
      try {
        settings = await exportContract.settings();
      } catch (e) {
        console.warn('⚠️ Could not fetch bridge settings:', e);
      }
      const bridgeTokenAddress = settings?.tokenAddress || sourceToken.address;
      if (settings && bridgeTokenAddress.toLowerCase() !== sourceToken.address.toLowerCase()) {
        throw new Error('Selected token does not match the bridge configuration.');
      }

      const tokenContract = createTokenContract(bridgeTokenAddress);
      const actualDecimals = await tokenContract.decimals();
      
      // Use actual decimals instead of configured ones
      const amount = ethers.utils.parseUnits(formData.amount, actualDecimals);
      const rewardInput = (formData.reward && String(formData.reward).length > 0) ? formData.reward : '0';
      
      // CRITICAL: Expatriation requires int reward, not BigNumber
      // Use centralized utility for safe reward handling with auto-capping
      const rewardData = parseAndValidateReward(rewardInput, actualDecimals, sourceToken.symbol, true);
      const reward = rewardData.reward;
      
      // Show warning if reward was capped
      if (rewardData.wasCapped) {
        toast.warning(
          <div>
            <h3 className="text-warning-400 font-medium">Reward Amount Capped</h3>
            <p className="text-warning-300 text-sm mt-1">
              Your reward of {rewardData.originalValue} {sourceToken.symbol} exceeds the safe limit.
            </p>
            <p className="text-warning-300 text-sm mt-1">
              Using maximum safe value: {rewardData.maxSafeValue} {sourceToken.symbol}
            </p>
          </div>,
          {
            duration: 8000,
            style: {
              background: '#92400e',
              border: '1px solid #f59e0b',
              color: '#fff',
              padding: '16px',
              borderRadius: '8px',
            },
          }
        );
      }
      const data = '0x'; // Empty data for ERC20 transfers (matching test script)
      
      console.log('💰 Parsed amounts:', {
        amount: ethers.utils.formatUnits(amount, actualDecimals),
        reward: reward,
        rewardFormatted: rewardData.displayValue
      });

      // Validate parameters
      console.log('🔍 Transfer parameters:', {
        foreignAddress: formData.destinationAddress,
        data: data,
        amount: amount.toString(),
        reward: reward.toString(),
        amountType: typeof amount,
        rewardType: typeof reward
      });


      // Validate bridge contract configuration
      try {
        const foreignNetwork = await exportContract.foreign_network();
        const foreignAsset = await exportContract.foreign_asset();
        console.log('🔍 Bridge configuration:', {
          foreignNetwork,
          foreignAsset
        });
      } catch (error) {
        console.warn('⚠️ Could not verify bridge configuration:', error);
      }

      // Validate token configuration
      try {
        const tokenContract = createTokenContract(sourceToken.address);
        const tokenDecimals = await tokenContract.decimals();
        const tokenSymbol = await tokenContract.symbol();
        const tokenBalance = await tokenContract.balanceOf(await signer.getAddress());
        
        console.log('🔍 Token validation:', {
          address: sourceToken.address,
          configuredDecimals: sourceToken.decimals,
          actualDecimals: tokenDecimals,
          configuredSymbol: sourceToken.symbol,
          actualSymbol: tokenSymbol,
          balance: ethers.utils.formatUnits(tokenBalance, tokenDecimals),
          parsedAmount: ethers.utils.formatUnits(amount, tokenDecimals),
          hasEnoughBalance: tokenBalance.gte(amount)
        });
        
        // Check if decimals mismatch
        if (sourceToken.decimals !== tokenDecimals) {
          console.warn('⚠️ Token decimals mismatch!', {
            configured: sourceToken.decimals,
            actual: tokenDecimals
          });
        }
      } catch (error) {
        console.warn('⚠️ Could not validate token configuration:', error);
      }

      console.log('🌉 Initiating transfer to foreign chain...');
      // Sanity-check allowance just before transfer
      try {
        const allowanceBN = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
        if (allowanceBN.lt(amount)) {
          console.warn('⚠️ Insufficient allowance at transfer time, prompting re-approval', {
            allowance: ethers.utils.formatUnits(allowanceBN, actualDecimals),
            required: ethers.utils.formatUnits(amount, actualDecimals)
          });
          // Show toast notification
          toast.error(
            <div>
              <h3 className="text-error-400 font-medium">Insufficient Allowance</h3>
              <p className="text-error-300 text-sm mt-1">Insufficient allowance for transfer. Please approve again.</p>
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
          setStep('approve');
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn('⚠️ Could not check allowance before transfer:', e);
      }
      const foreignAddressChecksummed = toChecksumAddress(formData.destinationAddress);
      
      // Log final transaction parameters that will be sent to the smart contract
      console.log('🚀 FINAL TRANSACTION PARAMETERS (Expatriation):', {
        functionName: 'transferToForeignChain',
        parameters: {
          foreign_address: foreignAddressChecksummed,
          data: data,
          amount: {
            value: amount.toString(),
            type: 'BigNumber',
            humanReadable: ethers.utils.formatUnits(amount, actualDecimals) + ' ' + sourceToken.symbol
          },
          reward: {
            value: reward,
            type: 'number (JavaScript int)',
            humanReadable: rewardData.displayValue + ' ' + sourceToken.symbol,
            contractExpects: 'int (can be negative)',
            maxSafeValue: rewardData.maxSafeValue + ' ' + sourceToken.symbol,
            wasCapped: rewardData.wasCapped,
            originalValue: rewardData.originalValue + ' ' + sourceToken.symbol
          }
        },
        gasLimit: 9000000,
        contractAddress: bridgeInstance.address,
        contractFunction: 'transferToForeignChain(string, string, uint, int)'
      });
      
      const transferTx = await exportContract.transferToForeignChain(
        foreignAddressChecksummed,
        data,
        amount,
        reward,
        { gasLimit: 9000000 }
      );
      
      console.log('⏳ Waiting for transfer transaction confirmation...');
      const receipt = await transferTx.wait();
      
      console.log('✅ Transfer transaction confirmed:', receipt.transactionHash);
      setTransferTxHash(receipt.transactionHash);
      setStep('success');
      
      // Add NewExpatriation event to browser storage for immediate visibility
      try {
        const eventData = createTransferEventData({
          eventType: 'NewExpatriation',
          senderAddress: await signer.getAddress(),
          amount: amount,
          reward: reward,
          recipientAddress: foreignAddressChecksummed,
          data: data,
          blockNumber: receipt.blockNumber,
          transactionHash: receipt.transactionHash,
          logIndex: 0, // We don't have logIndex from receipt, use 0 as fallback
          timestamp: await getBlockTimestamp(signer.provider, receipt.blockNumber),
          bridgeAddress: bridgeInstance.address,
          bridgeType: bridgeInstance.type,
          homeNetwork: bridgeInstance.homeNetwork,
          foreignNetwork: bridgeInstance.foreignNetwork,
          homeTokenSymbol: bridgeInstance.homeTokenSymbol,
          foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
          networkKey: bridgeInstance.homeNetwork.toLowerCase(),
          networkName: bridgeInstance.homeNetwork
        });
        
        console.log('💾 Adding NewExpatriation event to storage:', eventData);
        addTransferEventToStorage(eventData);
      } catch (storageError) {
        console.warn('⚠️ Failed to add event to storage:', storageError);
      }
      
      // Call success callback
      if (onSuccess) {
        onSuccess(receipt.transactionHash);
      }
      
    } catch (error) {
      console.error('❌ Transfer failed:', error);
      const errorInfo = parseError(error);
      
      // Show toast notification
      toast.error(
        <div>
          <h3 className="text-error-400 font-medium">{errorInfo.title}</h3>
          <p className="text-error-300 text-sm mt-1">{errorInfo.message}</p>
          {errorInfo.type === 'user_rejection' && (
            <p className="text-error-200 text-xs mt-2">💡 You can try again by clicking the transfer button.</p>
          )}
          {errorInfo.type === 'insufficient_funds' && (
            <p className="text-error-200 text-xs mt-2">💡 Check your wallet balance and make sure you have enough tokens and ETH for gas fees.</p>
          )}
          {errorInfo.type === 'gas_error' && (
            <p className="text-error-200 text-xs mt-2">💡 Try increasing the gas limit in your wallet settings.</p>
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
      
      // Call error callback if provided
      if (onError) {
        onError(errorInfo.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Check if approval is needed on component mount
  useEffect(() => {
    const checkApproval = async () => {
      try {
        const needsApproval = await checkApprovalNeeded();
        if (!needsApproval) {
          setStep('approved');
        }
      } catch (error) {
        console.error('Error in approval check:', error);
        const errorInfo = parseError(error);
        
        // Show toast notification
        toast.error(
          <div>
            <h3 className="text-error-400 font-medium">{errorInfo.title}</h3>
            <p className="text-error-300 text-sm mt-1">{errorInfo.message}</p>
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
      }
    };
    
    if (signer && sourceToken && bridgeInstance) {
      checkApproval();
    }
  }, [signer, sourceToken, bridgeInstance, checkApprovalNeeded]);

  // Handle revoke allowance
  const handleRevokeAllowance = async () => {
    setIsRevoking(true);
    
    try {
      console.log('🔄 Starting allowance revocation...');
      
      const exportContract = createExportContract();
      let settings;
      try {
        settings = await exportContract.settings();
      } catch (e) {
        console.warn('⚠️ Could not fetch bridge settings:', e);
      }
      const bridgeTokenAddress = settings?.tokenAddress || sourceToken.address;
      
      const tokenContract = createTokenContract(bridgeTokenAddress);
      
      console.log('🔐 Revoking allowance (setting to 0)...');
      const revokeTx = await tokenContract.approve(bridgeInstance.address, 0, { 
        gasLimit: 100000 
      });
      
      console.log('⏳ Waiting for revocation transaction confirmation...');
      const receipt = await revokeTx.wait();
      
      console.log('✅ Allowance revoked successfully:', receipt.transactionHash);
      
      // Refresh allowance display
      try {
        const updatedAllowance = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
        setCurrentAllowance(ethers.utils.formatUnits(updatedAllowance, await tokenContract.decimals()));
        setRequiredAmount(ethers.utils.formatUnits(ethers.utils.parseUnits(formData.amount, await tokenContract.decimals()), await tokenContract.decimals()));
      } catch (e) {
        console.warn('⚠️ Could not refresh allowance after revocation:', e);
      }
      
      // Show success notification
      toast.success(
        <div>
          <h3 className="text-success-400 font-medium">Allowance Revoked</h3>
          <p className="text-success-300 text-sm mt-1">
            The bridge contract can no longer spend your {sourceToken.symbol} tokens.
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
      
    } catch (error) {
      console.error('❌ Allowance revocation failed:', error);
      const errorInfo = parseError(error);
      
      // Handle transaction replacement as success
      if (errorInfo.type === 'transaction_replaced') {
        console.log('✅ Revoke transaction was repriced and successful');
        
        // Refresh allowance display
        try {
          const exportContract = createExportContract();
          let settings;
          try {
            settings = await exportContract.settings();
          } catch (e) {
            console.warn('⚠️ Could not fetch bridge settings:', e);
          }
          const tokenContract = createTokenContract(settings?.tokenAddress || sourceToken.address);
          const updatedAllowance = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
          setCurrentAllowance(ethers.utils.formatUnits(updatedAllowance, await tokenContract.decimals()));
        } catch (e) {
          console.warn('⚠️ Could not refresh allowance after repriced revoke transaction:', e);
        }
        
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

  const renderStep = () => {
    switch (step) {
      case 'approve':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-warning-900/50 border border-warning-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-warning-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-warning-400 font-medium">Approval Required</h3>
                  <p className="text-warning-300 text-sm mt-1">
                    Approve the bridge contract to spend your {sourceToken.symbol} tokens before initiating the transfer.
                  </p>
                  
                  {!isCheckingApproval && (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-warning-300">Required amount:</span>
                          <span className="text-warning-400 font-medium">{requiredAmount} {sourceToken.symbol}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-warning-300">Current allowance:</span>
                          <span className="text-warning-400 font-medium">{currentAllowance} {sourceToken.symbol}</span>
                        </div>
                        {parseFloat(currentAllowance) > 0 && currentAllowance !== '∞ (MAX)' && (
                          <div className="text-xs text-warning-300 mt-1">
                            You have an existing allowance, but it's insufficient for this transfer.
                          </div>
                        )}
                      </div>
                      
                      {/* Max Allowance Option */}
                      <div className="border-t border-warning-700 pt-3">
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
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={handleApprove}
                disabled={isLoading || isCheckingApproval}
                className="w-full btn-warning py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Approving...</span>
                  </div>
                ) : isCheckingApproval ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Checking Approval Status...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <span>
                      {useMaxAllowance ? `Approve ∞ ${sourceToken.symbol}` : `Approve ${sourceToken.symbol}`}
                    </span>
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </button>
              
              {/* Revoke Allowance Button - Show if there's any existing allowance */}
              {!isCheckingApproval && currentAllowance !== '0' && (
                <button
                  onClick={handleRevokeAllowance}
                  disabled={isRevoking}
                  className="w-full btn-secondary py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRevoking ? (
                    <div className="flex items-center justify-center space-x-2">
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Revoking Allowance...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <span>Revoke Allowance</span>
                    </div>
                  )}
                </button>
              )}
              
              <button
                onClick={async () => {
                  await checkApprovalNeeded();
                }}
                disabled={isCheckingApproval}
                className="w-full btn-secondary py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingApproval ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Checking...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh Approval Status</span>
                  </div>
                )}
              </button>
            </div>
          </motion.div>
        );

      case 'approved':
        console.log('🔍 Approved step rendering:', { currentAllowance, step });
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-success-900/50 border border-success-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-success-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-success-400 font-medium">Approval Successful</h3>
                  <p className="text-success-300 text-sm mt-1">
                    Bridge contract is now approved to spend your {sourceToken.symbol} tokens.
                  </p>
                  
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-success-300">Current allowance:</span>
                      <span className="text-success-400 font-medium">{currentAllowance} {sourceToken.symbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-success-300">Required for transfer:</span>
                      <span className="text-success-400 font-medium">{requiredAmount} {sourceToken.symbol}</span>
                    </div>
                    {currentAllowance === '∞ (MAX)' && (
                      <div className="text-xs text-success-300 mt-2 p-2 bg-success-800/30 rounded border border-success-700">
                        ✅ Maximum allowance set - no future approvals needed for this token
                      </div>
                    )}
                  </div>
                  
                  {approvalTxHash && (
                    <p className="text-success-300 text-xs mt-2 font-mono">
                      TX: {approvalTxHash.slice(0, 10)}...{approvalTxHash.slice(-8)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={handleTransfer}
                disabled={isLoading}
                className="w-full btn-primary py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Initiating Transfer...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <span>Initiate Transfer</span>
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </button>
              
              {/* Revoke Allowance Button - Show if there's any allowance */}
              {currentAllowance !== '0' && (
                <button
                  onClick={handleRevokeAllowance}
                  disabled={isRevoking}
                  className="w-full btn-secondary py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRevoking ? (
                    <div className="flex items-center justify-center space-x-2">
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Revoking Allowance...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <span>Revoke Allowance</span>
                    </div>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        );

      case 'success':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-success-900/50 border border-success-700 rounded-lg p-4"
          >
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-success-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-success-400 font-medium">Transfer Successful</h3>
                <p className="text-success-300 text-sm mt-1">
                  Your {sourceToken.symbol} tokens have been successfully transferred to {formData.destinationNetwork}.
                </p>
                {transferTxHash && (
                  <p className="text-success-300 text-xs mt-2 font-mono">
                    TX: {transferTxHash.slice(0, 10)}...{transferTxHash.slice(-8)}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {renderStep()}
    </div>
  );
};

export default Expatriation;
