import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const AssignNewManager = ({ assistant, onClose, onSuccess }) => {
  const { signer } = useWeb3();
  const { getAllNetworksWithSettings } = useSettings();
  const [newManagerAddress, setNewManagerAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const getRequiredNetwork = useCallback(() => {
    const networksWithSettings = getAllNetworksWithSettings();
    
    for (const networkKey in networksWithSettings) {
      const networkConfig = networksWithSettings[networkKey];
      
      if (networkConfig && networkConfig.bridges) {
        for (const bridgeKey in networkConfig.bridges) {
          const bridge = networkConfig.bridges[bridgeKey];
          
          if (bridge.address === assistant.bridgeAddress) {
            return {
              ...networkConfig,
              chainId: networkConfig.id,
              bridgeAddress: bridge.address,
              assistantType: assistant.type
            };
          }
        }
      }
    }
    return null;
  }, [assistant, getAllNetworksWithSettings]);

  const handleAssignNewManager = useCallback(async () => {
    if (!newManagerAddress.trim()) {
      toast.error('Please enter a new manager address');
      return;
    }

    // Validate address format
    if (!ethers.utils.isAddress(newManagerAddress)) {
      toast.error('Please enter a valid Ethereum address');
      return;
    }

    // Check if the new manager address is the same as current manager
    if (newManagerAddress.toLowerCase() === assistant.managerAddress?.toLowerCase()) {
      toast.error('New manager address must be different from current manager');
      return;
    }

    setLoading(true);

    try {
      const requiredNetwork = getRequiredNetwork();
      if (!requiredNetwork) {
        toast.error('Could not determine required network for this assistant');
        return;
      }

      // Check current network
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainIdNumber = parseInt(currentChainId, 16);
      
      if (currentChainIdNumber !== requiredNetwork.chainId) {
        toast.error(`Please switch to ${requiredNetwork.name} network first`);
        return;
      }

      // Create contract instance
      const assistantContract = new ethers.Contract(
        assistant.address,
        [
          'function assignNewManager(address newManager) external',
          'function managerAddress() view returns (address)'
        ],
        signer
      );

      // Estimate gas
      let gasLimit;
      try {
        const gasEstimate = await assistantContract.estimateGas.assignNewManager(newManagerAddress);
        gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
      } catch (gasError) {
        console.warn('Gas estimation failed, using default gas limit:', gasError);
        // Use a reasonable default gas limit if estimation fails
        gasLimit = ethers.BigNumber.from('200000');
      }

      // Send transaction
      toast.loading('Assigning new manager...', { id: 'assign-manager' });
      
      const tx = await assistantContract.assignNewManager(newManagerAddress, {
        gasLimit
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        toast.success('New manager assigned successfully!', { id: 'assign-manager' });
        onSuccess();
      } else {
        toast.error('Transaction failed', { id: 'assign-manager' });
      }
    } catch (error) {
      console.error('Error assigning new manager:', error);
      
      // Handle user rejection gracefully
      if (error.code === 'ACTION_REJECTED' || error.code === 'USER_REJECTED' || 
          error.message?.includes('user rejected') || error.message?.includes('User denied')) {
        toast.error('Transaction cancelled by user', { id: 'assign-manager' });
        return; // Don't show additional error messages for user cancellation
      }
      
      // Handle insufficient funds
      if (error.code === 'INSUFFICIENT_FUNDS' || error.message?.includes('insufficient funds')) {
        toast.error('Insufficient funds for gas fees', { id: 'assign-manager' });
      } 
      // Handle network issues
      else if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
        toast.error('Network error. Please check your connection and try again', { id: 'assign-manager' });
      }
      // Handle contract-specific errors
      else if (error.message?.includes('zero address')) {
        toast.error('Cannot assign zero address as manager', { id: 'assign-manager' });
      } else if (error.message?.includes('P3D precompile cannot be manager')) {
        toast.error('P3D precompile cannot be assigned as manager', { id: 'assign-manager' });
      } else if (error.message?.includes('ERC20 precompile cannot be manager')) {
        toast.error('ERC20 precompile cannot be assigned as manager', { id: 'assign-manager' });
      } else if (error.message?.includes('onlyManager')) {
        toast.error('Only the current manager can assign a new manager', { id: 'assign-manager' });
      }
      // Handle gas estimation errors
      else if (error.message?.includes('gas') || error.code === 'UNPREDICTABLE_GAS_LIMIT') {
        toast.error('Gas estimation failed. Please try again', { id: 'assign-manager' });
      }
      // Handle timeout errors
      else if (error.message?.includes('timeout') || error.code === 'TIMEOUT') {
        toast.error('Transaction timeout. Please try again', { id: 'assign-manager' });
      }
      // Generic error handling
      else {
        const errorMessage = error.message || error.reason || 'Unknown error occurred';
        toast.error(`Failed to assign new manager: ${errorMessage}`, { id: 'assign-manager' });
      }
    } finally {
      setLoading(false);
    }
  }, [newManagerAddress, assistant, signer, getRequiredNetwork, onSuccess]);

  const handleClose = useCallback(() => {
    if (!loading) {
      setNewManagerAddress('');
      onClose();
    }
  }, [loading, onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-dark-800 rounded-lg p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Assign New Manager</h3>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-secondary-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary-300 mb-2">
              Assistant Contract
            </label>
            <div className="text-sm text-secondary-400 font-mono bg-dark-700 p-2 rounded">
              {assistant.address}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-300 mb-2">
              Current Manager
            </label>
            <div className="text-sm text-secondary-400 font-mono bg-dark-700 p-2 rounded">
              {assistant.managerAddress}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-300 mb-2">
              New Manager Address
            </label>
            <input
              type="text"
              value={newManagerAddress}
              onChange={(e) => setNewManagerAddress(e.target.value)}
              placeholder="0x..."
              disabled={loading}
              className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white placeholder-secondary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-secondary-500 mt-1">
              Enter the Ethereum address of the new manager
            </p>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-md p-3">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-yellow-200">
                <p className="font-medium mb-1">Warning</p>
                <p>This action will transfer management rights to the new address. The current manager will lose all management privileges.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleAssignNewManager}
            disabled={loading || !newManagerAddress.trim()}
            className="flex-1 px-4 py-2 bg-secondary-600 hover:bg-secondary-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Assigning...
              </>
            ) : (
              'Assign New Manager'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AssignNewManager;
