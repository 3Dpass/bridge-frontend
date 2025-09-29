import { ethers } from 'ethers';

/**
 * Aggregate claims and transfers with fraud detection
 * 
 * CORRECT FLOW LOGIC:
 * 1. Import (NewRepatriation) 3DPass → Export (Claim) Ethereum
 *    - NewRepatriation event from Import bridge on 3DPass
 *    - Should match Export claim on Ethereum
 *    - Data field must match for legitimacy
 * 
 * 2. Export (NewExpatriation) Ethereum → Import (Claim) 3DPass
 *    - NewExpatriation event from Export bridge on Ethereum
 *    - Should match Import claim on 3DPass
 *    - Data field must match for legitimacy
 * 
 * @param {Array} claims - Array of claims from fetchClaimsFromAllNetworks
 * @param {Array} transfers - Array of transfers from fetchLastTransfers
 * @returns {Object} Aggregated data with fraud detection
 */
export const aggregateClaimsAndTransfers = (claims, transfers) => {
  console.log('🔍 ===== AGGREGATION FUNCTION CALLED =====');
  console.log('🔍 aggregateClaimsAndTransfers: Starting aggregation');
  console.log(`🔍 Claims count: ${claims.length}, Transfers count: ${transfers.length}`);
  
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

  // Helper function to normalize data for comparison
  const normalizeData = (data) => {
    if (!data) return '';
    return data.toString().toLowerCase().trim();
  };

  // Helper function to normalize amount for comparison
  const normalizeAmount = (amount) => {
    if (!amount) return '0';
    return amount.toString();
  };

  // Helper function to check if amounts match using BigNumber comparison
  const amountsMatchBigNumber = (claimAmount, transferAmount) => {
    if (!claimAmount || !transferAmount) return false;
    
    try {
      // Convert both to BigNumber for proper comparison
      const claimBN = ethers.BigNumber.from(claimAmount.toString());
      const transferBN = ethers.BigNumber.from(transferAmount.toString());
      
      return claimBN.eq(transferBN);
    } catch (error) {
      console.warn('Error comparing amounts as BigNumbers:', error);
      // Fallback to string comparison
      return normalizeAmount(claimAmount) === normalizeAmount(transferAmount);
    }
  };

  // Helper function to check if data matches
  const dataMatches = (claimData, transferData) => {
    const normalizedClaimData = normalizeData(claimData);
    const normalizedTransferData = normalizeData(transferData);
    
    console.log(`🔍 Data matching check:`, {
      claimDataRaw: claimData,
      transferDataRaw: transferData,
      normalizedClaimData,
      normalizedTransferData,
      exactMatch: normalizedClaimData === normalizedTransferData
    });
    
    // Don't match if both data fields are empty or default values
    if ((!normalizedClaimData || normalizedClaimData === '' || normalizedClaimData === '0x') && 
        (!normalizedTransferData || normalizedTransferData === '' || normalizedTransferData === '0x')) {
      console.log(`🔍 Both data fields are empty/default - not matching`);
      return false;
    }
    
    // Check for exact match
    if (normalizedClaimData === normalizedTransferData) {
      console.log(`🔍 Data exact match found!`);
      return true;
    }
    
    // Check for partial match (in case of encoding differences)
    if (normalizedClaimData && normalizedTransferData) {
      // Remove common prefixes/suffixes that might differ
      const cleanClaimData = normalizedClaimData.replace(/^0x/, '').replace(/^0+/, '');
      const cleanTransferData = normalizedTransferData.replace(/^0x/, '').replace(/^0+/, '');
      
      console.log(`🔍 Clean data comparison:`, {
        cleanClaimData,
        cleanTransferData,
        cleanMatch: cleanClaimData === cleanTransferData
      });
      
      if (cleanClaimData === cleanTransferData) {
        return true;
      }
      
      // Check if one contains the other (for cases where data might be truncated)
      if (cleanClaimData.includes(cleanTransferData) || cleanTransferData.includes(cleanClaimData)) {
        return true;
      }
    }
    
    return false;
  };


  // Helper function to check if addresses match
  const addressesMatch = (claimRecipient, transferRecipient) => {
    if (!claimRecipient || !transferRecipient) return false;
    return claimRecipient.toLowerCase() === transferRecipient.toLowerCase();
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
      withdrawn: claim.withdrawn
    });

    console.log(`🔍 Available transfers for matching:`, transfers.map(t => ({
      eventType: t.eventType,
      fromNetwork: t.fromNetwork,
      toNetwork: t.toNetwork,
      senderAddress: t.senderAddress,
      amount: t.amount?.toString(),
      data: t.data,
      matched: t.matched
    })));

    let matchingTransfer = null;
    let matchReason = '';

    // Find matching transfer based on the correct flow:
    // Import (NewRepatriation) 3DPass → Export (Claim) Ethereum
    // Export (NewExpatriation) Ethereum → Import (Claim) 3DPass
    for (const transfer of transfers) {
      // Skip if already matched
      if (transfer.matched) continue;

      // Determine the expected flow based on claim type
      let isCorrectFlow = false;
      let flowDescription = '';
      
      if (claim.bridgeType === 'export') {
        // Export claim should match NewRepatriation event (from Import bridge)
        // Flow: Import (NewRepatriation) 3DPass → Export (Claim) Ethereum
        // The transfer should be from the foreign network to the home network
        isCorrectFlow = (
          transfer.eventType === 'NewRepatriation' &&
          transfer.fromNetwork === claim.foreignNetwork &&
          transfer.toNetwork === claim.homeNetwork
        );
        flowDescription = `Export claim (${claim.homeNetwork}) should match NewRepatriation from ${claim.foreignNetwork} to ${claim.homeNetwork}`;
      } else if (claim.bridgeType === 'import' || claim.bridgeType === 'import_wrapper') {
        // Import claim should match NewExpatriation event (from Export bridge)
        // Flow: Export (NewExpatriation) Ethereum → Import (Claim) 3DPass
        // The transfer should be from the home network to the foreign network
        isCorrectFlow = (
          transfer.eventType === 'NewExpatriation' &&
          transfer.fromNetwork === claim.homeNetwork &&
          transfer.toNetwork === claim.foreignNetwork
        );
        flowDescription = `Import claim (${claim.foreignNetwork}) should match NewExpatriation from ${claim.homeNetwork} to ${claim.foreignNetwork}`;
      }

      console.log(`🔍 Flow check for transfer ${transfer.transactionHash}:`, {
        claimBridgeType: claim.bridgeType,
        transferEventType: transfer.eventType,
        transferFromNetwork: transfer.fromNetwork,
        transferToNetwork: transfer.toNetwork,
        claimForeignNetwork: claim.foreignNetwork,
        claimHomeNetwork: claim.homeNetwork,
        isCorrectFlow,
        flowDescription
      });

      if (!isCorrectFlow) {
        console.log(`🔍 Skipping transfer ${transfer.transactionHash} - incorrect flow`);
        continue;
      }

      // Check data match (this is the most important criteria)
      const dataMatch = dataMatches(claim.data, transfer.data);
      
      // Check amount match using BigNumber comparison
      const amountMatch = amountsMatchBigNumber(claim.amount, transfer.amount);
      
      // Check address match (claim recipient should match transfer sender)
      const addressMatch = addressesMatch(claim.recipientAddress, transfer.senderAddress);

      console.log(`🔍 ===== CHECKING TRANSFER MATCH =====`);
      console.log(`🔍 Transfer Details:`, {
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
        timestamp: transfer.timestamp
      });
      
      console.log(`🔍 Match Analysis:`, {
        claimType: claim.bridgeType,
        transferEventType: transfer.eventType,
        isCorrectFlow,
        flowDescription,
        dataMatch,
        amountMatch,
        addressMatch,
        claimAmount: claim.amount?.toString(),
        transferAmount: transfer.amount?.toString(),
        claimData: claim.data?.toString(),
        transferData: transfer.data?.toString(),
        claimRecipient: claim.recipientAddress,
        transferSender: transfer.senderAddress,
        // Raw data for debugging
        claimDataRaw: claim.data,
        transferDataRaw: transfer.data,
        claimDataType: typeof claim.data,
        transferDataType: typeof transfer.data,
        claimDataLength: claim.data?.length,
        transferDataLength: transfer.data?.length,
        // BigNumber comparison details
        claimAmountBN: claim.amount ? ethers.BigNumber.from(claim.amount.toString()).toString() : 'null',
        transferAmountBN: transfer.amount ? ethers.BigNumber.from(transfer.amount.toString()).toString() : 'null'
      });

      // Determine if this is a match
      if (dataMatch && amountMatch && addressMatch) {
        matchingTransfer = transfer;
        matchReason = 'exact_match';
        break;
      } else if (dataMatch && amountMatch) {
        matchingTransfer = transfer;
        matchReason = 'data_amount_match';
        break;
      } else if (dataMatch && addressMatch) {
        matchingTransfer = transfer;
        matchReason = 'data_address_match';
        break;
      } else if (dataMatch) {
        // Data match is the most critical - if data matches, it's likely the same transfer
        matchingTransfer = transfer;
        matchReason = 'data_match_only';
        break;
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

      // Create completed transfer entry
      const completedTransfer = {
        ...claim,
        transfer: matchingTransfer,
        matchReason,
        status: 'completed',
        isFraudulent: false
      };

      result.completedTransfers.push(completedTransfer);
      result.stats.completedTransfers++;

      console.log(`✅ Found matching transfer for claim ${claim.claimNum}:`, {
        matchReason,
        transferEventType: matchingTransfer.eventType,
        transferBlockNumber: matchingTransfer.blockNumber,
        transferTransactionHash: matchingTransfer.transactionHash
      });
    } else {
      // No matching transfer found - suspicious claim
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

      console.log(`🔍 ===== NO MATCH FOUND - SUSPICIOUS CLAIM =====`);
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
        withdrawn: claim.withdrawn
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
