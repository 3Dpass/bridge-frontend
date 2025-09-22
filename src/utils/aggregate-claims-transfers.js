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
  console.log('🔍 aggregateClaimsAndTransfers: Starting aggregation');
  console.log(`🔍 Claims count: ${claims.length}, Transfers count: ${transfers.length}`);

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

  // Helper function to check if data matches
  const dataMatches = (claimData, transferData) => {
    const normalizedClaimData = normalizeData(claimData);
    const normalizedTransferData = normalizeData(transferData);
    
    // Check for exact match
    if (normalizedClaimData === normalizedTransferData) {
      return true;
    }
    
    // Check for partial match (in case of encoding differences)
    if (normalizedClaimData && normalizedTransferData) {
      // Remove common prefixes/suffixes that might differ
      const cleanClaimData = normalizedClaimData.replace(/^0x/, '').replace(/^0+/, '');
      const cleanTransferData = normalizedTransferData.replace(/^0x/, '').replace(/^0+/, '');
      
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

  // Helper function to check if amounts match
  const amountsMatch = (claimAmount, transferAmount) => {
    const normalizedClaimAmount = normalizeAmount(claimAmount);
    const normalizedTransferAmount = normalizeAmount(transferAmount);
    
    return normalizedClaimAmount === normalizedTransferAmount;
  };

  // Helper function to check if addresses match
  const addressesMatch = (claimRecipient, transferRecipient) => {
    if (!claimRecipient || !transferRecipient) return false;
    return claimRecipient.toLowerCase() === transferRecipient.toLowerCase();
  };

  // Process each claim
  for (const claim of claims) {
    console.log(`🔍 Processing claim:`, {
      claimNum: claim.claimNum,
      actualClaimNum: claim.actualClaimNum,
      senderAddress: claim.senderAddress,
      recipientAddress: claim.recipientAddress,
      amount: claim.amount?.toString(),
      data: claim.data,
      bridgeType: claim.bridgeType,
      networkName: claim.networkName,
      homeNetwork: claim.homeNetwork,
      foreignNetwork: claim.foreignNetwork
    });

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

      if (!isCorrectFlow) continue;

      // Check data match (this is the most important criteria)
      const dataMatch = dataMatches(claim.data, transfer.data);
      
      // Check amount match
      const amountMatch = amountsMatch(claim.amount, transfer.amount);
      
      // Check address match (claim recipient should match transfer sender)
      const addressMatch = addressesMatch(claim.recipientAddress, transfer.senderAddress);

      console.log(`🔍 Checking transfer match:`, {
        claimType: claim.bridgeType,
        transferEventType: transfer.eventType,
        transferSender: transfer.senderAddress,
        transferAmount: transfer.amount?.toString(),
        transferData: transfer.data,
        transferFromNetwork: transfer.fromNetwork,
        transferToNetwork: transfer.toNetwork,
        claimHomeNetwork: claim.homeNetwork,
        claimForeignNetwork: claim.foreignNetwork,
        isCorrectFlow,
        flowDescription,
        dataMatch,
        amountMatch,
        addressMatch
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

      console.log(`⚠️ Suspicious claim detected (no matching transfer):`, {
        claimNum: claim.claimNum,
        actualClaimNum: claim.actualClaimNum,
        senderAddress: claim.senderAddress,
        recipientAddress: claim.recipientAddress,
        amount: claim.amount?.toString(),
        data: claim.data,
        bridgeType: claim.bridgeType,
        networkName: claim.networkName
      });
    }
  }

  // Find transfers without matching claims (pending transfers)
  for (const transfer of transfers) {
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

      console.log(`📋 Pending transfer (no matching claim):`, {
        eventType: transfer.eventType,
        senderAddress: transfer.senderAddress,
        amount: transfer.amount?.toString(),
        data: transfer.data,
        blockNumber: transfer.blockNumber,
        transactionHash: transfer.transactionHash,
        bridgeType: transfer.bridgeType,
        networkName: transfer.networkName
      });
    }
  }

  // Sort results
  result.completedTransfers.sort((a, b) => b.blockNumber - a.blockNumber);
  result.suspiciousClaims.sort((a, b) => b.blockNumber - a.blockNumber);
  result.pendingTransfers.sort((a, b) => b.blockNumber - a.blockNumber);

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
