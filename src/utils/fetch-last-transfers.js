import { ethers } from 'ethers';
import { NETWORKS } from '../config/networks';
import { estimateBlocksFromTimeframe, getBlockTime } from './block-estimator';
import { getBlockTimestamp } from './bridge-contracts';
import { 
  getCachedEvents, 
  setCachedEvents, 
  getMostRecentCachedBlock, 
  mergeEvents 
} from './event-cache';

/**
 * Efficiently fetch events from most recent blocks first using chunked search
 * @param {ethers.Contract} contract - Contract instance
 * @param {ethers.EventFilter} filter - Event filter
 * @param {number} fromBlock - Starting block (oldest)
 * @param {number} toBlock - Ending block (newest)
 * @param {number} maxEvents - Maximum number of events to fetch
 * @param {number} chunkSize - Size of each chunk to search (default: 1000)
 * @returns {Promise<Array>} Array of events sorted by most recent first
 */
const fetchEventsFromRecentBlocks = async (contract, filter, fromBlock, toBlock, maxEvents = 100, chunkSize = 1000) => {
  const allEvents = [];
  let currentToBlock = toBlock;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;
  
  console.log(`🔍 Fetching events from block ${fromBlock} to ${toBlock} in chunks of ${chunkSize}, max ${maxEvents} events`);
  
  while (currentToBlock > fromBlock && allEvents.length < maxEvents) {
    const currentFromBlock = Math.max(fromBlock, currentToBlock - chunkSize + 1);
    
    try {
      console.log(`🔍 Searching chunk: blocks ${currentFromBlock} to ${currentToBlock}`);
      const chunkEvents = await contract.queryFilter(filter, currentFromBlock, currentToBlock);
      
      // Add events to our collection (they come in chronological order from queryFilter)
      allEvents.push(...chunkEvents);
      
      console.log(`🔍 Found ${chunkEvents.length} events in chunk ${currentFromBlock}-${currentToBlock}, total: ${allEvents.length}`);
      
      // Reset consecutive errors on success
      consecutiveErrors = 0;
      
      // Move to the next chunk (going backwards in time)
      currentToBlock = currentFromBlock - 1;
      
      // If we have enough events, we can stop early
      if (allEvents.length >= maxEvents) {
        console.log(`🔍 Reached max events limit (${maxEvents}), stopping search early`);
        break;
      }
      
      // Add a small delay between requests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      consecutiveErrors++;
      console.warn(`🔍 Error fetching events from blocks ${currentFromBlock}-${currentToBlock}:`, error.message);
      
      // If we get too many consecutive errors, stop searching
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.warn(`🔍 Too many consecutive errors (${consecutiveErrors}), stopping search`);
        break;
      }
      
      // If it's a rate limit error (429), wait longer before continuing
      if (error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('Too Many Requests')) {
        console.warn(`🔍 Rate limit detected, waiting 2 seconds before continuing...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        // For other errors, wait a shorter time
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Continue with next chunk
      currentToBlock = currentFromBlock - 1;
    }
  }
  
  // Sort all events by block number (most recent first)
  allEvents.sort((a, b) => b.blockNumber - a.blockNumber);
  
  // Return only the most recent events up to maxEvents
  const result = allEvents.slice(0, maxEvents);
  console.log(`🔍 Returning ${result.length} most recent events out of ${allEvents.length} total found`);
  
  return result;
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
  maxEventsPerBridge = 100
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

      // Skip if no bridges found for this network
      if (networkBridgeInstances.length === 0) {
        console.log(`🔍 No bridges found for network ${networkKey}, skipping...`);
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
      
      // Get current block number
      const currentBlock = await networkProvider.getBlockNumber();
      
      // Calculate blocks to check based on timeframe or fallback to blocksToCheck
      let blocksToCheckForNetwork;
      if (blocksToCheck !== null) {
        // Use explicit blocksToCheck if provided
        blocksToCheckForNetwork = blocksToCheck;
        console.log(`🔍 Using explicit blocksToCheck: ${blocksToCheckForNetwork} for ${networkKey}`);
      } else {
        // Calculate blocks based on timeframe and network block time
        blocksToCheckForNetwork = estimateBlocksFromTimeframe(timeframeHours, networkKey);
        console.log(`🔍 Calculated blocks for ${timeframeHours}h on ${networkKey}: ${blocksToCheckForNetwork} blocks (block time: ${getBlockTime(networkKey)}s)`);
      }
      
      // Check if we have cached events and can optimize the search range
      let fromBlock = Math.max(0, currentBlock - blocksToCheckForNetwork);
      
      // Try to find the most recent cached block across all bridges for this network
      let mostRecentCachedBlock = null;
      for (const bridgeInstance of networkBridgeInstances) {
        const expatBlock = getMostRecentCachedBlock(networkKey, bridgeInstance.address, 'NewExpatriation');
        const repatBlock = getMostRecentCachedBlock(networkKey, bridgeInstance.address, 'NewRepatriation');
        
        if (expatBlock && (!mostRecentCachedBlock || expatBlock > mostRecentCachedBlock)) {
          mostRecentCachedBlock = expatBlock;
        }
        if (repatBlock && (!mostRecentCachedBlock || repatBlock > mostRecentCachedBlock)) {
          mostRecentCachedBlock = repatBlock;
        }
      }
      
      if (mostRecentCachedBlock && mostRecentCachedBlock > fromBlock) {
        // Start searching from the most recent cached event + 1
        fromBlock = mostRecentCachedBlock + 1;
        console.log(`🚀 Using cache optimization: searching from block ${fromBlock} (most recent cached: ${mostRecentCachedBlock}) instead of ${Math.max(0, currentBlock - blocksToCheckForNetwork)}`);
      } else {
        console.log(`🔍 No recent cached events found, searching full range from block ${fromBlock}`);
      }
      
      console.log(`🔍 Checking blocks ${fromBlock} to ${currentBlock} for transfer events on ${networkKey} (${currentBlock - fromBlock + 1} blocks) - searching from most recent first`);
      
      // Fetch transfer events from all bridge instances in this network
      for (const bridgeInstance of networkBridgeInstances) {
        console.log(`🔍 Processing bridge: ${bridgeInstance.address} (${bridgeInstance.type}) on ${networkKey}`);
        try {
          // Additional safety check before creating contract
          if (!networkProvider || !bridgeInstance.address) {
            console.log(`🔍 Skipping bridge ${bridgeInstance.address}: missing provider or address`);
            continue;
          }
          
          // Create contract instance for event filtering
          const contract = new ethers.Contract(bridgeInstance.address, [
            // NewExpatriation event (from Export contracts)
            "event NewExpatriation(address sender_address, uint amount, int reward, string foreign_address, string data)",
            // NewRepatriation event (from Import/ImportWrapper contracts)
            "event NewRepatriation(address sender_address, uint amount, uint reward, string home_address, string data)"
          ], networkProvider);
          
          console.log(`✅ Contract created for bridge: ${bridgeInstance.address} on ${networkKey}`);
          
          // Fetch NewExpatriation events (for Export bridges) - search from most recent blocks first
          let expatriationEvents = [];
          if (bridgeInstance.type === 'export') {
            try {
              // Get cached events first
              const cachedEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewExpatriation');
              
              // Use efficient chunked search from most recent blocks first
              // Use smaller chunk size for Ethereum to avoid rate limits
              const chunkSize = networkKey === 'ETHEREUM' ? 500 : 1000;
              const newEvents = await fetchEventsFromRecentBlocks(
                contract,
                contract.filters.NewExpatriation(),
                fromBlock,
                currentBlock,
                maxEventsPerBridge,
                chunkSize
              );
              
              // Merge with cached events
              console.log(`🔍 Before merge - cached: ${cachedEvents?.length || 0}, new: ${newEvents.length}`);
              if (cachedEvents && cachedEvents.length > 0) {
                console.log(`🔍 First cached event structure:`, {
                  event: cachedEvents[0],
                  args: cachedEvents[0]?.args,
                  argsLength: cachedEvents[0]?.args?.length,
                  // Array access (correct)
                  hasSenderAddress: !!cachedEvents[0]?.args?.[0],
                  hasForeignAddress: !!cachedEvents[0]?.args?.[3],
                  senderAddress: cachedEvents[0]?.args?.[0],
                  foreignAddress: cachedEvents[0]?.args?.[3]
                });
              }
              if (newEvents && newEvents.length > 0) {
                console.log(`🔍 First new event structure:`, {
                  event: newEvents[0],
                  args: newEvents[0]?.args,
                  argsLength: newEvents[0]?.args?.length,
                  // Array access (correct)
                  hasSenderAddress: !!newEvents[0]?.args?.[0],
                  hasForeignAddress: !!newEvents[0]?.args?.[3],
                  senderAddress: newEvents[0]?.args?.[0],
                  foreignAddress: newEvents[0]?.args?.[3]
                });
              }
              expatriationEvents = mergeEvents(cachedEvents, newEvents);
              
              // Update cache with merged events
              setCachedEvents(networkKey, bridgeInstance.address, 'NewExpatriation', expatriationEvents);
              
              console.log(`🔍 Found ${newEvents.length} new + ${cachedEvents?.length || 0} cached = ${expatriationEvents.length} total NewExpatriation events from ${bridgeInstance.address}`);
              
              // Debug: Check if this is the P3D_EXPORT bridge and log specific details
              if (bridgeInstance.address === '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F') {
                console.log(`🔍 P3D_EXPORT bridge event details:`, {
                  bridgeAddress: bridgeInstance.address,
                  bridgeType: bridgeInstance.type,
                  homeNetwork: bridgeInstance.homeNetwork,
                  foreignNetwork: bridgeInstance.foreignNetwork,
                  newEventsCount: newEvents.length,
                  cachedEventsCount: cachedEvents?.length || 0,
                  totalEventsCount: expatriationEvents.length,
                  firstEvent: newEvents.length > 0 ? {
                    transactionHash: newEvents[0].transactionHash,
                    blockNumber: newEvents[0].blockNumber,
                    senderAddress: newEvents[0].args?.[0],
                    amount: newEvents[0].args?.[1]?.toString()
                  } : null
                });
              }
              
              // Debug: Log first few events to see their structure
              if (expatriationEvents.length > 0) {
                console.log(`🔍 First NewExpatriation event structure:`, {
                  event: expatriationEvents[0],
                  args: expatriationEvents[0]?.args,
                  argsLength: expatriationEvents[0]?.args?.length,
                  // Array access (correct)
                  hasSenderAddress: !!expatriationEvents[0]?.args?.[0],
                  hasForeignAddress: !!expatriationEvents[0]?.args?.[3],
                  senderAddress: expatriationEvents[0]?.args?.[0],
                  foreignAddress: expatriationEvents[0]?.args?.[3],
                  // Object access (incorrect - for comparison)
                  hasSenderAddressObj: !!expatriationEvents[0]?.args?.sender_address,
                  hasForeignAddressObj: !!expatriationEvents[0]?.args?.foreign_address,
                  senderAddressObj: expatriationEvents[0]?.args?.sender_address,
                  foreignAddressObj: expatriationEvents[0]?.args?.foreign_address
                });
              }
            } catch (error) {
              console.log(`🔍 Error fetching NewExpatriation events from ${bridgeInstance.address}:`, error.message);
              // Fallback to cached events if available
              expatriationEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewExpatriation') || [];
            }
          }
          
          // Fetch NewRepatriation events (for Import/ImportWrapper bridges) - search from most recent blocks first
          let repatriationEvents = [];
          if (bridgeInstance.type === 'import' || bridgeInstance.type === 'import_wrapper') {
            try {
              // Get cached events first
              const cachedEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewRepatriation');
              
              // Use efficient chunked search from most recent blocks first
              // Use smaller chunk size for Ethereum to avoid rate limits
              const chunkSize = networkKey === 'ETHEREUM' ? 500 : 1000;
              const newEvents = await fetchEventsFromRecentBlocks(
                contract,
                contract.filters.NewRepatriation(),
                fromBlock,
                currentBlock,
                maxEventsPerBridge,
                chunkSize
              );
              
              // Merge with cached events
              repatriationEvents = mergeEvents(cachedEvents, newEvents);
              
              // Update cache with merged events
              setCachedEvents(networkKey, bridgeInstance.address, 'NewRepatriation', repatriationEvents);
              
              console.log(`🔍 Found ${newEvents.length} new + ${cachedEvents?.length || 0} cached = ${repatriationEvents.length} total NewRepatriation events from ${bridgeInstance.address}`);
              
              // Debug: Log first few events to see their structure
              if (repatriationEvents.length > 0) {
                console.log(`🔍 First NewRepatriation event structure:`, {
                  event: repatriationEvents[0],
                  args: repatriationEvents[0]?.args,
                  argsLength: repatriationEvents[0]?.args?.length,
                  // Array access (correct)
                  hasSenderAddress: !!repatriationEvents[0]?.args?.[0],
                  hasHomeAddress: !!repatriationEvents[0]?.args?.[3],
                  senderAddress: repatriationEvents[0]?.args?.[0],
                  homeAddress: repatriationEvents[0]?.args?.[3],
                  // Object access (incorrect - for comparison)
                  hasSenderAddressObj: !!repatriationEvents[0]?.args?.sender_address,
                  hasHomeAddressObj: !!repatriationEvents[0]?.args?.home_address,
                  senderAddressObj: repatriationEvents[0]?.args?.sender_address,
                  homeAddressObj: repatriationEvents[0]?.args?.home_address
                });
              }
            } catch (error) {
              console.log(`🔍 Error fetching NewRepatriation events from ${bridgeInstance.address}:`, error.message);
              // Fallback to cached events if available
              repatriationEvents = getCachedEvents(networkKey, bridgeInstance.address, 'NewRepatriation') || [];
            }
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
