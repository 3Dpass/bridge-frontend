import React, { useState } from 'react';
import { ethers } from 'ethers';
import { createCounterstakeContract } from '../utils/bridge-contracts';
import { useWeb3 } from '../contexts/Web3Context';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const WithdrawClaim = ({ claim, onWithdrawSuccess, onClose }) => {
  const { signer } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleWithdraw = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 Starting withdraw process for claim:', claim.claimNum);
      console.log('🔍 Signer address:', await signer.getAddress());
      console.log('🔍 Provider network:', (await signer.provider.getNetwork()).name);
      console.log('🔍 Provider URL:', signer.provider.connection?.url || 'Unknown');
      console.log('🔍 Current block number:', await signer.provider.getBlockNumber());
      console.log('🔍 Claim object:', {
        claimNum: claim.claimNum,
        bridgeAddress: claim.bridgeAddress,
        withdrawn: claim.withdrawn,
        finished: claim.finished,
        currentOutcome: claim.currentOutcome,
        expiryTs: claim.expiryTs
      });
      
      // Create contract instance with signer for transactions
      console.log('🔍 Creating contract for bridge address:', claim.bridgeAddress);
      const contract = await createCounterstakeContract(signer, claim.bridgeAddress);
      if (!contract) {
        throw new Error('Failed to create contract instance');
      }
      
      // Verify contract address
      console.log('🔍 Contract address:', contract.address);
      console.log('🔍 Expected bridge address:', claim.bridgeAddress);
      if (contract.address.toLowerCase() !== claim.bridgeAddress.toLowerCase()) {
        console.warn('🔍 Warning: Contract address mismatch');
        console.warn('🔍 Contract address:', contract.address);
        console.warn('🔍 Expected address:', claim.bridgeAddress);
      }
      
      // Check if contract has code
      try {
        const code = await signer.provider.getCode(contract.address);
        console.log('🔍 Contract code length:', code.length);
        if (code === '0x') {
          throw new Error('No contract code found at address');
        }
      } catch (codeErr) {
        console.error('🔍 Error checking contract code:', codeErr.message);
      }

      console.log('🔍 Contract created for bridge:', claim.bridgeAddress);
      console.log('🔍 Contract methods:', Object.keys(contract.functions || {}));
      console.log('🔍 Withdraw function exists:', typeof contract.withdraw);
      console.log('🔍 Withdrawing claim number:', claim.claimNum);
      
      // Debug available withdraw functions
      console.log('🔍 Available withdraw functions:');
      Object.keys(contract.functions || {}).forEach(func => {
        if (func.includes('withdraw')) {
          console.log('  -', func);
        }
      });
      
      // Debug contract interface
      console.log('🔍 Contract interface functions:');
      Object.keys(contract.interface.functions || {}).forEach(func => {
        if (func.includes('withdraw')) {
          console.log('  -', func);
        }
      });
      
      // Debug contract functions
      console.log('🔍 Contract functions:');
      Object.keys(contract.functions || {}).forEach(func => {
        if (func.includes('withdraw')) {
          console.log('  -', func);
        }
      });
      
      // Check if withdraw function exists
      console.log('🔍 Direct withdraw function exists:', typeof contract.withdraw);
      console.log('🔍 withdraw(uint) exists:', typeof contract['withdraw(uint)']);
      console.log('🔍 withdraw(uint256) exists:', typeof contract['withdraw(uint256)']);

      // Call the withdraw function using the correct syntax for overloaded functions
      // Ensure claim number is properly formatted as BigNumber
      const claimNum = ethers.BigNumber.from(claim.claimNum);
      console.log('🔍 Original claim number:', claim.claimNum);
      console.log('🔍 Claim number as BigNumber:', claimNum.toString());
      console.log('🔍 Claim number type:', typeof claimNum);
      console.log('🔍 Claim number hex:', claimNum.toHexString());
      
      // Validate claim number
      if (claimNum.isZero() || claimNum.isNegative()) {
        throw new Error('Invalid claim number');
      }
      
      // Check if claim exists by getting the last claim number
      try {
        const lastClaimNum = await contract.last_claim_num();
        console.log('🔍 Last claim number on contract:', lastClaimNum.toString());
        console.log('🔍 Attempting to withdraw claim number:', claimNum.toString());
        
        if (claimNum.gt(lastClaimNum)) {
          throw new Error(`Claim #${claimNum.toString()} does not exist. Last claim number is ${lastClaimNum.toString()}`);
        }
      } catch (lastClaimErr) {
        console.log('🔍 Could not get last claim number:', lastClaimErr.message);
      }
      
      // Check if claim number exists
      try {
        const lastClaimNum = await contract.last_claim_num();
        console.log('🔍 Last claim number:', lastClaimNum.toString());
        console.log('🔍 Requested claim number:', claimNum.toString());
        
        if (claimNum.gt(lastClaimNum)) {
          throw new Error(`Claim number ${claimNum.toString()} does not exist. Last claim number is ${lastClaimNum.toString()}`);
        }
      } catch (lastClaimErr) {
        console.log('🔍 Could not get last claim number:', lastClaimErr.message);
      }
      
      // Try to get claim details before withdrawing to verify it exists
      let claimDetails = null;
      try {
        claimDetails = await contract.getClaim(claimNum);
        console.log('🔍 Claim details retrieved:', claimDetails);
        console.log('🔍 Claim amount:', claimDetails.amount?.toString());
        console.log('🔍 Claim recipient:', claimDetails.recipient_address);
        console.log('🔍 Claim withdrawn:', claimDetails.withdrawn);
        console.log('🔍 Claim finished:', claimDetails.finished);
        console.log('🔍 Claim current outcome:', claimDetails.current_outcome);
        console.log('🔍 Claim expiry:', new Date(Number(claimDetails.expiry_ts) * 1000).toISOString());
        
        // Validate withdrawal conditions
        const currentTime = Math.floor(Date.now() / 1000);
        const signerAddress = await signer.getAddress();
        
        console.log('🔍 Validation checks:');
        console.log('  - Current time:', currentTime);
        console.log('  - Expiry time:', Number(claimDetails.expiry_ts));
        console.log('  - Is expired:', currentTime > Number(claimDetails.expiry_ts));
        console.log('  - Current outcome:', claimDetails.current_outcome);
        console.log('  - Is YES outcome:', claimDetails.current_outcome === 1);
        console.log('  - Is withdrawn:', claimDetails.withdrawn);
        console.log('  - Signer address:', signerAddress);
        console.log('  - Recipient address:', claimDetails.recipient_address);
        console.log('  - Is recipient:', signerAddress.toLowerCase() === claimDetails.recipient_address.toLowerCase());
        
        // Check if claim is expired
        if (currentTime <= Number(claimDetails.expiry_ts)) {
          throw new Error(`Claim is not expired yet. Expires at ${new Date(Number(claimDetails.expiry_ts) * 1000).toISOString()}`);
        }
        
        // Check if claim is already withdrawn
        if (claimDetails.withdrawn) {
          throw new Error('Claim has already been withdrawn');
        }
        
        // Check if outcome is YES (only YES outcomes can be withdrawn)
        if (claimDetails.current_outcome !== 1) {
          throw new Error(`Claim has NO outcome (${claimDetails.current_outcome}). Only YES outcomes can be withdrawn.`);
        }
        
        // Check if user is the recipient (the person who will receive the funds)
        if (signerAddress.toLowerCase() !== claimDetails.recipient_address.toLowerCase()) {
          // If not the recipient, check if they have stakes on the winning outcome
          try {
            const yesStake = await contract.stakes(claimNum, 1, signerAddress); // 1 = YES outcome
            console.log('🔍 User YES stake:', yesStake.toString());
            if (yesStake.isZero()) {
              throw new Error('You are not the recipient and have no stakes on the winning outcome');
            }
          } catch (stakeErr) {
            throw new Error('You are not the recipient and have no stakes on the winning outcome');
          }
        }
        
        console.log('🔍 All validation checks passed - claim is withdrawable');
        
        // Compare frontend claim data with contract data
        console.log('🔍 Frontend vs Contract data comparison:');
        console.log('  Frontend - withdrawn:', claim.withdrawn);
        console.log('  Contract - withdrawn:', claimDetails.withdrawn);
        console.log('  Frontend - currentOutcome:', claim.currentOutcome);
        console.log('  Contract - currentOutcome:', claimDetails.current_outcome);
        console.log('  Frontend - expiryTs:', claim.expiryTs);
        console.log('  Contract - expiryTs:', claimDetails.expiry_ts);
        
        // Check for any mismatches
        if (claim.withdrawn !== claimDetails.withdrawn) {
          console.warn('🔍 WARNING: Frontend and contract withdrawn status mismatch');
        }
        if (claim.currentOutcome !== claimDetails.current_outcome) {
          console.warn('🔍 WARNING: Frontend and contract outcome mismatch');
        }
        
      } catch (claimErr) {
        console.log('🔍 Could not retrieve claim details:', claimErr.message);
        // If we can't get claim details, we'll still try the withdrawal but log the issue
      }
      
      // Gas Fee Strategy for Withdraw
      console.log('🔍 Implementing gas fee strategy for withdraw...');
      
      // Get current gas price and fee data
      let gasPrice, maxFeePerGas, maxPriorityFeePerGas;
      try {
        const feeData = await signer.provider.getFeeData();
        gasPrice = feeData.gasPrice;
        maxFeePerGas = feeData.maxFeePerGas;
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        
        console.log('🔍 Current fee data:');
        console.log('  - Gas Price:', gasPrice ? ethers.utils.formatUnits(gasPrice, 'gwei') + ' gwei' : 'Not available');
        console.log('  - Max Fee Per Gas:', maxFeePerGas ? ethers.utils.formatUnits(maxFeePerGas, 'gwei') + ' gwei' : 'Not available');
        console.log('  - Max Priority Fee Per Gas:', maxPriorityFeePerGas ? ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei') + ' gwei' : 'Not available');
      } catch (feeErr) {
        console.log('🔍 Could not get fee data:', feeErr.message);
      }
      
      // Estimate gas for withdraw transaction
      let estimatedGas;
      try {
        estimatedGas = await contract.estimateGas.functions['withdraw(uint256)'](claimNum);
        console.log('🔍 Gas estimation successful:', estimatedGas.toString());
        
        // Add 20% buffer for safety
        const gasLimit = estimatedGas.mul(120).div(100);
        console.log('🔍 Gas limit with 20% buffer:', gasLimit.toString());
        
      } catch (gasEstimateErr) {
        console.log('🔍 Gas estimation failed:', gasEstimateErr.message);
        // Use a reasonable default gas limit for withdraw operations
        estimatedGas = ethers.BigNumber.from(300000);
        console.log('🔍 Using default gas limit:', estimatedGas.toString());
      }
      
      // Prepare transaction options with gas strategy
      const txOptions = {
        gasLimit: estimatedGas.mul(120).div(100) // 20% buffer
      };
      
      // Add gas pricing based on network support
      if (maxFeePerGas && maxPriorityFeePerGas) {
        // EIP-1559 network (Ethereum mainnet, etc.)
        txOptions.maxFeePerGas = maxFeePerGas.mul(120).div(100); // 20% higher than current
        txOptions.maxPriorityFeePerGas = maxPriorityFeePerGas.mul(120).div(100); // 20% higher than current
        console.log('🔍 Using EIP-1559 gas pricing');
        console.log('  - Max Fee Per Gas:', ethers.utils.formatUnits(txOptions.maxFeePerGas, 'gwei') + ' gwei');
        console.log('  - Max Priority Fee Per Gas:', ethers.utils.formatUnits(txOptions.maxPriorityFeePerGas, 'gwei') + ' gwei');
      } else if (gasPrice) {
        // Legacy network (3DPass, etc.)
        txOptions.gasPrice = gasPrice.mul(120).div(100); // 20% higher than current
        console.log('🔍 Using legacy gas pricing');
        console.log('  - Gas Price:', ethers.utils.formatUnits(txOptions.gasPrice, 'gwei') + ' gwei');
      } else {
        // Fallback: use network defaults
        console.log('🔍 Using network default gas pricing');
      }
      
      // Additional debugging for failing claims
      console.log('🔍 Claim details before withdraw:');
      console.log('  - Claim number:', claimNum.toString());
      console.log('  - Bridge address:', claim.bridgeAddress);
      console.log('  - Claim type:', claim.claimType);
      console.log('  - Amount:', claim.amount);
      console.log('  - Current outcome:', claim.currentOutcome);
      console.log('  - Expiry timestamp:', claim.expiryTs);
      console.log('  - Withdrawn status:', claim.withdrawn);
      console.log('  - Finished status:', claim.finished);
      
      // Check contract state one more time right before withdraw
      try {
        const finalClaimCheck = await contract.getClaim(claimNum);
        console.log('🔍 Final contract state check:');
        console.log('  - Contract withdrawn:', finalClaimCheck.withdrawn);
        console.log('  - Contract finished:', finalClaimCheck.finished);
        console.log('  - Contract current_outcome:', finalClaimCheck.current_outcome);
        console.log('  - Contract expiry_ts:', finalClaimCheck.expiry_ts.toString());
        console.log('  - Contract recipient:', finalClaimCheck.recipient_address);
        
        // Check if there's a mismatch between frontend and contract state
        if (finalClaimCheck.withdrawn !== claim.withdrawn) {
          console.warn('🔍 WARNING: Withdrawn status mismatch!');
          console.warn('  - Frontend says:', claim.withdrawn);
          console.warn('  - Contract says:', finalClaimCheck.withdrawn);
        }
        
        if (finalClaimCheck.current_outcome !== claim.currentOutcome) {
          console.warn('🔍 WARNING: Current outcome mismatch!');
          console.warn('  - Frontend says:', claim.currentOutcome);
          console.warn('  - Contract says:', finalClaimCheck.current_outcome);
        }
        
      } catch (checkErr) {
        console.log('🔍 Could not perform final contract check:', checkErr.message);
      }
      
      // Execute withdraw with gas strategy
      console.log('🔍 Executing withdraw with gas strategy...');
      console.log('🔍 Transaction options:', txOptions);
      
      let withdrawTx;
      try {
        withdrawTx = await contract.functions['withdraw(uint256)'](claimNum, txOptions);
        console.log('🔍 Withdraw transaction sent with gas strategy:', withdrawTx.hash);
      } catch (gasStrategyErr) {
        console.log('🔍 Gas strategy failed, trying fallback approach:', gasStrategyErr.message);
        
        // Fallback: try without gas options (original working approach)
        try {
          withdrawTx = await contract.functions['withdraw(uint256)'](claimNum);
          console.log('🔍 Withdraw transaction sent with fallback approach:', withdrawTx.hash);
        } catch (fallbackErr) {
          console.log('🔍 Fallback approach failed, trying with minimal gas options:', fallbackErr.message);
          
          // Final fallback: try with just gas limit
          const minimalOptions = { gasLimit: ethers.BigNumber.from(500000) };
          withdrawTx = await contract.functions['withdraw(uint256)'](claimNum, minimalOptions);
          console.log('🔍 Withdraw transaction sent with minimal gas options:', withdrawTx.hash);
        }
      }

      console.log('🔍 Withdraw transaction sent:', withdrawTx.hash);
      
      // Wait for transaction confirmation
      const receipt = await withdrawTx.wait();
      console.log('🔍 Withdraw transaction confirmed:', receipt);

      // Check for success events
      const withdrawEvent = receipt.events?.find(event => 
        event.event === 'FinishedClaim' || 
        event.event === 'WithdrawnClaim' ||
        event.event === 'ClaimWithdrawn'
      );

      if (withdrawEvent) {
        console.log('🔍 Withdraw event found:', withdrawEvent);
      }

      toast.success(
        <div>
          <h3 className="text-success-400 font-medium">Withdrawal Successful</h3>
          <p className="text-success-300 text-sm mt-1">Successfully withdrew claim #{claim.claimNum}!</p>
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
      
      // Call the success callback to refresh the claims list
      if (onWithdrawSuccess) {
        onWithdrawSuccess(claim.claimNum);
      }

    } catch (err) {
      console.error('❌ Withdraw failed:', err);
      setError(err.message);
      
      // Show user-friendly error message
      let errorMessage = 'Failed to withdraw claim';
      if (err.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas fees';
      } else if (err.message.includes('already withdrawn')) {
        errorMessage = 'Claim has already been withdrawn';
      } else if (err.message.includes('not expired')) {
        errorMessage = 'Claim has not expired yet';
      } else if (err.message.includes('not the recipient')) {
        errorMessage = 'Only the recipient can withdraw this claim';
      } else if (err.message.includes('challenging period')) {
        errorMessage = 'Claim is still in challenging period';
      } else if (err.message.includes('no such claim')) {
        errorMessage = 'Claim does not exist or is invalid';
      } else if (err.message.includes('CALL_EXCEPTION')) {
        errorMessage = 'Transaction failed - claim may not be withdrawable';
              } else if (err.message.includes('execution reverted')) {
          errorMessage = 'Transaction reverted - check claim status';
        } else if (err.message.includes('Internal JSON-RPC error')) {
          errorMessage = 'Network error - this claim may have specific constraints. Please try again or check claim details.';
          console.log('🔍 Internal JSON-RPC error details:', {
            message: err.message,
            code: err.code,
            data: err.data
          });
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getWithdrawStatus = () => {
    if (claim.withdrawn) {
      return {
        status: 'withdrawn',
        text: 'Already Withdrawn',
        color: 'text-gray-400',
        icon: <CheckCircle className="w-4 h-4" />
      };
    }
    
    // Check if the claim is expired
    const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
    const expiryTime = claim.expiryTs ? 
      (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
      0;
    const isExpired = expiryTime <= now;
    
    if (isExpired) {
      if (claim.currentOutcome === 1) {
        return {
          status: 'ready',
          text: 'Ready to Withdraw (Expired + YES Outcome)',
          color: 'text-green-400',
          icon: <CheckCircle className="w-4 h-4" />
        };
      } else {
        return {
          status: 'no-outcome',
          text: 'Cannot Withdraw (NO Outcome)',
          color: 'text-red-400',
          icon: <XCircle className="w-4 h-4" />
        };
      }
    }
    
    return {
      status: 'not-expired',
      text: 'Claim Not Expired Yet',
      color: 'text-yellow-400',
      icon: <Clock className="w-4 h-4" />
    };
  };

  const withdrawStatus = getWithdrawStatus();
  
  // Check if the claim is expired for button disabled state
  const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
  const expiryTime = claim.expiryTs ? 
    (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
    0;
  const isExpired = expiryTime <= now;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        className="bg-gray-800 rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Withdraw Claim</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Claim Information */}
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {withdrawStatus.icon}
              <span className={`text-sm font-medium ${withdrawStatus.color}`}>
                {withdrawStatus.text}
              </span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Claim #:</span>
                <span className="text-white font-mono">{claim.claimNum}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount:</span>
                <span className="text-white">
                  {claim.formattedAmount} {claim.tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stake:</span>
                <span className="text-white">
                  {claim.formattedStake} {claim.stakeTokenSymbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Sender:</span>
                <span className="text-white font-mono">
                  {claim.senderAddress?.slice(0, 6)}...{claim.senderAddress?.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Recipient:</span>
                <span className="text-white font-mono">
                  {claim.recipientAddress?.slice(0, 6)}...{claim.recipientAddress?.slice(-4)}
                </span>
              </div>
            </div>
          </div>

          {/* Status Information */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-2">Claim Status</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Current Outcome:</span>
                <span className="text-white">
                  {claim.currentOutcome === 1 ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Finished:</span>
                <span className={claim.finished ? 'text-green-400' : 'text-red-400'}>
                  {claim.finished ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Withdrawn:</span>
                <span className={claim.withdrawn ? 'text-green-400' : 'text-red-400'}>
                  {claim.withdrawn ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            
                                    <button
                          onClick={handleWithdraw}
                          disabled={loading || claim.withdrawn || !isExpired || claim.currentOutcome !== 1}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                'Withdraw'
              )}
            </button>
          </div>

          {/* Warning for non-withdrawable claims */}
          {claim.withdrawn && (
            <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                This claim has already been withdrawn.
              </p>
            </div>
          )}
          
          {!isExpired && !claim.withdrawn && (
            <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                This claim is not expired yet and cannot be withdrawn.
              </p>
            </div>
          )}
          
          {isExpired && !claim.withdrawn && claim.currentOutcome !== 1 && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm">
                This claim has a NO outcome and cannot be withdrawn. Only claims with YES outcomes can be withdrawn.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WithdrawClaim;
