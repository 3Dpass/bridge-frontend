import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { ADDRESS_ZERO } from '../config/networks';
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
import { handleTransactionError } from '../utils/error-handler';

// Get maximum allowance value (2^256 - 1)
const getMaxAllowance = () => {
  return ethers.constants.MaxUint256;
};

const Challenge = ({ claim, onChallengeSuccess, onClose }) => {
  const { account, provider, network, checkNetwork, switchToRequiredNetwork } = useWeb3();
  const { get3DPassTokenDecimalsDisplayMultiplier, getAllNetworksWithSettings } = useSettings();

  
  const [loading, setLoading] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState(null); // 0 for NO, 1 for YES
  const [requiredStake, setRequiredStake] = useState(null);
  const [userStakeTokenBalance, setUserStakeTokenBalance] = useState(null);
  const [currentAllowance, setCurrentAllowance] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Get actual claim number from the claim object (not the display number)
  // Convert BigNumber objects to strings
  const actualClaimNum = claim.actualClaimNum || claim.claim_num || claim.debug_claim_num;
  const actualClaimNumString = ethers.BigNumber.isBigNumber(actualClaimNum) ? actualClaimNum.toString() : String(actualClaimNum || 'Unknown');
  
  // For display, use the display number that matches what the user sees
  // Ensure it's converted to string to avoid React rendering issues
  const displayClaimNum = claim.claimNum ? 
    (ethers.BigNumber.isBigNumber(claim.claimNum) ? claim.claimNum.toString() : String(claim.claimNum)) : 
    'Unknown';

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
  
  // Check if stake token is native (zero address) - no approval needed
  const isNativeStakeToken = useCallback(() => {
    if (!stakeInfo?.stakeTokenAddress) return false;
    return stakeInfo.stakeTokenAddress.toLowerCase() === ADDRESS_ZERO.toLowerCase();
  }, [stakeInfo?.stakeTokenAddress]);
  
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
      toast.error('Failed to calculate required stake');
    }
  }, [claim, provider, stakeInfo, convertActualToDisplay]);

  const getUserStakeTokenBalance = useCallback(async () => {
    try {
      if (!provider || !account || !stakeInfo) return;

      const stakeTokenAddress = stakeInfo.stakeTokenAddress;
      const stakeDecimals = stakeInfo.stakeTokenDecimals || 18;
      let balance;

      // Handle native tokens (zero address) differently
      if (isNativeStakeToken()) {
        console.log('🔍 Getting native token balance for account:', account);
        balance = await provider.getBalance(account);
        console.log('🔍 Native token balance (Wei):', balance.toString());
      } else {
        // Handle ERC20 tokens
        const stakeTokenAbi = [
          "function balanceOf(address owner) view returns (uint256)",
          "function transfer(address to, uint256 amount) returns (bool)",
          "function transferFrom(address from, address to, uint256 amount) returns (bool)",
          "function approve(address spender, uint256 amount) returns (bool)"
        ];
        
        const stakeTokenContract = new ethers.Contract(stakeTokenAddress, stakeTokenAbi, provider);
        balance = await stakeTokenContract.balanceOf(account);
        console.log('🔍 ERC20 token balance (Wei):', balance.toString());
      }
      
      // Format balance using decimals from bridge settings
      const balanceFormatted = ethers.utils.formatUnits(balance, stakeDecimals);
      
      // Apply multiplier for display if it's a P3D token
      const balanceDisplay = convertActualToDisplay(balanceFormatted, stakeDecimals, stakeTokenAddress);
      console.log('🔍 Final balance display:', {
        balanceFormatted,
        balanceDisplay,
        isNativeToken: isNativeStakeToken(),
        stakeTokenSymbol: stakeInfo.stakeTokenSymbol
      });
      setUserStakeTokenBalance(balanceDisplay);
    } catch (error) {
      console.error('Error getting stake token balance:', error);
      toast.error('Failed to get stake token balance');
    }
  }, [provider, account, stakeInfo, convertActualToDisplay, isNativeStakeToken]);

  const getCurrentAllowance = useCallback(async () => {
    try {
      if (!provider || !account || !claim.bridgeAddress || !stakeInfo) return;

      // Skip allowance check for native tokens (zero address)
      if (isNativeStakeToken()) {
        console.log('🔍 Native stake token detected, skipping allowance check');
        setCurrentAllowance('N/A'); // Not applicable for native tokens
        return;
      }

      const stakeTokenAddress = stakeInfo.stakeTokenAddress;
      const stakeTokenAbi = [
        "function allowance(address owner, address spender) view returns (uint256)"
      ];
      
      const stakeTokenContract = new ethers.Contract(stakeTokenAddress, stakeTokenAbi, provider);
      const allowance = await stakeTokenContract.allowance(account, claim.bridgeAddress);
      
      // Check if allowance is at maximum value and display "Max" instead
      const maxAllowance = getMaxAllowance();
      const isMaxAllowance = allowance.eq(maxAllowance);
      
      // Also check for very large numbers that might be close to MaxUint256
      const isVeryLargeNumber = allowance.gt(ethers.utils.parseUnits('1000000000', 18)); // 1 billion tokens
      
      console.log('🔍 Allowance comparison:', {
        allowance: allowance.toString(),
        maxAllowance: maxAllowance.toString(),
        isMaxAllowance,
        isVeryLargeNumber,
        allowanceHex: allowance.toHexString(),
        maxAllowanceHex: maxAllowance.toHexString()
      });
      
      if (isMaxAllowance || isVeryLargeNumber) {
        console.log('🔍 Setting allowance to Max (detected as maximum or very large)');
        setCurrentAllowance('Max');
      } else {
        // Use decimals from bridge settings
        const stakeDecimals = stakeInfo.stakeTokenDecimals || 18;
        const allowanceFormatted = ethers.utils.formatUnits(allowance, stakeDecimals);
        
        // Apply multiplier for display if it's a P3D token
        const allowanceDisplay = convertActualToDisplay(allowanceFormatted, stakeDecimals, stakeTokenAddress);
        console.log('🔍 Setting allowance to calculated value:', allowanceDisplay);
        setCurrentAllowance(allowanceDisplay);
      }
    } catch (error) {
      console.error('Error getting current allowance:', error);
      toast.error('Failed to get current allowance');
      setCurrentAllowance('0');
    }
  }, [provider, account, claim.bridgeAddress, stakeInfo, convertActualToDisplay, isNativeStakeToken]);

  useEffect(() => {
    if (claim && provider && account) {
      if (stakeInfo) {
      calculateRequiredStake();
        getUserStakeTokenBalance();
        getCurrentAllowance();
      } else {
        console.warn('Network and stake info not available, cannot load challenge data');
        toast.error('Unable to load challenge information. Please check your network connection.');
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
      toast.error('Please select an outcome to challenge');
      return;
    }

    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      toast.error('Please enter a valid stake amount');
      return;
    }

    if (userStakeTokenBalance && parseFloat(stakeAmount) > parseFloat(userStakeTokenBalance)) {
      toast.error(`Insufficient ${stakeInfo?.stakeTokenSymbol || 'stake token'} balance`);
      return;
    }

    if (!stakeInfo) {
      toast.error('Unable to determine stake token information');
      return;
    }

    setLoading(true);

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
        stakeDecimals,
        isNativeToken: isNativeStakeToken(),
        stakeTokenAddress: stakeTokenAddress
      });
      
      // Skip approval for native tokens (zero address)
      if (!isNativeStakeToken()) {
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
        
        // Only approve if current allowance is insufficient and not at maximum
        if (!currentAllowance.eq(getMaxAllowance()) && currentAllowance.lt(stakeAmountWei)) {
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
      } else {
        console.log('Native stake token detected, skipping approval step');
      }

      // Now call the challenge function using explicit function signature for overloaded function
      console.log(`Challenging claim ${actualClaimNumString} with outcome ${selectedOutcome} and stake ${stakeAmount} ${stakeInfo.stakeTokenSymbol}`);
      
      // Prepare transaction options
      const txOptions = {
        gasLimit: 500000
      };
      
      // Add value for native tokens (zero address)
      if (isNativeStakeToken()) {
        txOptions.value = stakeAmountWei;
        console.log('🔍 Native token detected, adding value to transaction:', {
          value: stakeAmountWei.toString(),
          valueInEth: ethers.utils.formatEther(stakeAmountWei)
        });
      } else {
        txOptions.value = 0; // Explicitly set value to 0 for ERC20 tokens
        console.log('🔍 ERC20 token detected, setting value to 0');
      }
      
      try {
      // Convert actualClaimNum back to BigNumber for the contract call
      const actualClaimNumBigNumber = ethers.BigNumber.isBigNumber(actualClaimNum) ? actualClaimNum : ethers.BigNumber.from(actualClaimNumString);
      const challengeTx = await contract.functions['challenge(uint256,uint8,uint256)'](actualClaimNumBigNumber, selectedOutcome, stakeAmountWei, txOptions);
      
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
        onChallengeSuccess(actualClaimNumString);
      }
      
      onClose();
    } catch (error) {
      handleTransactionError(error, {
        messagePrefix: 'Failed to challenge: '
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle revoke allowance
  const handleRevokeAllowance = async () => {
    setIsRevoking(true);
    
    try {
      console.log('🔄 Starting allowance revocation...');
      
      if (!stakeInfo) {
        throw new Error('Unable to determine stake token information');
      }

      // Skip revocation for native tokens (zero address)
      if (isNativeStakeToken()) {
        console.log('🔍 Native stake token detected, skipping allowance revocation');
        toast.info('Native tokens do not require allowance management');
        return;
      }

      const signer = provider.getSigner();
      const stakeTokenAddress = stakeInfo.stakeTokenAddress;
      const stakeTokenAbi = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
      ];
      
      const stakeTokenContract = new ethers.Contract(stakeTokenAddress, stakeTokenAbi, signer);
      
      console.log('🔐 Revoking allowance (setting to 0)...');
      const revokeTx = await stakeTokenContract.approve(claim.bridgeAddress, 0, { 
        gasLimit: 100000 
      });
      
      console.log('⏳ Waiting for revocation transaction confirmation...');
      const receipt = await revokeTx.wait();
      
      console.log('✅ Allowance revoked successfully:', receipt.transactionHash);
      
      // Refresh allowance display
      try {
        await getCurrentAllowance();
      } catch (e) {
        console.warn('⚠️ Could not refresh allowance after revocation:', e);
      }
      
      // Show success notification
      toast.success(
        <div>
          <h3 className="text-success-400 font-medium">Allowance Revoked</h3>
          <p className="text-success-300 text-sm mt-1">
            The bridge contract can no longer spend your {stakeInfo.stakeTokenSymbol} tokens.
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
      handleTransactionError(error, {
        messagePrefix: 'Failed to revoke allowance: '
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const getCurrentOutcomeText = () => {
    const currentOutcome = claim.currentOutcome || claim.current_outcome;
    return currentOutcome === 1 ? 'YES' : 'NO';
  };



  const formatAmount = (amount, decimals = 18, tokenAddress = null) => {
    try {
      if (!amount) return '0';
      
      // Convert BigNumber to string if needed
      const amountString = ethers.BigNumber.isBigNumber(amount) ? amount.toString() : String(amount);
      
      const formatted = ethers.utils.formatUnits(amountString, decimals);
      const num = parseFloat(formatted);
      
      // Check if this is a P3D token and apply decimalsDisplayMultiplier
      if (tokenAddress) {
        const decimalsDisplayMultiplier = get3DPassTokenDecimalsDisplayMultiplier(tokenAddress);
        if (decimalsDisplayMultiplier) {
          // Apply the multiplier: 0.000001 * 1000000 = 1.0
          const multipliedNumber = num * decimalsDisplayMultiplier;
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
                  {formatAmount(claim.yesStake || claim.yes_stake, stakeInfo?.stakeTokenDecimals || 18, stakeInfo?.stakeTokenAddress)} {stakeInfo?.stakeTokenSymbol || 'Token'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-400">NO Stakes:</span>
                <span className="text-white">
                  {formatAmount(claim.noStake || claim.no_stake, stakeInfo?.stakeTokenDecimals || 18, stakeInfo?.stakeTokenAddress)} {stakeInfo?.stakeTokenSymbol || 'Token'}
                </span>
              </div>
            </div>
          </div>

          {/* Challenge Outcome Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Outcome</h3>
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
            {userStakeTokenBalance && (
              <div className="mt-1 text-sm text-secondary-400">
                Your balance: {userStakeTokenBalance} {stakeInfo?.stakeTokenSymbol || 'Token'}
              </div>
            )}
            {currentAllowance !== null && stakeAmount && !isNativeStakeToken() && (
              <div className="mt-1 text-sm">
                <span className="text-secondary-400">Current allowance: </span>
                <span className={currentAllowance === 'Max' || parseFloat(currentAllowance) >= parseFloat(stakeAmount) ? 'text-success-400' : 'text-warning-400'}>
                  {currentAllowance} {stakeInfo?.stakeTokenSymbol || 'Token'}
                </span>
                {currentAllowance !== 'Max' && parseFloat(currentAllowance) < parseFloat(stakeAmount) && (
                  <span className="text-warning-400 ml-1">(Approval required)</span>
                )}
                {currentAllowance === 'Max' && (
                  <span className="text-success-400 ml-1">(Maximum allowance set)</span>
                )}
              </div>
            )}
          </div>

          {/* Revoke Allowance Button - Show if there's any existing allowance and not native token */}
          {currentAllowance !== null && currentAllowance !== '0' && !isNativeStakeToken() && (
            <div className="mb-6">
              <button
                onClick={handleRevokeAllowance}
                disabled={isRevoking}
                className="w-full btn-secondary py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isRevoking ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Revoking Allowance...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Revoke Allowance</span>
                  </>
                )}
              </button>
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
