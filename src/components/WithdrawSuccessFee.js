import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { IMPORT_ASSISTANT_ABI, IMPORT_WRAPPER_ASSISTANT_ABI, EXPORT_ASSISTANT_ABI } from '../contracts/abi';

const WithdrawSuccessFee = ({ assistant, onClose, onSuccess }) => {
  const { provider, signer } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [successFeeInfo, setSuccessFeeInfo] = useState({
    stakeProfit: '0',
    imageProfit: '0',
    successFeeRate: '0'
  });


  const loadSuccessFeeInfo = useCallback(async () => {
    if (!provider || !assistant.address) return;

    try {
      // Get the appropriate ABI based on assistant type
      let abi;
      if (assistant.type === 'import_wrapper') {
        abi = IMPORT_WRAPPER_ASSISTANT_ABI;
      } else if (assistant.type === 'import') {
        abi = IMPORT_ASSISTANT_ABI;
      } else if (assistant.type === 'export') {
        abi = EXPORT_ASSISTANT_ABI;
      } else {
        console.error('Unknown assistant type:', assistant.type);
        return;
      }

      const contract = new ethers.Contract(assistant.address, abi, provider);

      if (assistant.type === 'import_wrapper') {
        // Import Wrapper Assistant - has both stake and image profits
        try {
          const [profitStake, profitImage, successFeeRate] = await Promise.all([
            contract.profit.stake(),
            contract.profit.image(),
            contract.success_fee10000()
          ]);
          
          setSuccessFeeInfo({
            stakeProfit: profitStake.toString(),
            imageProfit: profitImage.toString(),
            successFeeRate: (successFeeRate / 100).toString() // Convert from basis points to percentage
          });
        } catch (error) {
          console.error('Error loading import_wrapper success fee info:', error);
          setSuccessFeeInfo({
            stakeProfit: '0',
            imageProfit: '0',
            successFeeRate: '0'
          });
        }
      } else if (assistant.type === 'import') {
        // Regular Import Assistant - has both stake and image profits
        try {
          const [profit, successFeeRate] = await Promise.all([
            contract.profit(),
            contract.success_fee10000()
          ]);
          
          setSuccessFeeInfo({
            stakeProfit: profit.stake.toString(),
            imageProfit: profit.image.toString(),
            successFeeRate: (successFeeRate / 100).toString() // Convert from basis points to percentage
          });
        } catch (error) {
          console.error('Error loading import success fee info:', error);
          setSuccessFeeInfo({
            stakeProfit: '0',
            imageProfit: '0',
            successFeeRate: '0'
          });
        }
      } else if (assistant.type === 'export') {
        // Regular Export Assistant - has only stake profit
        try {
          const [profit, successFeeRate] = await Promise.all([
            contract.profit(),
            contract.success_fee10000()
          ]);
          
          setSuccessFeeInfo({
            stakeProfit: profit.toString(),
            imageProfit: '0', // Export assistants don't have image tokens
            successFeeRate: (successFeeRate / 100).toString() // Convert from basis points to percentage
          });
        } catch (error) {
          console.error('Error loading export success fee info:', error);
          setSuccessFeeInfo({
            stakeProfit: '0',
            imageProfit: '0',
            successFeeRate: '0'
          });
        }
      }
    } catch (error) {
      console.error('Error loading success fee info:', error);
    }
  }, [provider, assistant.address, assistant.type]);

  const handleWithdrawSuccessFee = useCallback(async () => {
    if (!signer || !assistant.address) {
      toast.error('Wallet not connected');
      return;
    }

    setLoading(true);
    try {
      // Get the appropriate ABI based on assistant type
      let abi;
      if (assistant.type === 'import_wrapper') {
        abi = IMPORT_WRAPPER_ASSISTANT_ABI;
      } else if (assistant.type === 'import') {
        abi = IMPORT_ASSISTANT_ABI;
      } else if (assistant.type === 'export') {
        abi = EXPORT_ASSISTANT_ABI;
      } else {
        toast.error('Unknown assistant type');
        setLoading(false);
        return;
      }

      const contract = new ethers.Contract(assistant.address, abi, signer);
      
      console.log('Withdrawing success fee for assistant:', assistant.address);
      
      const tx = await contract.withdrawSuccessFee();
      console.log('Transaction sent:', tx.hash);
      
      toast.success('Success fee withdrawal transaction sent!');
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      
      toast.success('Success fee withdrawn successfully!');
      
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (error) {
      console.error('Error withdrawing success fee:', error);
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        toast.error('Transaction rejected by user');
      } else if (error.message?.includes('insufficient funds') || error.message?.includes('insufficient balance')) {
        toast.error('Insufficient funds for gas');
      } else if (error.message?.includes('onlyManager') || error.message?.includes('not manager')) {
        toast.error('Only the manager can withdraw success fees');
      } else if (error.message?.includes('no profit yet') || error.message?.includes('no profit')) {
        toast.error('No profit available to withdraw yet');
      } else if (error.message?.includes('network') || error.message?.includes('connection')) {
        toast.error('Network error. Please check your connection and try again');
      } else if (error.message?.includes('gas')) {
        toast.error('Gas estimation failed. Please try again');
      } else {
        // Extract a more user-friendly error message
        let errorMessage = 'Failed to withdraw success fee';
        if (error.message) {
          if (error.message.includes('user rejected')) {
            errorMessage = 'Transaction rejected by user';
          } else if (error.message.includes('execution reverted')) {
            errorMessage = 'Transaction failed. Please check if you are the manager and try again';
          } else {
            errorMessage = `Failed to withdraw success fee: ${error.message}`;
          }
        }
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [signer, assistant.address, assistant.type, onSuccess, onClose]);

  useEffect(() => {
    loadSuccessFeeInfo();
  }, [loadSuccessFeeInfo]);

  const formatBalance = (balance, decimals = 18) => {
    try {
      const formatted = ethers.utils.formatUnits(balance, decimals);
      return parseFloat(formatted).toFixed(6);
    } catch (error) {
      return '0.000000';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Withdraw Success Fee</h3>
          <button
            onClick={onClose}
            className="text-secondary-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-dark-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">Assistant Information</h4>
            <div className="space-y-1 text-sm text-secondary-300">
              <div>Type: {assistant.type}</div>
              <div>Address: {assistant.address?.slice(0, 6)}...{assistant.address?.slice(-4)}</div>
              <div>Manager: {assistant.managerAddress?.slice(0, 6)}...{assistant.managerAddress?.slice(-4)}</div>
            </div>
          </div>

          <div className="bg-dark-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">Available Success Fees</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary-400">Stake Token Profit:</span>
                <span className="text-white">{formatBalance(successFeeInfo.stakeProfit)}</span>
              </div>
              {(assistant.type === 'import' || assistant.type === 'import_wrapper') && (
                <div className="flex justify-between">
                  <span className="text-secondary-400">Image Token Profit:</span>
                  <span className="text-white">{formatBalance(successFeeInfo.imageProfit)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-secondary-400">Success Fee Rate:</span>
                <span className="text-white">{successFeeInfo.successFeeRate}%</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-200">
                <p className="font-medium mb-1">Success Fee</p>
                <p>The success fee is calculated as a percentage of the profit generated by the assistant. Only the manager can withdraw this fee.</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-secondary-600 hover:bg-secondary-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleWithdrawSuccessFee}
              disabled={loading}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-800 disabled:cursor-not-allowed text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Withdrawing...
                </div>
              ) : (
                'Withdraw Success Fee'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WithdrawSuccessFee;
