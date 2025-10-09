import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
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
  const { account, provider, network, checkNetwork, switchToRequiredNetwork } = useWeb3();
  const { get3DPassTokenDecimals, get3DPassTokenDecimalsDisplayMultiplier, getAllNetworksWithSettings } = useSettings();

  
  const [loading, setLoading] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState(null); // 0 for NO, 1 for YES
  const [requiredStake, setRequiredStake] = useState(null);
  const [userP3DBalance, setUserP3DBalance] = useState(null);
  const [currentAllowance, setCurrentAllowance] = useState(null);
  const [error, setError] = useState('');

  // Get actual claim number from the claim object (not the display number)
  const actualClaimNum = claim.actualClaimNum || claim.claim_num || claim.debug_claim_num;
  
  // For display, use the display number that matches what the user sees
  const displayClaimNum = claim.claimNum;

  // Get the required network and stake token information
  const getRequiredNetworkAndStakeToken = useCallback(() => {
    try {
      const networks = getAllNetworksWithSettings();
      
      console.log('🔍 getAllNetworksWithSettings() returned:', networks);
      console.log('🔍 Type of networks:', typeof networks);
      console.log('🔍 Is array:', Array.isArray(networks));
      console.log('🔍 Looking for bridge address:', claim.bridgeAddress);
      
      // Check if networks is an object (not array)
      if (typeof networks !== 'object' || Array.isArray(networks)) {
        console.error('getAllNetworksWithSettings() did not return an object:', networks);
        return null;
      }
      
      // Find the network that contains this bridge
      for (const [networkKey, networkConfig] of Object.entries(networks)) {
        console.log(`🔍 Checking network: ${networkKey}`);
        if (networkConfig && networkConfig.bridges) {
          console.log(`🔍 Network ${networkKey} has bridges:`, Object.keys(networkConfig.bridges));
          for (const [bridgeKey, bridge] of Object.entries(networkConfig.bridges)) {
            console.log(`🔍 Checking bridge ${bridgeKey}:`, bridge.address, 'vs', claim.bridgeAddress);
            if (bridge && bridge.address && bridge.address.toLowerCase() === claim.bridgeAddress.toLowerCase()) {
              console.log('🔍 Found bridge configuration:', bridge);
              
              // Get the stake token information
              const stakeTokenAddress = bridge.stakeTokenAddress;
              const stakeTokenSymbol = bridge.stakeTokenSymbol;
              
              // Try to find the token in the network's tokens configuration
              let stakeToken = networkConfig.tokens[stakeTokenAddress];
              
              // If not found by address, try to find by symbol
              if (!stakeToken && stakeTokenSymbol) {
                stakeToken = Object.values(networkConfig.tokens).find(token => 
                  token.symbol === stakeTokenSymbol
                );
              }
              
              if (stakeToken) {
                console.log('🔍 Found stake token:', stakeToken);
                return {
                  network: networkConfig,
                  stakeToken: stakeTokenAddress,
                  stakeTokenAddress: stakeTokenAddress,
                  stakeTokenSymbol: stakeToken.symbol,
                  stakeTokenDecimals: stakeToken.decimals,
                  stakeTokenMultiplier: stakeToken.decimalsDisplayMultiplier || 1
                };
              } else {
                console.error('Stake token not found:', {
                  stakeTokenAddress,
                  stakeTokenSymbol,
                  availableTokens: Object.keys(networkConfig.tokens)
                });
                return null;
              }
            }
          }
        }
      }
      
      console.warn('Bridge not found in any network configuration:', claim.bridgeAddress);
      console.log('🔍 Available bridges across all networks:');
      for (const [networkKey, networkConfig] of Object.entries(networks)) {
        if (networkConfig && networkConfig.bridges) {
          for (const [bridgeKey, bridge] of Object.entries(networkConfig.bridges)) {
            console.log(`  ${networkKey}.${bridgeKey}: ${bridge.address}`);
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting required network and stake token:', error);
      return null;
    }
  }, [claim.bridgeAddress, getAllNetworksWithSettings]);

  const stakeInfo = getRequiredNetworkAndStakeToken();
  
  // Convert from display amount (with multiplier) to actual amount (for contract)
  const convertDisplayToActual = useCallback((displayAmount, decimals, tokenAddress) => {
    try {
      if (!displayAmount || parseFloat(displayAmount) === 0) return '0';
      
      const num = parseFloat(displayAmount);
      
      // Check if this is a P3D token and remove the multiplier
      if (tokenAddress) {
        const decimalsDisplayMultiplier = get3DPassTokenDecimalsDisplayMultiplier(tokenAddress);
        if (decimalsDisplayMultiplier) {
          // Remove the multiplier: 1.0 / 1000000 = 0.000001
          const actualNumber = num / decimalsDisplayMultiplier;
          // Format to the correct number of decimal places to avoid precision issues
          return actualNumber.toFixed(decimals);
        }
      }
      
      return displayAmount;
    } catch (error) {
      return '0';
    }
  }, [get3DPassTokenDecimalsDisplayMultiplier]);

  // Convert from actual amount (from contract) to display amount (with multiplier)
  const convertActualToDisplay = useCallback((actualAmount, decimals, tokenAddress) => {
    try {
      if (!actualAmount || parseFloat(actualAmount) === 0) return '0';
      
      const num = parseFloat(actualAmount);
      
      // Check if this is a P3D token and apply the multiplier
      if (tokenAddress) {
        const decimalsDisplayMultiplier = get3DPassTokenDecimalsDisplayMultiplier(tokenAddress);
        if (decimalsDisplayMultiplier) {
          // Apply the multiplier: 0.000001 * 1000000 = 1.0
          const displayNumber = num * decimalsDisplayMultiplier;
          return displayNumber.toFixed(6).replace(/\.?0+$/, '') || '0';
        }
      }
      
      return actualAmount;
    } catch (error) {
      return '0';
    }
  }, [get3DPassTokenDecimalsDisplayMultiplier]);
  
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

      console.log('🔍 Full claim object for stake calculation:', claim);
      console.log('🔍 Claim stake values:', {
        yesStake: claim.yesStake,
        yesStakeString: claim.yesStake?.toString(),
        yes_stake: claim.yes_stake,
        yes_stakeString: claim.yes_stake?.toString(),
        noStake: claim.noStake,
        noStakeString: claim.noStake?.toString(),
        no_stake: claim.no_stake,
        no_stakeString: claim.no_stake?.toString(),
        currentOutcome: claim.currentOutcome,
        current_outcome: claim.current_outcome
      });

      // const contract = await createCounterstakeContract(provider, claim.bridgeAddress);
      
      // Get the current outcome (0 = NO, 1 = YES)
      const currentOutcome = claim.currentOutcome || claim.current_outcome;
      
      // Calculate required stake for the opposite outcome
      // If current outcome is YES (1), we need stake for NO (0)
      // If current outcome is NO (0), we need stake for YES (1)
      const oppositeOutcome = currentOutcome === 1 ? 0 : 1;
      
      // Get the current stake for the outcome we're challenging against
      // If current outcome is YES (1), we challenge with NO (0) - so we need to stake against the YES stake
      // If current outcome is NO (0), we challenge with YES (1) - so we need to stake against the NO stake
      const currentStakeRaw = currentOutcome === 1 ? 
        (claim.yesStake || claim.yes_stake || 0) : 
        (claim.noStake || claim.no_stake || 0);
      
      // Convert to BigNumber if it's not already
      const currentStake = ethers.BigNumber.isBigNumber(currentStakeRaw) ? 
        currentStakeRaw : 
        ethers.BigNumber.from(currentStakeRaw || 0);
      
      console.log('🔍 Challenge stake calculation:', {
        currentOutcome,
        oppositeOutcome,
        currentStakeRaw,
        currentStake: currentStake.toString(),
        isBigNumber: ethers.BigNumber.isBigNumber(currentStake),
        explanation: `Challenging ${currentOutcome === 1 ? 'YES' : 'NO'} outcome with ${oppositeOutcome === 1 ? 'YES' : 'NO'} stake`
      });
      
      // Calculate required stake (1.5x current stake + 1 unit)
      const requiredStakeWei = currentStake.mul(150).div(100).add(1);
      
      console.log('🔍 Required stake calculation:', {
        currentStake: currentStake.toString(),
        requiredStakeWei: requiredStakeWei.toString(),
        calculation: `${currentStake.toString()} * 1.5 + 1 = ${requiredStakeWei.toString()}`
      });
      
      // Convert to human readable format using decimals from bridge settings
      const stakeTokenAddress = stakeInfo?.stakeTokenAddress;
      const stakeDecimals = stakeInfo?.stakeTokenDecimals || 18;
      const requiredStakeFormatted = ethers.utils.formatUnits(requiredStakeWei, stakeDecimals);
      
      console.log('🔍 Stake formatting:', {
        requiredStakeWei: requiredStakeWei.toString(),
        stakeDecimals,
        stakeTokenAddress,
        requiredStakeFormatted
      });
      
      // Apply multiplier for display if it's a P3D token
      const requiredStakeDisplay = convertActualToDisplay(requiredStakeFormatted, stakeDecimals, stakeTokenAddress);
      
      console.log('🔍 Final required stake display:', {
        requiredStakeFormatted,
        requiredStakeDisplay
      });
      
      setRequiredStake(requiredStakeDisplay);
    } catch (error) {
      console.error('Error calculating required stake:', error);
      setError('Failed to calculate required stake');
    }
  }, [claim, provider, stakeInfo, convertActualToDisplay]);

  const getUserStakeTokenBalance = useCallback(async () => {
    try {
      if (!provider || !account || !stakeInfo) return;

      const stakeTokenAddress = stakeInfo.stakeTokenAddress;
      const stakeTokenAbi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)"
      ];
      
      const stakeTokenContract = new ethers.Contract(stakeTokenAddress, stakeTokenAbi, provider);
      const balance = await stakeTokenContract.balanceOf(account);
      
      // Use decimals from bridge settings
      const stakeDecimals = stakeInfo.stakeTokenDecimals || 18;
      const balanceFormatted = ethers.utils.formatUnits(balance, stakeDecimals);
      
      // Apply multiplier for display if it's a P3D token
      const balanceDisplay = convertActualToDisplay(balanceFormatted, stakeDecimals, stakeTokenAddress);
      setUserP3DBalance(balanceDisplay);
    } catch (error) {
      console.error('Error getting stake token balance:', error);
      setError('Failed to get stake token balance');
    }
  }, [provider, account, stakeInfo, convertActualToDisplay]);

  const getCurrentAllowance = useCallback(async () => {
    try {
      if (!provider || !account || !claim.bridgeAddress || !stakeInfo) return;

      const stakeTokenAddress = stakeInfo.stakeTokenAddress;
      const stakeTokenAbi = [
        "function allowance(address owner, address spender) view returns (uint256)"
      ];
      
      const stakeTokenContract = new ethers.Contract(stakeTokenAddress, stakeTokenAbi, provider);
      const allowance = await stakeTokenContract.allowance(account, claim.bridgeAddress);
      
      // Use decimals from bridge settings
      const stakeDecimals = stakeInfo.stakeTokenDecimals || 18;
      const allowanceFormatted = ethers.utils.formatUnits(allowance, stakeDecimals);
      
      // Apply multiplier for display if it's a P3D token
      const allowanceDisplay = convertActualToDisplay(allowanceFormatted, stakeDecimals, stakeTokenAddress);
      setCurrentAllowance(allowanceDisplay);
      
      console.log('🔍 Current allowance:', {
        allowance: allowance.toString(),
        allowanceFormatted,
        allowanceDisplay,
        stakeTokenAddress
      });
    } catch (error) {
      console.error('Error getting current allowance:', error);
      setCurrentAllowance('0');
    }
  }, [provider, account, claim.bridgeAddress, stakeInfo, convertActualToDisplay]);

  useEffect(() => {
    if (claim && provider && account) {
      if (stakeInfo) {
      calculateRequiredStake();
        getUserStakeTokenBalance();
        getCurrentAllowance();
      } else {
        console.warn('Network and stake info not available, cannot load challenge data');
        setError('Unable to load challenge information. Please check your network connection.');
      }

      // Auto-select the opposite outcome (you can only challenge with the opposite outcome)
      const currentOutcome = claim.currentOutcome || claim.current_outcome;
      const oppositeOutcome = currentOutcome === 1 ? 0 : 1; // If current is YES (1), challenge with NO (0)
      setSelectedOutcome(oppositeOutcome);
    }
  }, [claim, provider, account, stakeInfo, calculateRequiredStake, getUserStakeTokenBalance, getCurrentAllowance]);

  // Set initial stake amount only once when requiredStake is first calculated
  useEffect(() => {
    if (requiredStake && !stakeAmount) {
      setStakeAmount(requiredStake);
    }
  }, [requiredStake, stakeAmount]);

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
      setError(`Insufficient ${stakeInfo?.stakeTokenSymbol || 'stake token'} balance`);
      return;
    }

    if (!stakeInfo) {
      setError('Unable to determine stake token information');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Validate stakeInfo is available
      if (!stakeInfo || !stakeInfo.network) {
        throw new Error('Unable to determine the required network for this bridge. Please check your network configuration.');
      }

      // Check and switch network if needed
      const requiredNetwork = stakeInfo.network;
      const isCorrectNetwork = await checkNetwork(requiredNetwork);
      
      if (!isCorrectNetwork) {
        console.log('Switching to required network:', requiredNetwork.name);
        const switchSuccess = await switchToRequiredNetwork(requiredNetwork);
        if (!switchSuccess) {
          throw new Error('Failed to switch to the required network. Please switch manually and try again.');
        }
      }

      const signer = provider.getSigner();
      const contract = await createCounterstakeContract(signer, claim.bridgeAddress);
      
      // Validate stake token information
      if (!stakeInfo.stakeTokenAddress || !stakeInfo.stakeTokenSymbol) {
        throw new Error('Unable to determine the stake token for this bridge. Please check your network configuration.');
      }

      // Convert display amount to actual amount and then to Wei
      const stakeTokenAddress = stakeInfo.stakeTokenAddress;
      const stakeDecimals = stakeInfo.stakeTokenDecimals || 18;
      const actualStakeAmount = convertDisplayToActual(stakeAmount, stakeDecimals, stakeTokenAddress);
      
      console.log('🔍 Stake amount conversion for transaction:', {
        displayAmount: stakeAmount,
        actualAmount: actualStakeAmount,
        stakeDecimals,
        stakeTokenAddress,
        stakeTokenSymbol: stakeInfo.stakeTokenSymbol
      });
      
      // Ensure the actual amount is a valid decimal string
      const validActualAmount = parseFloat(actualStakeAmount).toFixed(stakeDecimals);
      const stakeAmountWei = ethers.utils.parseUnits(validActualAmount, stakeDecimals);
      
      console.log('🔍 Challenge stake conversion:', {
        displayAmount: stakeAmount,
        actualAmount: actualStakeAmount,
        stakeAmountWei: stakeAmountWei.toString(),
        stakeDecimals
      });
      
      // First, approve the bridge to spend stake tokens
      const stakeTokenAbi = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
      ];
      
      const stakeTokenContract = new ethers.Contract(stakeTokenAddress, stakeTokenAbi, signer);
      
      // Check current allowance first
      console.log(`Checking ${stakeInfo.stakeTokenSymbol} allowance...`);
      const currentAllowance = await stakeTokenContract.allowance(account, claim.bridgeAddress);
      console.log('Current allowance:', currentAllowance.toString());
      console.log('Required amount:', stakeAmountWei.toString());
      
      // Only approve if current allowance is insufficient
      if (currentAllowance.lt(stakeAmountWei)) {
        console.log(`Insufficient allowance, approving ${stakeInfo.stakeTokenSymbol} for bridge...`);
        try {
          const approveTx = await stakeTokenContract.approve(claim.bridgeAddress, stakeAmountWei);
      await approveTx.wait();
          console.log(`${stakeInfo.stakeTokenSymbol} approval successful`);
        } catch (approveError) {
          console.error(`Error approving ${stakeInfo.stakeTokenSymbol}:`, approveError);
          
          if (approveError.code === 'ACTION_REJECTED' || approveError.message?.includes('user rejected')) {
            throw new Error(`${stakeInfo.stakeTokenSymbol} approval was cancelled by user`);
          } else if (approveError.code === 'INSUFFICIENT_FUNDS') {
            throw new Error(`Insufficient funds for ${stakeInfo.stakeTokenSymbol} approval`);
          } else {
            throw new Error(`${stakeInfo.stakeTokenSymbol} approval failed: ${approveError.message}`);
          }
        }
      } else {
        console.log('Sufficient allowance already exists, skipping approval');
      }

      // Now call the challenge function using explicit function signature for overloaded function
      console.log(`Challenging claim ${actualClaimNum} with outcome ${selectedOutcome} and stake ${stakeAmount} ${stakeInfo.stakeTokenSymbol}`);
      try {
      const challengeTx = await contract.functions['challenge(uint256,uint8,uint256)'](actualClaimNum, selectedOutcome, stakeAmountWei, {
        gasLimit: 500000
      });
      
      const receipt = await challengeTx.wait();
      console.log('Challenge successful:', receipt);
      } catch (challengeError) {
        console.error('Error in challenge transaction:', challengeError);
        
        if (challengeError.code === 'ACTION_REJECTED' || challengeError.message?.includes('user rejected')) {
          throw new Error('Challenge transaction was cancelled by user');
        } else if (challengeError.code === 'INSUFFICIENT_FUNDS') {
          throw new Error('Insufficient funds for challenge transaction');
        } else if (challengeError.message?.includes('revert')) {
          throw new Error('Challenge transaction was reverted by the contract');
        } else {
          throw new Error(`Challenge transaction failed: ${challengeError.message}`);
        }
      }

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
      
      // Handle different types of errors gracefully
      let errorMessage = 'Failed to challenge claim';
      
      if (error.code === 'ACTION_REJECTED' || error.message?.includes('user rejected')) {
        errorMessage = 'Transaction was cancelled by user';
        toast.error('Transaction cancelled');
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for transaction';
        toast.error('Insufficient funds');
      } else if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection';
        toast.error('Network error');
      } else if (error.message?.includes('gas')) {
        errorMessage = 'Transaction failed due to gas issues';
        toast.error('Gas error');
      } else if (error.message?.includes('revert')) {
        errorMessage = 'Transaction was reverted by the contract';
        toast.error('Transaction reverted');
      } else {
        // For other errors, show a generic message but log the full error
        errorMessage = 'Transaction failed. Please try again';
        toast.error('Transaction failed');
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentOutcomeText = () => {
    const currentOutcome = claim.currentOutcome || claim.current_outcome;
    return currentOutcome === 1 ? 'YES' : 'NO';
  };



  const formatAmount = (amount, decimals = 18, tokenAddress = null) => {
    try {
      if (!amount) return '0';
      
      const formatted = ethers.utils.formatUnits(amount, decimals);
      const num = parseFloat(formatted);
      
      // Check if this is a P3D token and apply decimalsDisplayMultiplier
      if (tokenAddress) {
        const decimalsDisplayMultiplier = get3DPassTokenDecimalsDisplayMultiplier(tokenAddress);
        if (decimalsDisplayMultiplier) {
          // Apply the multiplier: 0.000001 * 1000000 = 1.0
          const multipliedNumber = num * decimalsDisplayMultiplier;
          console.log(`🔍 P3D multiplier applied in Challenge:`, {
            originalNumber: num,
            multiplier: decimalsDisplayMultiplier,
            result: multipliedNumber
          });
          return multipliedNumber.toFixed(6).replace(/\.?0+$/, '') || '0';
        }
      }
      
      return formatted;
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

  // If stakeInfo is not available, show error message with more details
  if (!stakeInfo) {
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
              <h2 className="text-xl font-semibold text-white">Challenge Claim</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="text-center">
              <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Configuration Error</h3>
              <p className="text-gray-300 mb-6">
                Unable to find the bridge configuration for this claim. Please check your network settings.
              </p>
              <div className="text-sm text-gray-400 mb-6 space-y-2">
                <p>Bridge Address: {claim.bridgeAddress}</p>
                <p>Claim Number: {displayClaimNum}</p>
                <p>Bridge Type: {claim.bridgeType}</p>
              </div>
              <button
                onClick={onClose}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

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
                  {formatAmount(claim.yesStake || claim.yes_stake, get3DPassTokenDecimals('0x0000000000000000000000000000000000000802') || 18, '0x0000000000000000000000000000000000000802')} P3D
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-400">NO Stakes:</span>
                <span className="text-white">
                  {formatAmount(claim.noStake || claim.no_stake, get3DPassTokenDecimals('0x0000000000000000000000000000000000000802') || 18, '0x0000000000000000000000000000000000000802')} P3D
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
              Stake Amount ({stakeInfo?.stakeTokenSymbol || 'Token'})
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
                Required minimum: {requiredStake} {stakeInfo?.stakeTokenSymbol || 'Token'}
              </div>
            )}
            {userP3DBalance && (
              <div className="mt-1 text-sm text-secondary-400">
                Your balance: {userP3DBalance} {stakeInfo?.stakeTokenSymbol || 'Token'}
              </div>
            )}
            {currentAllowance !== null && stakeAmount && (
              <div className="mt-1 text-sm">
                <span className="text-secondary-400">Current allowance: </span>
                <span className={parseFloat(currentAllowance) >= parseFloat(stakeAmount) ? 'text-success-400' : 'text-warning-400'}>
                  {currentAllowance} {stakeInfo?.stakeTokenSymbol || 'Token'}
                </span>
                {parseFloat(currentAllowance) < parseFloat(stakeAmount) && (
                  <span className="text-warning-400 ml-1">(Approval required)</span>
                )}
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
                'Challenge'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Challenge;
