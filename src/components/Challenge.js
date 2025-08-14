import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { 
  createCounterstakeContract
} from '../utils/bridge-contracts';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Loader
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const Challenge = ({ claim, onChallengeSuccess, onClose }) => {
  const { account, provider, network } = useWeb3();

  
  const [loading, setLoading] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState(null); // 0 for NO, 1 for YES
  const [requiredStake, setRequiredStake] = useState(null);
  const [userP3DBalance, setUserP3DBalance] = useState(null);
  const [error, setError] = useState('');

  // Get actual claim number from the claim object (not the display number)
  const actualClaimNum = claim.actualClaimNum || claim.claim_num || claim.debug_claim_num;
  
  // For display, use the display number that matches what the user sees
  const displayClaimNum = claim.claimNum;
  
  // Debug logging to see what we're getting
  console.log('🔍 Challenge component - Full claim object:', claim);
  console.log('🔍 Challenge component - Claim number values:', {
    claim_actualClaimNum: claim.actualClaimNum,
    claim_claim_num: claim.claim_num,
    claim_debug_claim_num: claim.debug_claim_num,
    actualClaimNum: actualClaimNum,
    displayClaimNum: displayClaimNum
  });

  const calculateRequiredStake = useCallback(async () => {
    try {
      if (!claim.bridgeAddress || !provider) return;

      // const contract = await createCounterstakeContract(provider, claim.bridgeAddress);
      
      // Get the current outcome (0 = NO, 1 = YES)
      const currentOutcome = claim.currentOutcome || claim.current_outcome;
      
      // Calculate required stake for the opposite outcome
      // If current outcome is YES (1), we need stake for NO (0)
      // If current outcome is NO (0), we need stake for YES (1)
      const oppositeOutcome = currentOutcome === 1 ? 0 : 1;
      
      // Get the current stake for the opposite outcome
      const currentStake = oppositeOutcome === 1 ? 
        (claim.yesStake || claim.yes_stake || 0) : 
        (claim.noStake || claim.no_stake || 0);
      
      // Calculate required stake (1.5x current stake + 1 unit)
      const requiredStakeWei = currentStake.mul(150).div(100).add(1);
      
      // Convert to human readable format
      const stakeDecimals = 12; // P3D has 12 decimals
      const requiredStakeFormatted = ethers.utils.formatUnits(requiredStakeWei, stakeDecimals);
      
      setRequiredStake(requiredStakeFormatted);
      setStakeAmount(requiredStakeFormatted);
    } catch (error) {
      console.error('Error calculating required stake:', error);
      setError('Failed to calculate required stake');
    }
  }, [claim, provider]);

  const getUserP3DBalance = useCallback(async () => {
    try {
      if (!provider || !account) return;

      // Get P3D balance using the precompile
      const p3dPrecompileAddress = '0x0000000000000000000000000000000000000802';
      const p3dAbi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)"
      ];
      
      const p3dContract = new ethers.Contract(p3dPrecompileAddress, p3dAbi, provider);
      const balance = await p3dContract.balanceOf(account);
      
      const balanceFormatted = ethers.utils.formatUnits(balance, 12); // P3D has 12 decimals
      setUserP3DBalance(balanceFormatted);
    } catch (error) {
      console.error('Error getting P3D balance:', error);
      setError('Failed to get P3D balance');
    }
  }, [provider, account]);

  useEffect(() => {
    if (claim && provider && account) {
      calculateRequiredStake();
      getUserP3DBalance();
      
      // Auto-select the opposite outcome (you can only challenge with the opposite outcome)
      const currentOutcome = claim.currentOutcome || claim.current_outcome;
      const oppositeOutcome = currentOutcome === 1 ? 0 : 1; // If current is YES (1), challenge with NO (0)
      setSelectedOutcome(oppositeOutcome);
    }
  }, [claim, provider, account, calculateRequiredStake, getUserP3DBalance]);

  const handleChallenge = async () => {
    if (selectedOutcome === null) {
      setError('Please select an outcome to challenge');
      return;
    }

    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      setError('Please enter a valid stake amount');
      return;
    }

    if (userP3DBalance && parseFloat(stakeAmount) > parseFloat(userP3DBalance)) {
      setError('Insufficient P3D balance');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const signer = provider.getSigner();
      const contract = await createCounterstakeContract(signer, claim.bridgeAddress);
      
      // Convert stake amount to Wei
      const stakeAmountWei = ethers.utils.parseUnits(stakeAmount, 12); // P3D has 12 decimals
      
      // First, approve the bridge to spend P3D tokens
      const p3dPrecompileAddress = '0x0000000000000000000000000000000000000802';
      const p3dAbi = [
        "function approve(address spender, uint256 amount) returns (bool)"
      ];
      
      const p3dContract = new ethers.Contract(p3dPrecompileAddress, p3dAbi, signer);
      
      console.log('Approving P3D for bridge...');
      const approveTx = await p3dContract.approve(claim.bridgeAddress, stakeAmountWei);
      await approveTx.wait();
      console.log('P3D approval successful');

      // Now call the challenge function using explicit function signature for overloaded function
      console.log(`Challenging claim ${actualClaimNum} with outcome ${selectedOutcome} and stake ${stakeAmount} P3D`);
      const challengeTx = await contract.functions['challenge(uint256,uint8,uint256)'](actualClaimNum, selectedOutcome, stakeAmountWei, {
        gasLimit: 500000
      });
      
      const receipt = await challengeTx.wait();
      console.log('Challenge successful:', receipt);

      toast.success(
        <div>
          <h3 className="text-success-400 font-medium">Success</h3>
          <p className="text-success-300 text-sm mt-1">Challenge submitted successfully!</p>
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
      
      if (onChallengeSuccess) {
        onChallengeSuccess(actualClaimNum);
      }
      
      onClose();
    } catch (error) {
      console.error('Error challenging claim:', error);
      setError(`Failed to challenge claim: ${error.message}`);
      toast.error('Failed to challenge claim');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentOutcomeText = () => {
    const currentOutcome = claim.currentOutcome || claim.current_outcome;
    return currentOutcome === 1 ? 'YES' : 'NO';
  };



  const formatAmount = (amount, decimals = 18) => {
    try {
      if (!amount) return '0';
      return ethers.utils.formatUnits(amount, decimals);
    } catch (error) {
      console.error('Error formatting amount:', error);
      return '0';
    }
  };

  const getTransferTokenSymbol = () => {
    if (claim.bridgeTokenSymbol) {
      return claim.bridgeTokenSymbol;
    }
    
    if (claim.bridgeType === 'import' || claim.bridgeType === 'import_wrapper') {
      return claim.homeTokenSymbol || 'Unknown';
    }
    if (claim.bridgeType === 'export') {
      return claim.foreignTokenSymbol || 'Unknown';
    }
    
    return network?.symbol || 'Unknown';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-dark-900 rounded-lg p-6 w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Challenge Claim #{displayClaimNum}</h2>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          {/* Claim Information */}
          <div className="bg-dark-800 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Claim Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary-400">Amount:</span>
                <span className="text-white">
                  {formatAmount(claim.amount, 6)} {getTransferTokenSymbol()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-400">Current Outcome:</span>
                <span className="text-white font-medium">{getCurrentOutcomeText()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-400">YES Stakes:</span>
                <span className="text-white">
                  {formatAmount(claim.yesStake || claim.yes_stake, 12)} P3D
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-400">NO Stakes:</span>
                <span className="text-white">
                  {formatAmount(claim.noStake || claim.no_stake, 12)} P3D
                </span>
              </div>
            </div>
          </div>

          {/* Challenge Outcome Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Challenge Outcome</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedOutcome(1)}
                disabled={getCurrentOutcomeText() === 'YES'}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  selectedOutcome === 1
                    ? 'border-success-500 bg-success-500/10 text-success-500'
                    : getCurrentOutcomeText() === 'YES'
                      ? 'border-dark-600 bg-dark-700 text-dark-400 cursor-not-allowed opacity-50'
                      : 'border-dark-700 bg-dark-800 text-secondary-400 hover:border-primary-500 hover:text-primary-500'
                }`}
              >
                <CheckCircle className="w-6 h-6 mx-auto mb-2" />
                <span className="font-medium">YES</span>
                {getCurrentOutcomeText() === 'YES' && (
                  <span className="text-xs block mt-1 text-dark-400">(Current)</span>
                )}
              </button>
              <button
                onClick={() => setSelectedOutcome(0)}
                disabled={getCurrentOutcomeText() === 'NO'}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  selectedOutcome === 0
                    ? 'border-error-500 bg-error-500/10 text-error-500'
                    : getCurrentOutcomeText() === 'NO'
                      ? 'border-dark-600 bg-dark-700 text-dark-400 cursor-not-allowed opacity-50'
                      : 'border-dark-700 bg-dark-800 text-secondary-400 hover:border-primary-500 hover:text-primary-500'
                }`}
              >
                <XCircle className="w-6 h-6 mx-auto mb-2" />
                <span className="font-medium">NO</span>
                {getCurrentOutcomeText() === 'NO' && (
                  <span className="text-xs block mt-1 text-dark-400">(Current)</span>
                )}
              </button>
            </div>
            

          </div>

          {/* Stake Amount */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-white mb-2">
              Stake Amount (P3D)
            </label>
            <input
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Enter stake amount"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-secondary-400 focus:outline-none focus:border-primary-500"
              step="0.000001"
              min="0"
            />
            {requiredStake && (
              <div className="mt-2 text-sm text-secondary-400">
                Required minimum: {requiredStake} P3D
              </div>
            )}
            {userP3DBalance && (
              <div className="mt-1 text-sm text-secondary-400">
                Your balance: {userP3DBalance} P3D
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-error-500/10 border border-error-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-error-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-dark-800 text-white rounded-lg hover:bg-dark-700 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleChallenge}
              disabled={loading || selectedOutcome === null || !stakeAmount}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Challenging...
                </>
              ) : (
                'Challenge Claim'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Challenge;
