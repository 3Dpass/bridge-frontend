import React, { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { AlertCircle, CheckCircle, ArrowRight, Loader } from 'lucide-react';
import { motion } from 'framer-motion';
import { IMPORT_WRAPPER_ABI } from '../contracts/abi';
import toast from 'react-hot-toast';
import { parseAndValidateReward } from '../utils/safe-reward-handler';
import { addTransferEventToStorage } from './ClaimList';
import { getBlockTimestamp } from '../utils/bridge-contracts';

// Safely convert to EIP-55 checksum if it's an EVM address
const toChecksumAddress = (address) => {
  try {
    return ethers.utils.getAddress(address);
  } catch (e) {
    return address;
  }
};

const Repatriation = ({ 
  bridgeInstance, 
  formData, 
  sourceToken, 
  signer, 
  onSuccess, 
  onError 
}) => {
  const [step, setStep] = useState('confirm'); // 'confirm', 'transfer', 'success'
  const [isLoading, setIsLoading] = useState(false);
  const [transferTxHash, setTransferTxHash] = useState('');

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


  // Create import wrapper contract for repatriation
  const createImportWrapperContract = useCallback(async () => {
    // Use IMPORT_WRAPPER_ABI for repatriation functionality
    const { ethers } = await import('ethers');
    return new ethers.Contract(bridgeInstance.address, IMPORT_WRAPPER_ABI, signer);
  }, [signer, bridgeInstance.address]);



  // Handle repatriation transfer
  const handleRepatriation = async () => {
    setIsLoading(true);
    
    try {
      console.log('🔄 Starting repatriation process...');
      console.log('📋 Repatriation details:', {
        bridgeAddress: bridgeInstance.address,
        homeAddress: formData.destinationAddress,
        amount: formData.amount,
        reward: formData.reward,
        sourceTokenDecimals: sourceToken.decimals,
        bridgeType: bridgeInstance.type,
        homeNetwork: bridgeInstance.homeNetwork,
        foreignNetwork: bridgeInstance.foreignNetwork
      });

      const contract = await createImportWrapperContract();
      const destinationAddressChecksummed = toChecksumAddress(formData.destinationAddress);
      const amountWei = ethers.utils.parseUnits(formData.amount, sourceToken.decimals);
      const rewardInput = (formData.reward && String(formData.reward).length > 0) ? formData.reward : '0';
      
      // CRITICAL: Repatriation requires uint reward, but we still cap it for claim compatibility
      // Use centralized utility for safe reward handling with auto-capping
      const rewardData = parseAndValidateReward(rewardInput, sourceToken.decimals, sourceToken.symbol, false);
      const rewardWei = rewardData.reward;
      
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
            <p className="text-warning-300 text-xs mt-2">
              This ensures the reward can be claimed later without overflow errors.
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
      
      const data = "0x"; // Empty data for repatriation
      
      console.log('💰 Parsed amounts:', {
        amountWei: ethers.utils.formatUnits(amountWei, sourceToken.decimals),
        rewardWei: rewardData.displayValue
      });

      // Log final transaction parameters that will be sent to the smart contract
      console.log('🚀 FINAL TRANSACTION PARAMETERS (Repatriation):', {
        functionName: 'transferToHomeChain',
        parameters: {
          home_address: destinationAddressChecksummed,
          data: data,
          amount: {
            value: amountWei.toString(),
            type: 'BigNumber',
            humanReadable: ethers.utils.formatUnits(amountWei, sourceToken.decimals) + ' ' + sourceToken.symbol
          },
          reward: {
            value: rewardWei.toString(),
            type: 'BigNumber',
            humanReadable: rewardData.displayValue + ' ' + sourceToken.symbol,
            contractExpects: 'uint (must be positive)',
            maxSafeValue: rewardData.maxSafeValue + ' ' + sourceToken.symbol,
            wasCapped: rewardData.wasCapped,
            originalValue: rewardData.originalValue + ' ' + sourceToken.symbol
          }
        },
        gasLimit: 500000,
        contractAddress: bridgeInstance.address,
        contractFunction: 'transferToHomeChain(string, string, uint, uint)'
      });

      // Use fixed gas limit like the working test script
      const gasLimit = 500000;
      
      console.log('⛽ Gas limit:', gasLimit);
      
      setStep('transfer');
      
      console.log('🔐 Executing repatriation transfer...');
      const repatriationTx = await contract.transferToHomeChain(
        destinationAddressChecksummed,
        data,
        amountWei,
        rewardWei,
        { gasLimit: gasLimit }
      );
      
      console.log('⏳ Waiting for repatriation transaction confirmation...');
      const receipt = await repatriationTx.wait();
      
      console.log('✅ Repatriation transaction confirmed:', receipt.transactionHash);
      setTransferTxHash(receipt.transactionHash);
      setStep('success');
      
      // Add NewRepatriation event to browser storage for immediate visibility
      try {
        const eventData = {
          // Event data
          eventType: 'NewRepatriation',
          senderAddress: await signer.getAddress(),
          amount: amountWei.toString(),
          reward: rewardWei.toString(),
          homeAddress: destinationAddressChecksummed,
          recipientAddress: destinationAddressChecksummed, // for UI compatibility
          data: data,
          
          // Event metadata
          blockNumber: receipt.blockNumber,
          transactionHash: receipt.transactionHash,
          logIndex: 0, // We don't have logIndex from receipt, use 0 as fallback
          timestamp: await getBlockTimestamp(signer.provider, receipt.blockNumber),
          
          // Bridge information
          bridgeInstance: bridgeInstance, // Full bridge instance object
          bridgeAddress: bridgeInstance.address,
          bridgeType: bridgeInstance.type,
          homeNetwork: bridgeInstance.homeNetwork,
          foreignNetwork: bridgeInstance.foreignNetwork,
          homeTokenAddress: bridgeInstance.homeTokenAddress,
          foreignTokenAddress: bridgeInstance.foreignTokenAddress,
          homeTokenSymbol: bridgeInstance.homeTokenSymbol,
          foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
          
          // Network information
          networkKey: bridgeInstance.foreignNetwork.toLowerCase(),
          networkName: bridgeInstance.foreignNetwork, // Use network name as fallback
          networkId: bridgeInstance.foreignNetwork.toLowerCase(),
          
          // Transfer direction
          direction: 'import', // From foreign to home
          fromNetwork: bridgeInstance.foreignNetwork,
          toNetwork: bridgeInstance.homeNetwork,
          fromTokenSymbol: bridgeInstance.foreignTokenSymbol,
          toTokenSymbol: bridgeInstance.homeTokenSymbol,
          
          // Token information (for compatibility)
          tokenSymbol: sourceToken.symbol,
          tokenAddress: sourceToken.address,
          
          // Status
          status: 'pending'
        };
        
        console.log('💾 Adding NewRepatriation event to storage:', eventData);
        addTransferEventToStorage(eventData);
      } catch (storageError) {
        console.warn('⚠️ Failed to add event to storage:', storageError);
      }
      
      // Parse NewRepatriation event if available
      try {
        const newRepatriationEvent = receipt.logs.find(log => {
          try {
            const decoded = contract.interface.parseLog(log);
            return decoded.name === 'NewRepatriation';
          } catch (e) {
            return false;
          }
        });
        
        if (newRepatriationEvent) {
          const decoded = contract.interface.parseLog(newRepatriationEvent);
          console.log('📝 NewRepatriation Event Details:', {
            sender: decoded.args.sender_address,
            amount: ethers.utils.formatUnits(decoded.args.amount, sourceToken.decimals),
            reward: ethers.utils.formatUnits(decoded.args.reward, sourceToken.decimals),
            homeAddress: decoded.args.home_address,
            data: decoded.args.data
          });
        }
      } catch (eventError) {
        console.warn('Could not parse NewRepatriation event:', eventError);
      }
      
      // Call success callback
      if (onSuccess) {
        onSuccess(receipt.transactionHash);
      }
      
    } catch (error) {
      console.error('❌ Repatriation failed:', error);
      const errorInfo = parseError(error);
      setStep('confirm');
      
      // Show toast notification
      toast.error(
        <div>
          <h3 className="text-error-400 font-medium">{errorInfo.title}</h3>
          <p className="text-error-300 text-sm mt-1">{errorInfo.message}</p>
          {errorInfo.type === 'user_rejection' && (
            <p className="text-error-200 text-xs mt-2">💡 You can try again by clicking the repatriation button.</p>
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
      
      if (onError) {
        onError(errorInfo.message);
      }
    } finally {
      setIsLoading(false);
    }
  };



  const renderStepContent = () => {
    switch (step) {
      case 'confirm':
        return (
          <div className="space-y-6">
   

            <div className="bg-warning-900/20 border border-warning-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-warning-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-warning-400 font-medium">Important Notice</h4>
                  <p className="text-warning-300 text-sm mt-1">
                    This repatriation will burn your {sourceToken.symbol} tokens on {bridgeInstance.foreignNetwork} 
                    and initiate the transfer back to {bridgeInstance.homeNetwork}. 
                    The process may take some time to complete.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleRepatriation}
              disabled={isLoading}
              className="w-full btn-primary py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Processing Repatriation...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Initiate Transfer</span>
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </button>
          </div>
        );

      case 'transfer':
        return (
          <div className="space-y-6">
            <div className="bg-primary-900/20 border border-primary-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Loader className="w-5 h-5 text-primary-400 animate-spin" />
                <div>
                  <h4 className="text-primary-400 font-medium">Processing Repatriation</h4>
                  <p className="text-primary-300 text-sm mt-1">
                    Burning {formData.amount} {sourceToken.symbol} and initiating transfer to {bridgeInstance.homeNetwork}...
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-6">
            <div className="bg-success-900/20 border border-success-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-success-400" />
                <div>
                  <h4 className="text-success-400 font-medium">Repatriation Successful!</h4>
                  <p className="text-success-300 text-sm mt-1">
                    Your {formData.amount} {sourceToken.symbol} has been burned and the transfer to {bridgeInstance.homeNetwork} has been initiated.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-dark-800 border border-secondary-700 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-3">Transaction Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-secondary-400">Status:</span>
                  <span className="text-success-400">Completed</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Transaction Hash:</span>
                  <span className="text-white font-mono text-xs">
                    {transferTxHash.slice(0, 6)}...{transferTxHash.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Amount Burned:</span>
                  <span className="text-white">{formData.amount} {sourceToken.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Reward Paid:</span>
                  <span className="text-white">{formData.reward} P3D</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Destination:</span>
                  <span className="text-white font-mono text-xs">
                    {formData.destinationAddress.slice(0, 6)}...{formData.destinationAddress.slice(-4)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-info-900/20 border border-info-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 bg-info-500 rounded-full mt-0.5 flex-shrink-0"></div>
                <div>
                  <h4 className="text-info-400 font-medium">Next Steps</h4>
                  <p className="text-info-300 text-sm mt-1">
                    The repatriation has been initiated. The tokens will be transferred to {bridgeInstance.homeNetwork} 
                    once the process completes. You can track the progress using the transaction hash above.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSuccess && onSuccess(transferTxHash)}
              className="w-full btn-primary py-3"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Done
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >

      {/* Step Content */}
      {renderStepContent()}
    </motion.div>
  );
};

export default Repatriation;
