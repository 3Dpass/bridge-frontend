/**
 * Claim Bridge Discriminant
 * 
 * Determines the correct bridge for claiming based on selectedTransfer.bridgeAddress.
 * 
 * Logic:
 * 1. Find the bridge instance that matches selectedTransfer.bridgeAddress
 * 2. Get its foreignTokenAddress
 * 3. Find the mapped bridge with matching foreignTokenAddress
 * 4. Verify bridgeId and direction match
 * 5. Return the mapped bridge for claiming
 */

/**
 * Determine the correct bridge for claiming based on transfer bridgeAddress
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.tokenAddress - The token address to claim (optional, for validation)
 * @param {Object} params.selectedTransfer - The selected transfer event with bridgeAddress
 * @param {Function} params.getBridgeInstancesWithSettings - Function to get all bridge instances
 * @returns {Object|null} The matched bridge instance or null if not found
 */
export const determineClaimBridge = ({
  tokenAddress,
  selectedTransfer,
  getBridgeInstancesWithSettings
}) => {
  // Entry point: Early exit if tokenAddress is empty (optional validation)
  // Note: We can still determine bridge from bridgeAddress even without tokenAddress
  // if (tokenAddress && !tokenAddress.trim()) {
  //   return null;
  // }

  // Early exit if no selectedTransfer or no bridgeAddress
  if (!selectedTransfer || !selectedTransfer.bridgeAddress) {
    console.warn('⚠️ No selectedTransfer or bridgeAddress available');
    return null;
  }

  // Step 1: Get all bridges
  const allBridges = getBridgeInstancesWithSettings();
  
  if (!allBridges || Object.keys(allBridges).length === 0) {
    console.warn('⚠️ No bridges available');
    return null;
  }

  const bridgeAddress = selectedTransfer.bridgeAddress.toLowerCase();
  
  console.log('🔍 Claim bridge discriminant called:', {
    bridgeAddress: bridgeAddress,
    eventType: selectedTransfer.eventType,
    tokenAddress: tokenAddress
  });

  // Step 2: Find the bridge instance that matches selectedTransfer.bridgeAddress
  // This bridge represents the bridge on the foreign network (where the transfer was initiated)
  const sourceBridge = Object.values(allBridges).find(bridge => 
    bridge.address?.toLowerCase() === bridgeAddress
  );

  if (!sourceBridge) {
    console.warn('⚠️ Could not find source bridge with address:', bridgeAddress);
    return null;
  }

  console.log('✅ Found source bridge:', {
    address: sourceBridge.address,
    type: sourceBridge.type,
    homeNetwork: sourceBridge.homeNetwork,
    foreignNetwork: sourceBridge.foreignNetwork,
    foreignTokenAddress: sourceBridge.foreignTokenAddress,
    bridgeId: sourceBridge.bridgeId
  });

  // Get the foreignTokenAddress from the source bridge
  const foreignTokenAddress = sourceBridge.foreignTokenAddress;
  
  if (!foreignTokenAddress) {
    console.warn('⚠️ Source bridge has no foreignTokenAddress');
    return null;
  }

  // Step 3: Find the mapped bridge by matching foreignTokenAddress
  // There's always only one bridge with the same foreign token address
  const mappedBridge = Object.values(allBridges).find(bridge => {
    // Case-insensitive comparison
    return bridge.foreignTokenAddress?.toLowerCase() === foreignTokenAddress.toLowerCase() &&
           // Exclude the source bridge itself
           bridge.address?.toLowerCase() !== bridgeAddress;
  });

  if (!mappedBridge) {
    console.warn('⚠️ Could not find mapped bridge with foreignTokenAddress:', foreignTokenAddress);
    return null;
  }

  console.log('✅ Found mapped bridge:', {
    address: mappedBridge.address,
    type: mappedBridge.type,
    homeNetwork: mappedBridge.homeNetwork,
    foreignNetwork: mappedBridge.foreignNetwork,
    foreignTokenAddress: mappedBridge.foreignTokenAddress,
    bridgeId: mappedBridge.bridgeId
  });

  // Step 4: Verify bridgeId matches for both bridge instances
  if (sourceBridge.bridgeId !== mappedBridge.bridgeId) {
    console.warn('⚠️ BridgeId mismatch:', {
      sourceBridgeId: sourceBridge.bridgeId,
      mappedBridgeId: mappedBridge.bridgeId
    });
    return null;
  }

  // Step 4: Verify direction matches by types
  const sourceType = sourceBridge.type?.toLowerCase();
  const mappedType = mappedBridge.type?.toLowerCase();

  // Direction validation rules:
  // - If source is import/import_wrapper → mapped must be export
  // - If source is export → mapped must be import/import_wrapper
  const isDirectionValid = (
    (sourceType === 'import' || sourceType === 'import_wrapper') && mappedType === 'export'
  ) || (
    sourceType === 'export' && (mappedType === 'import' || mappedType === 'import_wrapper')
  );

  if (!isDirectionValid) {
    console.warn('⚠️ Direction mismatch:', {
      sourceType: sourceType,
      mappedType: mappedType
    });
    return null;
  }

  console.log('✅ Bridge validation passed:', {
    bridgeId: mappedBridge.bridgeId,
    direction: `${sourceType} → ${mappedType}`,
    foreignTokenAddress: foreignTokenAddress
  });

  // Step 5: Return the mapped bridge (this is the bridge to use for claiming)
  return mappedBridge;
};

