import { ethers } from 'ethers';
import { NETWORKS } from '../config/networks';
import { estimateBlocksFromTimeframe, getBlockTime } from './block-estimator';

/**
 * Fetch last transfers (NewExpatriation and NewRepatriation events) from all networks
 * @param {Object} options - Configuration options
 * @param {Function} options.getNetworkWithSettings - Function to get network with settings
 * @param {Function} options.getBridgeInstancesWithSettings - Function to get bridge instances with settings
 * @param {number} options.timeframeHours - Timeframe in hours to check (default: 1)
 * @param {number} options.blocksToCheck - Number of blocks to check in history (fallback if timeframe not provided)
 * @returns {Promise<Array>} Array of transfer events with metadata
 */
export const fetchLastTransfers = async ({
  getNetworkWithSettings,
  getBridgeInstancesWithSettings,
  timeframeHours = 1,
  blocksToCheck = null
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
        networkBridgeInstances.map(b => ({ address: b.address, type: b.type }))
      );

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
      
      const fromBlock = Math.max(0, currentBlock - blocksToCheckForNetwork);
      
      console.log(`🔍 Checking blocks ${fromBlock} to ${currentBlock} for transfer events on ${networkKey} (${blocksToCheckForNetwork} blocks)`);
      
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
          
          // Fetch NewExpatriation events (for Export bridges)
          let expatriationEvents = [];
          if (bridgeInstance.type === 'export') {
            try {
              expatriationEvents = await contract.queryFilter(
                contract.filters.NewExpatriation(),
                fromBlock,
                currentBlock
              );
              console.log(`🔍 Found ${expatriationEvents.length} NewExpatriation events from ${bridgeInstance.address}`);
            } catch (error) {
              console.log(`🔍 Error fetching NewExpatriation events from ${bridgeInstance.address}:`, error.message);
            }
          }
          
          // Fetch NewRepatriation events (for Import/ImportWrapper bridges)
          let repatriationEvents = [];
          if (bridgeInstance.type === 'import' || bridgeInstance.type === 'import_wrapper') {
            try {
              repatriationEvents = await contract.queryFilter(
                contract.filters.NewRepatriation(),
                fromBlock,
                currentBlock
              );
              console.log(`🔍 Found ${repatriationEvents.length} NewRepatriation events from ${bridgeInstance.address}`);
            } catch (error) {
              console.log(`🔍 Error fetching NewRepatriation events from ${bridgeInstance.address}:`, error.message);
            }
          }
          
          // Process expatriation events
          for (const event of expatriationEvents) {
            const transferWithInfo = {
              // Event data
              eventType: 'NewExpatriation',
              senderAddress: event.args.sender_address,
              amount: event.args.amount,
              reward: event.args.reward,
              foreignAddress: event.args.foreign_address,
              data: event.args.data,
              
              // Event metadata
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              
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
              amount: transferWithInfo.amount.toString(),
              foreignAddress: transferWithInfo.foreignAddress,
              data: transferWithInfo.data,
              bridgeType: transferWithInfo.bridgeType,
              fromNetwork: transferWithInfo.fromNetwork,
              toNetwork: transferWithInfo.toNetwork,
              blockNumber: transferWithInfo.blockNumber,
              transactionHash: transferWithInfo.transactionHash
            });
            
            allTransfers.push(transferWithInfo);
          }
          
          // Process repatriation events
          for (const event of repatriationEvents) {
            const transferWithInfo = {
              // Event data
              eventType: 'NewRepatriation',
              senderAddress: event.args.sender_address,
              amount: event.args.amount,
              reward: event.args.reward,
              homeAddress: event.args.home_address,
              data: event.args.data,
              
              // Event metadata
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              
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
              amount: transferWithInfo.amount.toString(),
              homeAddress: transferWithInfo.homeAddress,
              data: transferWithInfo.data,
              bridgeType: transferWithInfo.bridgeType,
              fromNetwork: transferWithInfo.fromNetwork,
              toNetwork: transferWithInfo.toNetwork,
              blockNumber: transferWithInfo.blockNumber,
              transactionHash: transferWithInfo.transactionHash
            });
            
            allTransfers.push(transferWithInfo);
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
