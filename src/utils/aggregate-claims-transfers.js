
import { ethers } from 'ethers';

/**
 * Aggregate claims and transfers with fraud detection
 * 
 * CORRECT FLOW LOGIC:
 * 1. Import (NewRepatriation) 3DPass → Export (Claim) Ethereum
 *    - NewRepatriation event txid from Import bridge on 3DPass
 *    - Must match the txid from Export claim details or NewClaim event on Ethereum
 *   
 * 2. Export (NewExpatriation) Ethereum → Import (Claim) 3DPass
 *    - NewExpatriation event txid from Export bridge on Ethereum
 *    - Must match the txid from Import claim details or NewClaim event on 3DPass
 *  
 * 
 * @param {Array} claims - Array of claims from fetchClaimsFromAllNetworks
 * @param {Array} transfers - Array of transfers from fetchLastTransfers
 * @returns {Object} Aggregated data with fraud detection
 */
export const aggregateClaimsAndTransfers = (claims, transfers) => {
  console.log('🔍 ===== AGGREGATION FUNCTION CALLED =====');
  console.log('🔍 aggregateClaimsAndTransfers: Starting aggregation');
  console.log(`🔍 Claims count: ${claims.length}, Transfers count: ${transfers.length}`);
  
  // Helper function to check if txid matches transfer hash
  const txidMatches = (claimTxid, transferHashOrId) => {
    if (!claimTxid || !transferHashOrId) return false;
    const normalizeHash = (val) => {
      try {
        const s = String(val).toLowerCase().trim();
        // remove 0x and leading zeros for robust compare
        return s.replace(/^0x/, '').replace(/^0+/, '');
      } catch (e) {
        return '';
      }
    };
    const a = normalizeHash(claimTxid);
    const b = normalizeHash(transferHashOrId);
    return a && b && a === b;
  };

  // Helper function to check if amounts match (formats values to contract format before comparison)
  const amountsMatchBigNumber = (amount1, amount2) => {
    if (!amount1 || !amount2) return { match: false, reason: 'missing_amount' };
    try {
      // Convert both amounts to BigNumber format (contract format)
      const bn1 = ethers.BigNumber.from(amount1.toString());
      const bn2 = ethers.BigNumber.from(amount2.toString());
      
      // Compare the BigNumber values directly
      if (bn1.eq(bn2)) {
        return { match: true, reason: 'exact_match' };
      } else {
        return { 
          match: false, 
          reason: 'different_values',
          amount1: bn1.toString(),
          amount2: bn2.toString()
        };
      }
    } catch (e) {
      return { match: false, reason: 'conversion_error', error: e.message };
    }
  };

  // Helper function to check if addresses match (with format validation)
  const addressesMatch = (addr1, addr2) => {
    if (!addr1 || !addr2) return { match: false, reason: 'missing_address' };
    try {
      // Check if both addresses are the same (case-insensitive)
      const sameAddress = addr1.toLowerCase() === addr2.toLowerCase();
      
      if (!sameAddress) {
        return { match: false, reason: 'different_addresses' };
      }
      
      // Check if both addresses are EIP-55 checksummed
      const isEIP55Checksummed = (addr) => {
        // EIP-55 checksummed addresses have mixed case
        // They should not be all lowercase or all uppercase
        return addr !== addr.toLowerCase() && addr !== addr.toUpperCase();
      };
      
      const addr1IsChecksummed = isEIP55Checksummed(addr1);
      const addr2IsChecksummed = isEIP55Checksummed(addr2);
      
      if (addr1IsChecksummed && addr2IsChecksummed) {
        // Both are checksummed - exact match required
        if (addr1 === addr2) {
          return { match: true, reason: 'exact_checksummed_match' };
        } else {
          return { match: false, reason: 'checksummed_format_mismatch' };
        }
      } else if (!addr1IsChecksummed && !addr2IsChecksummed) {
        // Both are not checksummed - this is suspicious
        return { match: false, reason: 'both_non_checksummed' };
      } else {
        // One is checksummed, one is not - this is suspicious
        return { match: false, reason: 'mixed_checksum_format' };
      }
    } catch (e) {
      return { match: false, reason: 'comparison_error' };
    }
  };

  // Helper function to validate reward amounts (formats values to contract format before comparison)
  // Claim reward should not exceed transfer reward
  const validateRewardAmounts = (claimReward, transferReward) => {
    if (!claimReward && !transferReward) {
      return { match: true, reason: 'both_zero_or_missing' };
    }
    
    if (!claimReward) {
      return { match: true, reason: 'claim_reward_zero' };
    }
    
    if (!transferReward) {
      return { match: false, reason: 'transfer_reward_missing' };
    }
    
    try {
      // Convert both rewards to BigNumber format (contract format)
      const claimRewardBN = ethers.BigNumber.from(claimReward.toString());
      const transferRewardBN = ethers.BigNumber.from(transferReward.toString());
      
      // Claim reward should not be greater than transfer reward
      if (claimRewardBN.gt(transferRewardBN)) {
        return { 
          match: false, 
          reason: 'claim_reward_exceeds_transfer_reward',
          claimReward: claimRewardBN.toString(),
          transferReward: transferRewardBN.toString()
        };
      }
      
      // Check if they're equal
      if (claimRewardBN.eq(transferRewardBN)) {
        return { match: true, reason: 'rewards_equal' };
      }
      
      // Claim reward is less than transfer reward (acceptable)
      return { match: true, reason: 'claim_reward_less_than_transfer' };
    } catch (e) {
      return { match: false, reason: 'conversion_error', error: e.message };
    }
  };
  
  // Debug: Log the first transfer details
  if (transfers.length > 0) {
    console.log('🔍 First transfer being processed:', {
      eventType: transfers[0].eventType,
      senderAddress: transfers[0].senderAddress,
      recipientAddress: transfers[0].recipientAddress,
      amount: transfers[0].amount?.toString(),
      data: transfers[0].data,
      bridgeAddress: transfers[0].bridgeAddress,
      bridgeType: transfers[0].bridgeType,
      networkKey: transfers[0].networkKey,
      fromNetwork: transfers[0].fromNetwork,
      toNetwork: transfers[0].toNetwork
    });
  }

  const result = {
    // Original data
    claims: [...claims],
    transfers: [...transfers],
    
    // Aggregated data
    completedTransfers: [], // Claims with matching transfers
    suspiciousClaims: [],   // Claims without matching transfers or data mismatch
    pendingTransfers: [],   // Transfers without matching claims
    fraudDetected: false,
    
    // Statistics
    stats: {
      totalClaims: claims.length,
      totalTransfers: transfers.length,
      completedTransfers: 0,
      suspiciousClaims: 0,
      pendingTransfers: 0
    }
  };



  // Process each claim
  for (const claim of claims) {
    console.log(`🔍 ===== PROCESSING CLAIM =====`);
    console.log(`🔍 Claim Details:`, {
      claimNum: claim.claimNum,
      actualClaimNum: claim.actualClaimNum,
      senderAddress: claim.senderAddress,
      recipientAddress: claim.recipientAddress,
      amount: claim.amount?.toString(),
      amountHex: claim.amount?.toHexString?.(),
      data: claim.data,
      dataHex: claim.data?.toHexString?.(),
      bridgeType: claim.bridgeType,
      networkName: claim.networkName,
      homeNetwork: claim.homeNetwork,
      foreignNetwork: claim.foreignNetwork,
      bridgeAddress: claim.bridgeAddress,
      currentOutcome: claim.currentOutcome,
      yesStake: claim.yesStake?.toString(),
      noStake: claim.noStake?.toString(),
      expiryTs: claim.expiryTs?.toString(),
      finished: claim.finished,
      withdrawn: claim.withdrawn,
      // DEBUG: Show txid field and all available fields
      txid: claim.txid,
      txidType: typeof claim.txid,
      txidString: String(claim.txid),
      // Show all available fields that might contain transaction hash
      allFields: Object.keys(claim),
      transaction_hash: claim.transaction_hash,
      transactionHash: claim.transactionHash,
      tx_hash: claim.tx_hash,
      txHash: claim.txHash
    });

    console.log(`🔍 Available transfers for matching:`, transfers.map(t => ({
      eventType: t.eventType,
      fromNetwork: t.fromNetwork,
      toNetwork: t.toNetwork,
      senderAddress: t.senderAddress,
      amount: t.amount?.toString(),
      data: t.data,
      matched: t.matched,
      // DEBUG: Show transaction hash fields
      transactionHash: t.transactionHash,
      txid: t.txid,
      transactionHashType: typeof t.transactionHash,
      txidType: typeof t.txid
    })));

    // Log withdrawn claims specifically
    const withdrawnClaims = claims.filter(claim => claim.withdrawn === true);
    if (withdrawnClaims.length > 0) {
      console.log(`💰 WITHDRAWN CLAIMS (${withdrawnClaims.length}):`, withdrawnClaims.map(claim => ({
        claimNum: claim.claimNum,
        withdrawn: claim.withdrawn,
        finished: claim.finished,
        currentOutcome: claim.currentOutcome,
        amount: claim.amount?.toString(),
        recipientAddress: claim.recipientAddress,
        networkName: claim.networkName,
        bridgeType: claim.bridgeType,
        expiryTs: claim.expiryTs?.toString(),
        txid: claim.txid
      })));
    } else {
      console.log(`💰 WITHDRAWN CLAIMS: None found`);
    }

    let matchingTransfer = null;
    let matchReason = '';

    // Find matching transfer by txid only
    for (const transfer of transfers) {
      // Skip if already matched
      if (transfer.matched) continue;

      // Check if txid matches transfer hash - try different possible field names
      const claimTxid = claim.txid || claim.transaction_hash || claim.transactionHash || claim.tx_hash || claim.txHash;
      const txMatch1 = txidMatches(claimTxid, transfer.transactionHash);
      const txMatch2 = txidMatches(claimTxid, transfer.txid);
      const txMatch = txMatch1 || txMatch2;
      
      console.log(`🔍 Checking match for claim ${claim.claimNum} with transfer ${transfer.transactionHash}:`, {
        claimTxid: claim.txid,
        claimTransactionHash: claim.transaction_hash,
        claimTxHash: claim.tx_hash,
        resolvedClaimTxid: claimTxid,
        transferTransactionHash: transfer.transactionHash,
        transferTxid: transfer.txid,
        txMatch1: txMatch1,
        txMatch2: txMatch2,
        finalMatch: txMatch
      });
      
      if (txMatch) {
        matchingTransfer = transfer;
        matchReason = 'txid_match';
        console.log(`🔍 TXID match found for transfer ${transfer.transactionHash}`);
        break;
      }
      
      // Fallback matching when txid is not available - match by amount, addresses, reward validation, and bridge type
      if (!claimTxid && !transfer.matched) {
        const amountMatchResult = amountsMatchBigNumber(claim.amount, transfer.amount);
        const amountMatch = amountMatchResult.match;
        const senderMatchResult = addressesMatch(claim.senderAddress, transfer.senderAddress);
        const senderMatch = senderMatchResult.match;
        const recipientMatchResult = addressesMatch(claim.recipientAddress, transfer.recipientAddress);
        const recipientMatch = recipientMatchResult.match;
        const rewardValidationResult = validateRewardAmounts(claim.reward, transfer.reward);
        const rewardValid = rewardValidationResult.match;
        
        // Check if this is a valid flow (Export transfer should match Import claim, etc.)
        const isValidFlow = (
          (transfer.eventType === 'NewExpatriation' && claim.bridgeType === 'import_wrapper') ||
          (transfer.eventType === 'NewRepatriation' && claim.bridgeType === 'export')
        );
        
        if (amountMatch && senderMatch && recipientMatch && rewardValid && isValidFlow) {
          matchingTransfer = transfer;
          matchReason = 'fallback_match';
          console.log(`🔍 Fallback match found for transfer ${transfer.transactionHash} - amount, addresses, reward, and flow match`);
          break;
        }
      }
    }

    if (matchingTransfer) {
      console.log(`🔍 ===== MATCH FOUND =====`);
      console.log(`🔍 Match Reason: ${matchReason}`);
      console.log(`🔍 Claim ${claim.actualClaimNum || claim.claimNum} matched with Transfer:`, {
        claimActualClaimNum: claim.actualClaimNum,
        claimDisplayNum: claim.claimNum,
        transferEventType: matchingTransfer.eventType,
        transferTxHash: matchingTransfer.transactionHash,
        transferBlockNumber: matchingTransfer.blockNumber,
        claimAmount: claim.amount?.toString(),
        transferAmount: matchingTransfer.amount?.toString(),
        claimData: claim.data?.toString(),
        transferData: matchingTransfer.data?.toString(),
        claimRecipient: claim.recipientAddress,
        transferSender: matchingTransfer.senderAddress,
        matchReason: matchReason
      });
      
      // Mark transfer as matched
      matchingTransfer.matched = true;
      matchingTransfer.matchedClaim = claim;
      matchingTransfer.matchReason = matchReason;

      // Check for parameter mismatches even when txid matches
      // Skip sender address and data field checks as they may be acceptable to differ
      const amountMatchResult = amountsMatchBigNumber(claim.amount, matchingTransfer.amount);
      const amountMatch = amountMatchResult.match;
      const recipientMatchResult = addressesMatch(claim.recipientAddress, matchingTransfer.recipientAddress);
      const recipientMatch = recipientMatchResult.match;
      const rewardValidationResult = validateRewardAmounts(claim.reward, matchingTransfer.reward);
      const rewardValid = rewardValidationResult.match;
      
      // Check if this is a valid flow
      const isValidFlow = (
        (matchingTransfer.eventType === 'NewExpatriation' && claim.bridgeType === 'import_wrapper') ||
        (matchingTransfer.eventType === 'NewRepatriation' && claim.bridgeType === 'export')
      );

      // Determine if this is suspicious due to parameter mismatches
      // Check amount, recipient, reward validation, and flow validity
      const hasParameterMismatches = !amountMatch || !recipientMatch || !rewardValid || !isValidFlow;
      
      console.log(`🔍 Parameter validation for claim ${claim.claimNum}:`, {
        amountMatch,
        recipientMatch,
        rewardValid,
        isValidFlow,
        hasParameterMismatches,
        claimAmount: claim.amount?.toString(),
        transferAmount: matchingTransfer.amount?.toString(),
        claimReward: claim.reward?.toString(),
        transferReward: matchingTransfer.reward?.toString(),
        rewardValidationReason: rewardValidationResult.reason,
        claimRecipient: claim.recipientAddress,
        transferRecipient: matchingTransfer.recipientAddress,
        claimRecipientLower: claim.recipientAddress?.toLowerCase(),
        transferRecipientLower: matchingTransfer.recipientAddress?.toLowerCase(),
        claimBridgeType: claim.bridgeType,
        transferEventType: matchingTransfer.eventType
      });

          if (hasParameterMismatches) {
            // TXID matches but parameters don't - this is suspicious
            const suspiciousClaim = {
              ...claim,
              transfer: matchingTransfer,
              matchReason,
              status: 'suspicious',
              isFraudulent: true,
              reason: 'txid_match_but_parameter_mismatch',
              parameterMismatches: {
                amountMatch,
                amountMatchReason: amountMatchResult.reason,
                recipientMatch,
                recipientMatchReason: recipientMatchResult.reason,
                rewardValid,
                rewardValidationReason: rewardValidationResult.reason,
                isValidFlow
              }
            };

        result.suspiciousClaims.push(suspiciousClaim);
        result.stats.suspiciousClaims++;
        result.fraudDetected = true;

        console.log(`🔍 ===== SUSPICIOUS CLAIM - TXID MATCH BUT PARAMETER MISMATCH =====`);
        console.log(`🔍 Suspicious Claim Details:`, {
          claimNum: claim.claimNum,
          actualClaimNum: claim.actualClaimNum,
          matchReason,
          parameterMismatches: suspiciousClaim.parameterMismatches,
          reason: suspiciousClaim.reason
        });
      } else {
        // TXID matches and all parameters match - this is a completed transfer
        const completedTransfer = {
          ...claim,
          transfer: matchingTransfer,
          matchReason,
          status: 'completed',
          isFraudulent: false
        };

        result.completedTransfers.push(completedTransfer);
        result.stats.completedTransfers++;
      }
    } else {
      // No matching transfer found - standalone suspicious claim
      const suspiciousClaim = {
        ...claim,
        status: 'suspicious',
        isFraudulent: true,
        reason: 'no_matching_transfer',
        transfer: null
      };

      result.suspiciousClaims.push(suspiciousClaim);
      result.stats.suspiciousClaims++;
      result.fraudDetected = true;

      console.log(`🔍 ===== NO MATCH FOUND - STANDALONE SUSPICIOUS CLAIM =====`);
      console.log(`🔍 Suspicious Claim Details:`, {
        claimNum: claim.claimNum,
        actualClaimNum: claim.actualClaimNum,
        senderAddress: claim.senderAddress,
        recipientAddress: claim.recipientAddress,
        amount: claim.amount?.toString(),
        amountHex: claim.amount?.toHexString?.(),
        data: claim.data,
        dataHex: claim.data?.toHexString?.(),
        bridgeType: claim.bridgeType,
        networkName: claim.networkName,
        homeNetwork: claim.homeNetwork,
        foreignNetwork: claim.foreignNetwork,
        bridgeAddress: claim.bridgeAddress,
        currentOutcome: claim.currentOutcome,
        yesStake: claim.yesStake?.toString(),
        noStake: claim.noStake?.toString(),
        expiryTs: claim.expiryTs?.toString(),
        finished: claim.finished,
        withdrawn: claim.withdrawn,
        reason: suspiciousClaim.reason
      });
    }
  }

  // Find transfers without matching claims (pending transfers)
  console.log('🔍 Processing transfers for pending status...');
  for (const transfer of transfers) {
    console.log(`🔍 Checking transfer ${transfer.transactionHash}:`, {
      eventType: transfer.eventType,
      matched: transfer.matched,
      senderAddress: transfer.senderAddress,
      amount: transfer.amount?.toString(),
      data: transfer.data
    });
    
    if (!transfer.matched) {
      const pendingTransfer = {
        ...transfer,
        status: 'pending',
        isFraudulent: false,
        reason: 'no_matching_claim',
        claim: null,
        // Add claim creation suggestion
        suggestedClaim: {
          recipientAddress: transfer.senderAddress, // Transfer sender becomes claim recipient
          amount: transfer.amount,
          data: transfer.data,
          bridgeAddress: transfer.bridgeAddress,
          bridgeType: transfer.bridgeType,
          networkKey: transfer.networkKey,
          networkName: transfer.networkName
        }
      };

      result.pendingTransfers.push(pendingTransfer);
      result.stats.pendingTransfers++;

      console.log(`🔍 ===== PENDING TRANSFER (NO MATCHING CLAIM) =====`);
      console.log(`🔍 Pending Transfer Details:`, {
        eventType: transfer.eventType,
        senderAddress: transfer.senderAddress,
        recipientAddress: transfer.recipientAddress,
        amount: transfer.amount?.toString(),
        amountHex: transfer.amount?.toHexString?.(),
        data: transfer.data,
        dataHex: transfer.data?.toHexString?.(),
        fromNetwork: transfer.fromNetwork,
        toNetwork: transfer.toNetwork,
        bridgeAddress: transfer.bridgeAddress,
        bridgeType: transfer.bridgeType,
        transactionHash: transfer.transactionHash,
        blockNumber: transfer.blockNumber,
        timestamp: transfer.timestamp,
        networkKey: transfer.networkKey,
        networkName: transfer.networkName
      });
    }
  }

  // Sort results
  result.completedTransfers.sort((a, b) => b.blockNumber - a.blockNumber);
  result.suspiciousClaims.sort((a, b) => b.blockNumber - a.blockNumber);
  result.pendingTransfers.sort((a, b) => b.blockNumber - a.blockNumber);

  console.log(`🔍 ===== AGGREGATION SUMMARY =====`);
  console.log(`✅ Aggregation complete:`, {
    completedTransfers: result.stats.completedTransfers,
    suspiciousClaims: result.stats.suspiciousClaims,
    pendingTransfers: result.stats.pendingTransfers,
    fraudDetected: result.fraudDetected
  });

  console.log(`🔍 Flow validation summary:`, {
    correctFlow: 'Import (NewRepatriation) 3DPass → Export (Claim) Ethereum',
    correctFlow2: 'Export (NewExpatriation) Ethereum → Import (Claim) 3DPass',
    matchingLogic: 'Data field must match between transfer and claim for legitimacy'
  });
  
  console.log(`🔍 ===== DETAILED RESULTS =====`);
  console.log(`🔍 Completed Transfers (${result.completedTransfers.length}):`);
  result.completedTransfers.forEach((ct, index) => {
    console.log(`🔍 Completed Transfer #${index + 1}:`, {
      claimNum: ct.actualClaimNum || ct.claimNum,
      amount: ct.amount?.toString(),
      data: ct.data?.toString(),
      matchReason: ct.matchReason,
      transferTxHash: ct.transfer?.transactionHash,
      transferEventType: ct.transfer?.eventType,
      transferSender: ct.transfer?.senderAddress,
      transferRecipient: ct.transfer?.recipientAddress,
      claimRecipient: ct.recipientAddress,
      claimSender: ct.senderAddress,
      // Additional debugging
      claimBridgeType: ct.bridgeType,
      claimNetwork: ct.networkName,
      transferBridgeType: ct.transfer?.bridgeType,
      transferNetwork: ct.transfer?.networkKey,
      transferFromNetwork: ct.transfer?.fromNetwork,
      transferToNetwork: ct.transfer?.toNetwork
    });
  });
  
  console.log(`🔍 Suspicious Claims (${result.suspiciousClaims.length}):`, 
    result.suspiciousClaims.map(sc => ({
      claimNum: sc.actualClaimNum || sc.claimNum,
      amount: sc.amount?.toString(),
      data: sc.data?.toString(),
      reason: sc.reason
    }))
  );
  
  console.log(`🔍 Pending Transfers (${result.pendingTransfers.length}):`, 
    result.pendingTransfers.map(pt => ({
      eventType: pt.eventType,
      amount: pt.amount?.toString(),
      data: pt.data?.toString(),
      txHash: pt.transactionHash,
      reason: pt.reason
    }))
  );

  console.log('🔍 ===== AGGREGATION FUNCTION COMPLETED =====');
  console.log('🔍 Returning result:', {
    completedTransfers: result.completedTransfers.length,
    pendingTransfers: result.pendingTransfers.length,
    suspiciousClaims: result.suspiciousClaims.length
  });

  // Log final withdrawn claims summary
  const finalWithdrawnClaims = result.completedTransfers.filter(claim => claim.withdrawn === true);
  if (finalWithdrawnClaims.length > 0) {
    console.log(`💰 FINAL WITHDRAWN CLAIMS SUMMARY (${finalWithdrawnClaims.length}):`, finalWithdrawnClaims.map(claim => ({
      claimNum: claim.claimNum,
      withdrawn: claim.withdrawn,
      finished: claim.finished,
      currentOutcome: claim.currentOutcome,
      amount: claim.amount?.toString(),
      recipientAddress: claim.recipientAddress,
      networkName: claim.networkName,
      bridgeType: claim.bridgeType,
      hasTransfer: !!claim.transfer,
      transferTxHash: claim.transfer?.transactionHash
    })));
  } else {
    console.log(`💰 FINAL WITHDRAWN CLAIMS SUMMARY: None found`);
  }

  return result;
};

/**
 * Validate the flow logic for a given claim and transfer pair
 * @param {Object} claim - Claim object
 * @param {Object} transfer - Transfer object
 * @returns {Object} Validation result with details
 */
export const validateFlowLogic = (claim, transfer) => {
  const result = {
    isValid: false,
    reason: '',
    flowType: '',
    expectedEventType: '',
    actualEventType: transfer.eventType,
    expectedFromNetwork: '',
    actualFromNetwork: transfer.fromNetwork,
    expectedToNetwork: '',
    actualToNetwork: transfer.toNetwork
  };

  if (claim.bridgeType === 'export') {
    // Export claim should match NewRepatriation event
    result.flowType = 'Export Claim → NewRepatriation Event';
    result.expectedEventType = 'NewRepatriation';
    result.expectedFromNetwork = claim.foreignNetwork;
    result.expectedToNetwork = claim.homeNetwork;
    
    if (transfer.eventType === 'NewRepatriation' &&
        transfer.fromNetwork === claim.foreignNetwork &&
        transfer.toNetwork === claim.homeNetwork) {
      result.isValid = true;
      result.reason = 'Correct flow: Export claim matches NewRepatriation event';
    } else {
      result.reason = 'Incorrect flow: Export claim should match NewRepatriation event';
    }
  } else if (claim.bridgeType === 'import' || claim.bridgeType === 'import_wrapper') {
    // Import claim should match NewExpatriation event
    result.flowType = 'Import Claim → NewExpatriation Event';
    result.expectedEventType = 'NewExpatriation';
    result.expectedFromNetwork = claim.homeNetwork;
    result.expectedToNetwork = claim.foreignNetwork;
    
    if (transfer.eventType === 'NewExpatriation' &&
        transfer.fromNetwork === claim.homeNetwork &&
        transfer.toNetwork === claim.foreignNetwork) {
      result.isValid = true;
      result.reason = 'Correct flow: Import claim matches NewExpatriation event';
    } else {
      result.reason = 'Incorrect flow: Import claim should match NewExpatriation event';
    }
  } else {
    result.reason = 'Unknown claim bridge type';
  }

  return result;
};
