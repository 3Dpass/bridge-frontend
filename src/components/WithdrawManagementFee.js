import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { IMPORT_ASSISTANT_ABI, IMPORT_WRAPPER_ASSISTANT_ABI, EXPORT_ASSISTANT_ABI } from '../contracts/abi';

const WithdrawManagementFee = ({ assistant, onClose, onSuccess }) => {
  const { provider, signer } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [managementFeeInfo, setManagementFeeInfo] = useState({
    stakeAmount: '0',
    imageAmount: '0',
    networkFeeCompensation: '0'
  });


  const loadManagementFeeInfo = useCallback(async () => {
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
        // Import Wrapper Assistant - has both stake and image management fees
        try {
          const [mf, networkFeeComp] = await Promise.all([
            contract.mf(),
            contract.network_fee_compensation()
          ]);
          
          setManagementFeeInfo({
            stakeAmount: mf.stake.toString(),
            imageAmount: mf.image.toString(),
            networkFeeCompensation: networkFeeComp.toString()
          });
        } catch (error) {
          console.error('Error loading import_wrapper management fee info:', error);
          setManagementFeeInfo({
            stakeAmount: '0',
            imageAmount: '0',
            networkFeeCompensation: '0'
          });
        }
      } else if (assistant.type === 'import') {
        // Regular Import Assistant - has both stake and image management fees
        try {
          const [mf, networkFeeComp] = await Promise.all([
            contract.mf(),
            contract.network_fee_compensation()
          ]);
          
          setManagementFeeInfo({
            stakeAmount: mf.stake.toString(),
            imageAmount: mf.image.toString(),
            networkFeeCompensation: networkFeeComp.toString()
          });
        } catch (error) {
          console.error('Error loading import management fee info:', error);
          setManagementFeeInfo({
            stakeAmount: '0',
            imageAmount: '0',
            networkFeeCompensation: '0'
          });
        }
      } else if (assistant.type === 'export') {
        // Regular Export Assistant - has only stake management fee
        try {
          const [mf, networkFeeComp] = await Promise.all([
            contract.mf(),
            contract.network_fee_compensation()
          ]);
          
          setManagementFeeInfo({
            stakeAmount: mf.toString(),
            imageAmount: '0', // Export assistants don't have image tokens
            networkFeeCompensation: networkFeeComp.toString()
          });
        } catch (error) {
          console.error('Error loading export management fee info:', error);
          setManagementFeeInfo({
            stakeAmount: '0',
            imageAmount: '0',
            networkFeeCompensation: '0'
          });
        }
      }
    } catch (error) {
      console.error('Error loading management fee info:', error);
    }
  }, [provider, assistant.address, assistant.type]);

  const handleWithdrawManagementFee = useCallback(async () => {
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
      
      console.log('Withdrawing management fee for assistant:', assistant.address);
      
      const tx = await contract.withdrawManagementFee();
      console.log('Transaction sent:', tx.hash);
      
      toast.success('Management fee withdrawal transaction sent!');
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      
      toast.success('Management fee withdrawn successfully!');
      
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (error) {
      console.error('Error withdrawing management fee:', error);
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        toast.error('Transaction rejected by user');
      } else if (error.message?.includes('insufficient funds') || error.message?.includes('insufficient balance')) {
        toast.error('Insufficient funds for gas');
      } else if (error.message?.includes('onlyManager') || error.message?.includes('not manager')) {
        toast.error('Only the manager can withdraw management fees');
      } else if (error.message?.includes('no management fee') || error.message?.includes('no fee')) {
        toast.error('No management fees available to withdraw');
      } else if (error.message?.includes('network') || error.message?.includes('connection')) {
        toast.error('Network error. Please check your connection and try again');
      } else if (error.message?.includes('gas')) {
        toast.error('Gas estimation failed. Please try again');
      } else {
        // Extract a more user-friendly error message
        let errorMessage = 'Failed to withdraw management fee';
        if (error.message) {
          if (error.message.includes('user rejected')) {
            errorMessage = 'Transaction rejected by user';
          } else if (error.message.includes('execution reverted')) {
            errorMessage = 'Transaction failed. Please check if you are the manager and try again';
          } else {
            errorMessage = `Failed to withdraw management fee: ${error.message}`;
          }
        }
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [signer, assistant.address, assistant.type, onSuccess, onClose]);

  useEffect(() => {
    loadManagementFeeInfo();
  }, [loadManagementFeeInfo]);

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
          <h3 className="text-lg font-semibold text-white">Withdraw Management Fee</h3>
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
            <h4 className="text-sm font-medium text-white mb-2">Available Management Fees</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary-400">Stake Token Fee:</span>
                <span className="text-white">{formatBalance(managementFeeInfo.stakeAmount)}</span>
              </div>
              {(assistant.type === 'import' || assistant.type === 'import_wrapper') && (
                <div className="flex justify-between">
                  <span className="text-secondary-400">Image Token Fee:</span>
                  <span className="text-white">{formatBalance(managementFeeInfo.imageAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-secondary-400">Network Fee Compensation:</span>
                <span className="text-white">{formatBalance(managementFeeInfo.networkFeeCompensation)}</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-yellow-200">
                <p className="font-medium mb-1">Manager Only</p>
                <p>Only the manager of this assistant can withdraw management fees. This action will withdraw all accumulated management fees.</p>
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
              onClick={handleWithdrawManagementFee}
              disabled={loading}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-800 disabled:cursor-not-allowed text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Withdrawing...
                </div>
              ) : (
                'Withdraw Management Fee'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WithdrawManagementFee;
