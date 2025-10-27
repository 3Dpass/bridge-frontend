import { ethers } from 'ethers';
import { NETWORKS } from '../config/networks';
import { 
  getAllClaims, 
  createCounterstakeContract 
} from './bridge-contracts';

/**
 * Fetch claims from all networks and bridges
 * @param {Object} options - Configuration options
 * @param {Function} options.getNetworkWithSettings - Function to get network with settings
 * @param {Function} options.getBridgeInstancesWithSettings - Function to get bridge instances with settings
 * @param {string} options.filter - Filter type ('all' or 'my')
 * @param {string} options.account - User account address for filtering
 * @param {Function} options.getTransferTokenSymbol - Function to get transfer token symbol
 * @param {Function} options.getTokenDecimals - Function to get token decimals
 * @returns {Promise<Array>} Array of claims with metadata
 */
export const fetchClaimsFromAllNetworks = async ({
  getNetworkWithSettings,
  getBridgeInstancesWithSettings,
  filter = 'all',
  account = null,
  getTransferTokenSymbol,
  getTokenDecimals,
  bridgeAddresses = null
}) => {
  console.log('🔍 fetchClaimsFromAllNetworks: Loading claims from all networks');

  try {
    // Get all available networks
    const allNetworks = Object.keys(NETWORKS);
    console.log('🔍 Loading claims from all networks:', allNetworks);

    // Fetch claims from all networks simultaneously
    const allClaims = [];
    const customBridges = getBridgeInstancesWithSettings();
    
    // Process each network
    for (const networkKey of allNetworks) {
      const networkConfig = getNetworkWithSettings(networkKey);
      if (!networkConfig || !networkConfig.contracts) {
        console.log(`🔍 Skipping network ${networkKey}: no configuration found`);
        continue;
      }
      
      console.log(`🔍 Processing network: ${networkKey} (${networkConfig.name})`);
      
      // Get bridges for this network from network config
      const defaultBridges = networkConfig.bridges ? Object.values(networkConfig.bridges) : [];
      
      // Also get import bridges that are defined at the network level (not in bridges object)
      const importBridges = Object.entries(networkConfig)
        .filter(([key, value]) => 
          key !== 'bridges' && 
          key !== 'assistants' && 
          key !== 'tokens' && 
          key !== 'contracts' &&
          typeof value === 'object' && 
          value.address && 
          (value.type === 'import' || value.type === 'import_wrapper')
        )
        .map(([key, value]) => value);
      
      const allDefaultBridges = [...defaultBridges, ...importBridges];
      
      // Get custom bridges for this network
      const customNetworkBridges = Object.values(customBridges).filter(bridge => {
        // For export bridges: include when this network is the home network
        if (bridge.type === 'export') {
          return bridge.homeNetwork === networkConfig.name;
        }
        // For import bridges: include when this network is the foreign network
        if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          return bridge.foreignNetwork === networkConfig.name;
        }
        // For other types, use the old logic
        return bridge.homeNetwork === networkConfig.name || bridge.foreignNetwork === networkConfig.name;
      });
      
      // Combine default bridges with custom bridges, avoiding duplicates
      const networkBridgeInstances = [...allDefaultBridges];
      customNetworkBridges.forEach(customBridge => {
        const exists = networkBridgeInstances.some(bridge => bridge.address === customBridge.address);
        if (!exists) {
          networkBridgeInstances.push(customBridge);
        }
      });
      
      console.log(`🔍 Found ${networkBridgeInstances.length} bridges for ${networkKey}:`, 
        networkBridgeInstances.map(b => ({ address: b.address, type: b.type }))
      );

      // Filter bridges by direction if specified
      let filteredBridges = networkBridgeInstances;
      if (bridgeAddresses && bridgeAddresses.length > 0) {
        filteredBridges = networkBridgeInstances.filter(bridge => 
          bridgeAddresses.includes(bridge.address.toLowerCase())
        );
        console.log(`🔍 Filtered to ${filteredBridges.length} bridges for direction:`, 
          filteredBridges.map(b => ({ address: b.address, type: b.type }))
        );
      }

      // Skip if no bridges found for this network
      if (filteredBridges.length === 0) {
        console.log(`🔍 No bridges found for network ${networkKey} after filtering, skipping...`);
        continue;
      }

      // Get RPC URL for this network
      const rpcUrl = networkConfig?.rpcUrl;
      if (!rpcUrl) {
        console.log(`🔍 No RPC URL found for network ${networkKey}, skipping...`);
        continue;
      }
      
      console.log(`🔍 Using RPC URL for ${networkKey}: ${rpcUrl}`);
      
      // Create provider for this network
      const networkProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
      
      // Fetch claims from all bridge instances in this network
      console.log(`🔍 FETCHING CLAIMS FROM ${networkKey.toUpperCase()} BRIDGES:`, {
        totalBridges: filteredBridges.length,
        filter,
        account: account || 'not connected'
      });
      
      for (const bridgeInstance of filteredBridges) {
        console.log(`🔍 Processing bridge: ${bridgeInstance.address} (${bridgeInstance.type}) on ${networkKey}`);
        try {
          // Additional safety check before creating contract
          if (!networkProvider || !bridgeInstance.address) {
            console.log(`🔍 Skipping bridge ${bridgeInstance.address}: missing provider or address`);
            continue;
          }
          
          const contract = await createCounterstakeContract(networkProvider, bridgeInstance.address);
          console.log(`✅ Contract created for bridge: ${bridgeInstance.address} on ${networkKey}`);
          
          // Use a fixed limit since unified fetcher gets all events
          const claimsLimit = 100;
          console.log(`🔍 Fetching up to ${claimsLimit} claims from ${networkKey}`);

          let bridgeClaims;
          if (filter === 'my') {
            console.log(`🔍 Fetching claims for recipient: ${account} from ${networkKey}`);
            // For "My Claims", we need to filter by recipient address
            // Since getClaimsForRecipient gets claims where user is recipient,
            // we'll get all claims and filter by recipient on the frontend
            bridgeClaims = await getAllClaims(contract, claimsLimit, rpcUrl, networkKey);
          } else {
            console.log(`🔍 Fetching all claims from ${networkKey}`);
            bridgeClaims = await getAllClaims(contract, claimsLimit, rpcUrl, networkKey);
          }
          
          console.log(`✅ Fetched ${bridgeClaims.length} claims from bridge: ${bridgeInstance.address} on ${networkKey}`);
          console.log(`🔍 Bridge instance data:`, {
            address: bridgeInstance.address,
            type: bridgeInstance.type,
            homeNetwork: bridgeInstance.homeNetwork,
            foreignNetwork: bridgeInstance.foreignNetwork,
            homeTokenSymbol: bridgeInstance.homeTokenSymbol,
            foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
            homeTokenAddress: bridgeInstance.homeTokenAddress,
            foreignTokenAddress: bridgeInstance.foreignTokenAddress
          });

          // Add bridge information to each claim and transform field names
          const claimsWithBridgeInfo = await Promise.all(bridgeClaims.map(async (claim, index) => {
            // Fetch token information from bridge settings
            let bridgeTokenSymbol = null;
            let bridgeTokenAddress = null;
            
            try {
              // Get the bridge settings to find the token address
              const settings = await contract.settings();
              bridgeTokenAddress = settings.tokenAddress;
              
              console.log(`🔍 Bridge settings for ${bridgeInstance.address} on ${networkKey}:`, {
                tokenAddress: bridgeTokenAddress,
                bridgeType: bridgeInstance.type,
                homeTokenSymbol: bridgeInstance.homeTokenSymbol,
                foreignTokenSymbol: bridgeInstance.foreignTokenSymbol
              });
              
              // For import bridges, the user receives the foreign token (e.g., wUSDT on 3DPass)
              // For export bridges, the user receives the home token (e.g., P3D on 3DPass)
              if (bridgeInstance.type === 'import' || bridgeInstance.type === 'import_wrapper') {
                // Import bridges: user receives the foreign token (e.g., wUSDT on 3DPass)
                bridgeTokenSymbol = bridgeInstance.foreignTokenSymbol;
                bridgeTokenAddress = bridgeInstance.foreignTokenAddress;
              } else if (bridgeInstance.type === 'export') {
                // Export bridges: user receives the home token (e.g., P3D on 3DPass)
                bridgeTokenSymbol = bridgeInstance.homeTokenSymbol;
                bridgeTokenAddress = bridgeInstance.homeTokenAddress;
              } else {
                // Fallback to bridge settings
                if (bridgeTokenAddress) {
                  // Use the bridge configuration to get the token symbol
                  bridgeTokenSymbol = bridgeInstance.homeTokenSymbol || bridgeInstance.foreignTokenSymbol;
                }
              }
            } catch (error) {
              console.log(`🔍 Could not fetch bridge settings for ${bridgeInstance.address} on ${networkKey}:`, error.message);
              // Fallback to bridge configuration
              bridgeTokenSymbol = bridgeInstance.homeTokenSymbol || bridgeInstance.foreignTokenSymbol;
              bridgeTokenAddress = bridgeInstance.homeTokenAddress || bridgeInstance.foreignTokenAddress;
            }
            
            const claimWithInfo = {
              // Transform field names to match expected UI structure
              claimNum: index + 1, // Display number for UI
              actualClaimNum: claim.claim_num, // Actual blockchain claim number
              
              amount: claim.amount,
              recipientAddress: claim.recipient_address,
              currentOutcome: claim.current_outcome,
              yesStake: claim.yes_stake,
              noStake: claim.no_stake,
              expiryTs: claim.expiry_ts,
              finished: claim.finished,
              withdrawn: claim.withdrawn,
              senderAddress: claim.sender_address,
              data: claim.data,
              // Keep original fields for debugging
              ...claim,
              // Add bridge information
              bridgeInstance,
              bridgeAddress: bridgeInstance.address,
              bridgeType: bridgeInstance.type,
              homeNetwork: bridgeInstance.homeNetwork,
              foreignNetwork: bridgeInstance.foreignNetwork,
              homeTokenAddress: bridgeInstance.homeTokenAddress,
              foreignTokenAddress: bridgeInstance.foreignTokenAddress,
              homeTokenSymbol: bridgeInstance.homeTokenSymbol,
              foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
              // Add token info from bridge settings
              bridgeTokenAddress,
              bridgeTokenSymbol,
              // Add network information
              networkKey,
              networkName: networkConfig.name,
              networkId: networkConfig.id
            };
            
            console.log(`🔍 Claim ${index + 1} with bridge info from ${networkKey}:`, {
              claimNum: claimWithInfo.claimNum,
              bridgeType: claimWithInfo.bridgeType,
              homeTokenSymbol: claimWithInfo.homeTokenSymbol,
              foreignTokenSymbol: claimWithInfo.foreignTokenSymbol,
              homeTokenAddress: claimWithInfo.homeTokenAddress,
              foreignTokenAddress: claimWithInfo.foreignTokenAddress,
              bridgeTokenAddress: claimWithInfo.bridgeTokenAddress,
              bridgeTokenSymbol: claimWithInfo.bridgeTokenSymbol,
              homeNetwork: bridgeInstance.homeNetwork,
              foreignNetwork: bridgeInstance.foreignNetwork,
              networkKey: claimWithInfo.networkKey,
              networkName: claimWithInfo.networkName,
              rawAmount: claim.amount,
              rawAmountString: claim.amount?.toString(),
              rawAmountHex: claim.amount?.toHexString?.(),
              amountType: typeof claim.amount,
              amountHasToNumber: typeof claim.amount?.toNumber === 'function',
              rawYesStake: claim.yes_stake,
              rawNoStake: claim.no_stake,
              yesStakeType: typeof claim.yes_stake,
              noStakeType: typeof claim.no_stake,
              finalTokenSymbol: getTransferTokenSymbol(claimWithInfo),
              finalDecimals: getTokenDecimals(claimWithInfo)
            });
            
            return claimWithInfo;
          }));

          allClaims.push(...claimsWithBridgeInfo);
        } catch (error) {
          console.error(`❌ Error loading claims from bridge ${bridgeInstance.address} on ${networkKey}:`, {
            error: error.message,
            code: error.code,
            data: error.data,
            bridgeAddress: bridgeInstance.address,
            bridgeType: bridgeInstance.type,
            homeNetwork: bridgeInstance.homeNetwork,
            foreignNetwork: bridgeInstance.foreignNetwork,
            networkKey
          });
          
          // Check if it's a circuit breaker error
          if (error.message.includes('circuit breaker') || error.message.includes('Execution prevented')) {
            console.error(`🚨 CIRCUIT BREAKER DETECTED for bridge: ${bridgeInstance.address} on ${networkKey}`);
            console.error(`🚨 Bridge details:`, bridgeInstance);
          }
        }
      }
      
      console.log(`✅ Completed processing network ${networkKey}. Total claims so far: ${allClaims.length}`);
    }

    // Filter claims if "My Claims" is selected
    let filteredClaims = allClaims;
    if (filter === 'my') {
      if (!account) {
        console.log('🔍 "My Claims" filter selected but no account connected - showing all claims');
        // If user selects "My Claims" but isn't connected, show all claims
        // This provides a better UX than showing empty state
      } else {
        filteredClaims = allClaims.filter(claim => 
          claim.recipientAddress && 
          claim.recipientAddress.toLowerCase() === account.toLowerCase()
        );
        console.log(`🔍 Filtered claims for recipient ${account}:`, {
          totalClaims: allClaims.length,
          filteredClaims: filteredClaims.length,
          recipientAddress: account
        });
      }
    }

    // Sort claims by network and claim number (most recent first)
    filteredClaims.sort((a, b) => {
      // First sort by network name, then by claim number
      if (a.networkName !== b.networkName) {
        return a.networkName.localeCompare(b.networkName);
      }
      return b.claimNum - a.claimNum;
    });

    console.log(`✅ FINAL RESULT: Loaded ${filteredClaims.length} claims from all networks`);
    return filteredClaims;
  } catch (error) {
    console.error('Error loading claims from all networks:', error);
    throw error;
  }
};
