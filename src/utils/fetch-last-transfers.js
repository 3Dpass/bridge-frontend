import { ethers } from 'ethers';
import { NETWORKS } from '../config/networks';
import { getBlockTimestamp } from './bridge-contracts';
import { 
  getCachedEvents, 
  setCachedEvents, 
  mergeEvents 
} from './event-cache';
import { 
  EXPORT_ABI,
  IMPORT_ABI,
  IMPORT_WRAPPER_ABI
} from '../contracts/abi';

/**
 * Fetch event details from provider using block numbers from unified fetcher
 * This uses the normal flow: get block numbers from unified fetcher, then fetch event details from provider
 * @param {ethers.providers.Provider} provider - Network provider
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type ('NewExpatriation' or 'NewRepatriation')
 * @param {Array} eventBlocks - Array of event block info from unified fetcher
 * @param {string} bridgeType - Bridge type ('export', 'import', 'import_wrapper')
 * @returns {Promise<Array>} Array of decoded events
 */
const fetchEventsFromProviderBlocks = async (provider, bridgeAddress, eventType, eventBlocks, bridgeType = null) => {
  try {
    console.log(`🔍 fetchEventsFromProviderBlocks: Processing ${eventBlocks.length} events for ${eventType} on ${bridgeAddress} (bridgeType: ${bridgeType})`);
    
    // Get the correct ABI based on bridge type and event type
    let bridgeABI;
    if (eventType === 'NewExpatriation') {
      bridgeABI = EXPORT_ABI;
    } else if (eventType === 'NewRepatriation') {
      if (bridgeType === 'import_wrapper') {
        bridgeABI = IMPORT_WRAPPER_ABI;
      } else {
        bridgeABI = IMPORT_ABI;
      }
    } else {
      throw new Error(`Unknown event type: ${eventType}`);
    }
    
    const contract = new ethers.Contract(bridgeAddress, bridgeABI, provider);
    
    const allEvents = [];
    
    // Group events by block number to minimize provider calls
    const eventsByBlock = {};
    eventBlocks.forEach(event => {
      if (!eventsByBlock[event.blockNumber]) {
        eventsByBlock[event.blockNumber] = [];
      }
      eventsByBlock[event.blockNumber].push(event);
    });
    
    console.log(`🔍 Querying ${Object.keys(eventsByBlock).length} blocks for ${eventType} events`);
    
    for (const [blockNumber] of Object.entries(eventsByBlock)) {
      try {
        console.log(`🔍 Querying for ${eventType} events in block ${blockNumber}`);
        
        // Check if block number is valid
        const blockNum = parseInt(blockNumber);
        if (isNaN(blockNum) || blockNum <= 0) {
          console.warn(`⚠️ Invalid block number: ${blockNumber}, skipping...`);
          continue;
        }
        
        // Get current block to check if we're querying future blocks
        const currentBlock = await provider.getBlockNumber();
        if (blockNum > currentBlock) {
          console.warn(`⚠️ Block ${blockNumber} is in the future (current: ${currentBlock}), skipping...`);
          continue;
        }
        
        const filter = contract.filters[eventType]();
        
        // Convert block number to hex string for queryFilter
        const blockNumberHex = `0x${blockNum.toString(16)}`;
        console.log(`🔍 Using block number hex: ${blockNumberHex} for block ${blockNumber} (current: ${currentBlock})`);
        
        const events = await contract.queryFilter(filter, blockNumberHex, blockNumberHex);
        
        console.log(`🔍 Found ${events.length} ${eventType} events in block ${blockNumber}`);
        
        for (const event of events) {
          const decodedEvent = {
            args: event.args,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex
          };
          allEvents.push(decodedEvent);
        }
      } catch (blockError) {
        console.warn(`⚠️ Error fetching ${eventType} events from block ${blockNumber}:`, blockError.message);
      }
    }
    
    console.log(`🔍 fetchEventsFromProviderBlocks: Returning ${allEvents.length} decoded ${eventType} events`);
    return allEvents;
    
  } catch (error) {
    console.error(`❌ Error in fetchEventsFromProviderBlocks for ${eventType}:`, error);
    return [];
  }
};

/**
 * Fetch last transfers (NewExpatriation and NewRepatriation events) from all networks
 * Searches from most recent blocks first for better performance
 * @param {Object} options - Configuration options
 * @param {Function} options.getNetworkWithSettings - Function to get network with settings
 * @param {Function} options.getBridgeInstancesWithSettings - Function to get bridge instances with settings
 * @param {number} options.timeframeHours - Timeframe in hours to check (default: 1)
 * @param {number} options.blocksToCheck - Number of blocks to check in history (fallback if timeframe not provided)
 * @param {number} options.maxEventsPerBridge - Maximum events to fetch per bridge (default: 100)
 * @returns {Promise<Array>} Array of transfer events with metadata, sorted by most recent first
 */
export const fetchLastTransfers = async ({
  getNetworkWithSettings,
  getBridgeInstancesWithSettings,
  timeframeHours = 1,
  blocksToCheck = null,
  maxEventsPerBridge = 100,
  bridgeAddresses = null
}) => {
  console.log('🔍 fetchLastTransfers: Loading transfer events from all networks');

  try {
    // Get all available networks
    const allNetworks = Object.keys(NETWORKS);
    console.log('🔍 Loading transfers from all networks:', allNetworks);

    // Fetch transfers from all networks simultaneously
    const allTransfers = [];
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
        networkBridgeInstances.map(b => ({ 
          address: b.address, 
          type: b.type, 
          homeNetwork: b.homeNetwork, 
          foreignNetwork: b.foreignNetwork 
        }))
      );
      
      // Debug: Check if P3D_EXPORT bridge is included
      const p3dExportBridge = networkBridgeInstances.find(b => b.address === '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F');
      console.log(`🔍 P3D_EXPORT bridge included:`, p3dExportBridge ? 'YES' : 'NO', p3dExportBridge);

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
      
      // Using unified fetcher - no need for block range calculations
      console.log(`🔍 Using unified fetcher for transfer events on ${networkKey}`);
      
      // Fetch transfer events from all bridge instances in this network
      for (const bridgeInstance of filteredBridges) {
        console.log(`🔍 Processing bridge: ${bridgeInstance.address} (${bridgeInstance.type}) on ${networkKey}`);
        try {
          // Additional safety check before creating contract
          if (!networkProvider || !bridgeInstance.address) {
            console.log(`🔍 Skipping bridge ${bridgeInstance.address}: missing provider or address`);
            continue;
          }
          
          console.log(`✅ Processing bridge: ${bridgeInstance.address} on ${networkKey}`);
          
          // Fetch all transfer events for this bridge in one call using unified fetcher
          let expatriationEvents = [];
          let repatriationEvents = [];
          
          try {
            // Import unified fetcher
            const { getAllTransferBlockNumbersUnified } = await import('./unified-block-fetcher.js');
            
            // Get all transfer events for this bridge in one call
            const result = await getAllTransferBlockNumbersUnified(networkKey, bridgeInstance.address, {
              limit: maxEventsPerBridge
            });
            
            console.log(`🔍 Got all transfer events for ${bridgeInstance.address}:`, {
              expatriationEvents: result.expatriationEvents?.eventCount || 0,
              repatriationEvents: result.repatriationEvents?.eventCount || 0,
              totalEvents: result.totalEventCount
            });
            
            // Process NewExpatriation events (for Export bridges)
            if (bridgeInstance.type === 'export' && result.expatriationEvents) {
              // Get cached events first
              const cachedEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewExpatriation');
              
              // Use normal flow: fetch event details from provider using block numbers from unified fetcher
              const newEvents = await fetchEventsFromProviderBlocks(
                networkProvider,
                bridgeInstance.address,
                'NewExpatriation',
                result.expatriationEvents.events.slice(0, maxEventsPerBridge),
                bridgeInstance.type
              );
              
              // Merge with cached events
              expatriationEvents = mergeEvents(cachedEvents, newEvents);
              
              // Update cache with merged events
              setCachedEvents(networkKey, bridgeInstance.address, 'NewExpatriation', expatriationEvents);
              
              console.log(`🔍 Found ${newEvents.length} new + ${cachedEvents?.length || 0} cached = ${expatriationEvents.length} total NewExpatriation events from ${bridgeInstance.address}`);
            }
            
            // Process NewRepatriation events (for Import/ImportWrapper bridges)
            if ((bridgeInstance.type === 'import' || bridgeInstance.type === 'import_wrapper') && result.repatriationEvents) {
              // Get cached events first
              const cachedEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewRepatriation');
              
              // Use normal flow: fetch event details from provider using block numbers from unified fetcher
              const newEvents = await fetchEventsFromProviderBlocks(
                networkProvider,
                bridgeInstance.address,
                'NewRepatriation',
                result.repatriationEvents.events.slice(0, maxEventsPerBridge),
                bridgeInstance.type
              );
              
              // Merge with cached events
              repatriationEvents = mergeEvents(cachedEvents, newEvents);
              
              // Update cache with merged events
              setCachedEvents(networkKey, bridgeInstance.address, 'NewRepatriation', repatriationEvents);
              
              console.log(`🔍 Found ${newEvents.length} new + ${cachedEvents?.length || 0} cached = ${repatriationEvents.length} total NewRepatriation events from ${bridgeInstance.address}`);
            }
            
          } catch (error) {
            console.log(`🔍 Error fetching transfer events from ${bridgeInstance.address}:`, error.message);
            // Fallback to cached events if available
            expatriationEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewExpatriation') || [];
            repatriationEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewRepatriation') || [];
          }
          
          // Process expatriation events
          console.log(`🔍 Processing ${expatriationEvents.length} NewExpatriation events from ${bridgeInstance.address}`);
          for (const event of expatriationEvents) {
            try {
              // Validate event data
              if (!event.args || !event.blockNumber || !event.transactionHash) {
                console.warn(`⚠️ Skipping invalid NewExpatriation event:`, {
                  hasArgs: !!event.args,
                  blockNumber: event.blockNumber,
                  transactionHash: event.transactionHash
                });
                continue;
              }

              // Debug: Log the raw event data
              console.log(`🔍 Raw NewExpatriation event data:`, {
                event: event,
                args: event.args,
                argsLength: event.args?.length,
                argsArray: event.args ? Array.from(event.args) : null,
                // Try both array and object access patterns
                sender_address_array: event.args?.[0],
                amount_array: event.args?.[1],
                reward_array: event.args?.[2],
                foreign_address_array: event.args?.[3],
                data_array: event.args?.[4],
                // Object access (what we were trying)
                sender_address_obj: event.args?.sender_address,
                foreign_address_obj: event.args?.foreign_address,
                amount_obj: event.args?.amount,
                reward_obj: event.args?.reward,
                data_obj: event.args?.data
              });

            // Debug: Check what the raw amount actually is
            console.log('🔍 Raw amount debugging:', {
              rawAmount: event.args[1],
              rawAmountType: typeof event.args[1],
              rawAmountConstructor: event.args[1]?.constructor?.name,
              rawAmountToString: event.args[1]?.toString?.(),
              rawAmountValue: event.args[1]?.value,
              rawAmountHex: event.args[1]?.hex,
              rawAmountIsBigNumber: event.args[1]?._isBigNumber,
              rawAmountIsZero: event.args[1]?.isZero?.(),
              rawAmountEq: event.args[1]?.eq?.(0)
            });

            const transferWithInfo = {
              // Event data
              eventType: 'NewExpatriation',
                senderAddress: event.args[0] || 'Unknown', // sender_address
                amount: event.args[1] ? (event.args[1].hex || event.args[1].toString()) : '0', // amount
                reward: event.args[2] ? (event.args[2].hex || event.args[2].toString()) : '0', // reward
                foreignAddress: event.args[3] || 'Unknown', // foreign_address
                recipientAddress: event.args[3] || 'Unknown', // foreign_address (for UI compatibility)
                data: event.args[4] || '', // data
              
              // Event metadata
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              timestamp: await getBlockTimestamp(networkProvider, event.blockNumber),
              
              // Bridge information
              bridgeInstance,
              bridgeAddress: bridgeInstance.address,
              bridgeType: bridgeInstance.type,
              homeNetwork: bridgeInstance.homeNetwork,
              foreignNetwork: bridgeInstance.foreignNetwork,
              homeTokenAddress: bridgeInstance.homeTokenAddress,
              foreignTokenAddress: bridgeInstance.foreignTokenAddress,
              homeTokenSymbol: bridgeInstance.homeTokenSymbol,
              foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
              
              // Network information
              networkKey,
              networkName: networkConfig.name,
              networkId: networkConfig.id,
              
              // Transfer direction
              direction: 'export', // From home to foreign
              fromNetwork: bridgeInstance.homeNetwork,
              toNetwork: bridgeInstance.foreignNetwork,
              fromTokenSymbol: bridgeInstance.homeTokenSymbol,
              toTokenSymbol: bridgeInstance.foreignTokenSymbol
            };
            
            console.log(`🔍 NewExpatriation event from ${networkKey}:`, {
              senderAddress: transferWithInfo.senderAddress,
                recipientAddress: transferWithInfo.recipientAddress,
                amount: transferWithInfo.amount,
                amountType: typeof transferWithInfo.amount,
                amountValue: transferWithInfo.amount,
              foreignAddress: transferWithInfo.foreignAddress,
              data: transferWithInfo.data,
              bridgeType: transferWithInfo.bridgeType,
              fromNetwork: transferWithInfo.fromNetwork,
              toNetwork: transferWithInfo.toNetwork,
              blockNumber: transferWithInfo.blockNumber,
              transactionHash: transferWithInfo.transactionHash,
                timestamp: transferWithInfo.timestamp,
                // Debug: show raw args access
                rawArgs: event.args,
                rawArgsArray: event.args ? Array.from(event.args) : null,
                // Debug: show raw amount before conversion
                rawAmount: event.args[1],
                rawAmountType: typeof event.args[1],
                rawAmountString: event.args[1]?.toString(),
                rawAmountHex: event.args[1]?.toHexString?.(),
                rawAmountIsBigNumber: event.args[1]?._isBigNumber,
                rawAmountValue: event.args[1]?.value,
                rawAmountToString: event.args[1]?.toString?.(),
                rawAmountIsZero: event.args[1]?.isZero?.(),
                rawAmountEq: event.args[1]?.eq?.(0)
            });
            
            allTransfers.push(transferWithInfo);
            } catch (eventError) {
              console.warn(`⚠️ Error processing NewExpatriation event from ${networkKey}:`, {
                error: eventError.message,
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                bridgeAddress: bridgeInstance.address
              });
              // Continue processing other events
            }
          }
          
          // Process repatriation events
          console.log(`🔍 Processing ${repatriationEvents.length} NewRepatriation events from ${bridgeInstance.address}`);
          for (const event of repatriationEvents) {
            try {
              // Validate event data
              if (!event.args || !event.blockNumber || !event.transactionHash) {
                console.warn(`⚠️ Skipping invalid NewRepatriation event:`, {
                  hasArgs: !!event.args,
                  blockNumber: event.blockNumber,
                  transactionHash: event.transactionHash
                });
                continue;
              }

              // Debug: Log the raw event data
              console.log(`🔍 Raw NewRepatriation event data:`, {
                event: event,
                args: event.args,
                argsLength: event.args?.length,
                argsArray: event.args ? Array.from(event.args) : null,
                // Try both array and object access patterns
                sender_address_array: event.args?.[0],
                amount_array: event.args?.[1],
                reward_array: event.args?.[2],
                home_address_array: event.args?.[3],
                data_array: event.args?.[4],
                // Object access (what we were trying)
                sender_address_obj: event.args?.sender_address,
                home_address_obj: event.args?.home_address,
                amount_obj: event.args?.amount,
                reward_obj: event.args?.reward,
                data_obj: event.args?.data
              });

            const transferWithInfo = {
              // Event data
              eventType: 'NewRepatriation',
                senderAddress: event.args[0] || 'Unknown', // sender_address
                amount: event.args[1] ? (event.args[1].hex || event.args[1].toString()) : '0', // amount
                reward: event.args[2] ? (event.args[2].hex || event.args[2].toString()) : '0', // reward
                homeAddress: event.args[3] || 'Unknown', // home_address
                recipientAddress: event.args[3] || 'Unknown', // home_address (for UI compatibility)
                data: event.args[4] || '', // data
              
              // Event metadata
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              timestamp: await getBlockTimestamp(networkProvider, event.blockNumber),
              
              // Bridge information
              bridgeInstance,
              bridgeAddress: bridgeInstance.address,
              bridgeType: bridgeInstance.type,
              homeNetwork: bridgeInstance.homeNetwork,
              foreignNetwork: bridgeInstance.foreignNetwork,
              homeTokenAddress: bridgeInstance.homeTokenAddress,
              foreignTokenAddress: bridgeInstance.foreignTokenAddress,
              homeTokenSymbol: bridgeInstance.homeTokenSymbol,
              foreignTokenSymbol: bridgeInstance.foreignTokenSymbol,
              
              // Network information
              networkKey,
              networkName: networkConfig.name,
              networkId: networkConfig.id,
              
              // Transfer direction
              direction: 'import', // From foreign to home
              fromNetwork: bridgeInstance.foreignNetwork,
              toNetwork: bridgeInstance.homeNetwork,
              fromTokenSymbol: bridgeInstance.foreignTokenSymbol,
              toTokenSymbol: bridgeInstance.homeTokenSymbol
            };
            
            console.log(`🔍 NewRepatriation event from ${networkKey}:`, {
              senderAddress: transferWithInfo.senderAddress,
                recipientAddress: transferWithInfo.recipientAddress,
                amount: transferWithInfo.amount,
                amountType: typeof transferWithInfo.amount,
                amountValue: transferWithInfo.amount,
              homeAddress: transferWithInfo.homeAddress,
              data: transferWithInfo.data,
              bridgeType: transferWithInfo.bridgeType,
              fromNetwork: transferWithInfo.fromNetwork,
              toNetwork: transferWithInfo.toNetwork,
              blockNumber: transferWithInfo.blockNumber,
              transactionHash: transferWithInfo.transactionHash,
                timestamp: transferWithInfo.timestamp,
                // Debug: show raw args access
                rawArgs: event.args,
                rawArgsArray: event.args ? Array.from(event.args) : null,
                // Debug: show raw amount before conversion
                rawAmount: event.args[1],
                rawAmountType: typeof event.args[1],
                rawAmountString: event.args[1]?.toString(),
                rawAmountHex: event.args[1]?.toHexString?.(),
                rawAmountIsBigNumber: event.args[1]?._isBigNumber,
                rawAmountValue: event.args[1]?.value,
                rawAmountToString: event.args[1]?.toString?.(),
                rawAmountIsZero: event.args[1]?.isZero?.(),
                rawAmountEq: event.args[1]?.eq?.(0)
            });
            
            allTransfers.push(transferWithInfo);
            } catch (eventError) {
              console.warn(`⚠️ Error processing NewRepatriation event from ${networkKey}:`, {
                error: eventError.message,
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                bridgeAddress: bridgeInstance.address
              });
              // Continue processing other events
            }
          }
          
        } catch (error) {
          console.error(`❌ Error loading transfers from bridge ${bridgeInstance.address} on ${networkKey}:`, {
            error: error.message,
            code: error.code,
            data: error.data,
            bridgeAddress: bridgeInstance.address,
            bridgeType: bridgeInstance.type,
            homeNetwork: bridgeInstance.homeNetwork,
            foreignNetwork: bridgeInstance.foreignNetwork,
            networkKey
          });
        }
      }
      
      console.log(`✅ Completed processing network ${networkKey}. Total transfers so far: ${allTransfers.length}`);
    }

    // Sort transfers by block number (most recent first)
    allTransfers.sort((a, b) => b.blockNumber - a.blockNumber);

    console.log(`✅ FINAL RESULT: Loaded ${allTransfers.length} transfer events from all networks`);
    return allTransfers;
  } catch (error) {
    console.error('Error loading transfers from all networks:', error);
    throw error;
  }
};
