import { ethers } from 'ethers';
import { 
  ASSISTANT_FACTORY_ABI,
  EXPORT_ASSISTANT_ABI,
  COUNTERSTAKE_ABI
} from '../contracts/abi';
import { getBridgeInstanceByAddress, NETWORKS } from '../config/networks';

// 3DPass Bridge Contract Utilities

/**
 * Get the appropriate ABI for a network
 * @param {string} networkSymbol - Network symbol (ETH, BSC, 3DPass)
 * @param {string} contractType - 'export' or 'import_wrapper'
 * @returns {Array} Contract ABI
 */
export const getContractABI = (networkSymbol, contractType) => {
  // Always use the actual Counterstake ABI since all bridges use the same Counterstake contract
  return COUNTERSTAKE_ABI;
};

/**
 * Get bridge instance by address
 * @param {string} address - Bridge contract address
 * @returns {Object|null} Bridge instance or null if not found
 */
export const getBridgeInstance = (address) => {
  return getBridgeInstanceByAddress(address);
};

/**
 * Get bridge ABI based on bridge instance
 * @param {Object} bridgeInstance - Bridge instance from BRIDGE_INSTANCES
 * @returns {Array} Contract ABI
 */
export const getBridgeABI = (bridgeInstance) => {
  if (!bridgeInstance) return null;
  
  // Always use the actual Counterstake ABI since all bridges use the same Counterstake contract
  return COUNTERSTAKE_ABI;
};

/**
 * Create bridge contract instance
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @param {string} contractAddress - Contract address
 * @param {string} networkSymbol - Network symbol
 * @param {string} contractType - 'export' or 'import_wrapper'
 * @returns {ethers.Contract} Contract instance
 */
export const createBridgeContract = (providerOrSigner, contractAddress, networkSymbol, contractType) => {
  // Always use the actual Counterstake ABI since all bridges use the same Counterstake contract
  return new ethers.Contract(contractAddress, COUNTERSTAKE_ABI, providerOrSigner);
};

/**
 * Get required stake for a transfer
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} amount - Transfer amount
 * @param {number} transferTokenDecimals - Transfer token decimals
 * @param {number} stakeTokenDecimals - Stake token decimals
 * @returns {Promise<string>} Required stake amount
 */
export const getRequiredStake = async (contract, amount, transferTokenDecimals = 18, stakeTokenDecimals = 18) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, transferTokenDecimals);
    const requiredStakeWei = await contract.getRequiredStake(amountWei);
    return ethers.utils.formatUnits(requiredStakeWei, stakeTokenDecimals);
  } catch (error) {
    console.error('Error getting required stake:', error);
    throw new Error(`Failed to get required stake: ${error.message}`);
  }
};

/**
 * Get required stake in original token units (not P3D)
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} amount - Transfer amount
 * @param {number} transferTokenDecimals - Transfer token decimals
 * @returns {Promise<string>} Required stake amount in original token units
 */
export const getRequiredStakeInOriginalToken = async (contract, amount, transferTokenDecimals = 18) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, transferTokenDecimals);
    const requiredStakeWei = await contract.getRequiredStake(amountWei);
    
    // Convert stake from stake token to original token units
    // The stake is returned in P3D units, but we want to show it in original token units
    // So we format it using the original token decimals
    return ethers.utils.formatUnits(requiredStakeWei, transferTokenDecimals);
  } catch (error) {
    console.error('Error getting required stake in original token:', error);
    throw new Error(`Failed to get required stake in original token: ${error.message}`);
  }
};

/**
 * Transfer tokens to foreign chain (Export)
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} foreignAddress - Foreign address
 * @param {string} data - Additional data
 * @param {string} amount - Transfer amount
 * @param {string} reward - Reward amount (default: '0')
 * @param {number} decimals - Token decimals (default: 18)
 * @param {boolean} isPrecompile - Whether token is a precompile (default: false)
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const transferToForeignChain = async (
  contract, 
  foreignAddress, 
  data, 
  amount, 
  reward = '0', 
  decimals = 18,
  isPrecompile = false
) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    const rewardWei = ethers.utils.parseUnits(reward, decimals);
    
    // For precompile tokens, we need to handle differently
    if (isPrecompile) {
      // Precompile tokens are handled natively by the bridge
      const tx = await contract.transferToForeignChain(foreignAddress, data, amountWei, rewardWei);
      return await tx.wait();
    } else {
      // Regular ERC20 tokens
      const tx = await contract.transferToForeignChain(foreignAddress, data, amountWei, rewardWei);
      return await tx.wait();
    }
  } catch (error) {
    console.error('Error transferring to foreign chain:', error);
    throw new Error(`Failed to transfer to foreign chain: ${error.message}`);
  }
};

/**
 * Transfer tokens to home chain (Import Wrapper)
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} homeAddress - Home address
 * @param {string} data - Additional data
 * @param {string} amount - Transfer amount
 * @param {string} reward - Reward amount (default: '0')
 * @param {number} decimals - Token decimals (default: 18)
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const transferToHomeChain = async (
  contract, 
  homeAddress, 
  data, 
  amount, 
  reward = '0', 
  decimals = 18
) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    const rewardWei = ethers.utils.parseUnits(reward, decimals);
    
    const tx = await contract.transferToHomeChain(homeAddress, data, amountWei, rewardWei);
    return await tx.wait();
  } catch (error) {
    console.error('Error transferring to home chain:', error);
    throw new Error(`Failed to transfer to home chain: ${error.message}`);
  }
};

/**
 * Get bridge settings
 * @param {ethers.Contract} contract - Bridge contract instance
 * @returns {Promise<Object>} Bridge settings
 */
export const getBridgeSettings = async (contract) => {
  try {
    const settings = await contract.settings();
    return {
      tokenAddress: settings.tokenAddress,
      ratio100: settings.ratio100,
      counterstake_coef100: settings.counterstake_coef100,
      min_tx_age: settings.min_tx_age,
      min_stake: settings.min_stake,
      challenging_periods: settings.challenging_periods,
      large_challenging_periods: settings.large_challenging_periods,
      large_threshold: settings.large_threshold,
    };
  } catch (error) {
    console.error('Error getting bridge settings:', error);
    throw new Error(`Failed to get bridge settings: ${error.message}`);
  }
};

/**
 * Check if contract is a 3DPass contract
 * @param {ethers.Contract} contract - Contract instance
 * @returns {Promise<boolean>} True if 3DPass contract
 */
export const is3DPassContract = async (contract) => {
  try {
    // Check if contract has P3D_PRECOMPILE function (3DPass specific)
    await contract.P3D_PRECOMPILE();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get bridge token information
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @returns {Promise<Object>} Token information
 */
export const getBridgeTokenInfo = async (contract, provider) => {
  try {
    const settings = await getBridgeSettings(contract);
    const tokenAddress = settings.tokenAddress;
    
    // Check if it's a 3DPass precompile
    const is3DPass = await is3DPassContract(contract);
    
    if (is3DPass) {
      // For 3DPass precompiles, use the appropriate ABI
      const { get3DPassTokenMetadata } = await import('./threedpass');
      return await get3DPassTokenMetadata(provider, tokenAddress);
    } else {
      // For regular ERC20 tokens
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
        provider
      );
      
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals()
      ]);
      
      return {
        name,
        symbol,
        decimals,
        address: tokenAddress,
        isPrecompile: false
      };
    }
  } catch (error) {
    console.error('Error getting bridge token info:', error);
    throw new Error(`Failed to get bridge token info: ${error.message}`);
  }
};

/**
 * Validate bridge transfer parameters
 * @param {Object} params - Transfer parameters
 * @param {ethers.Contract} contract - Bridge contract instance
 * @returns {Promise<Object>} Validation result
 */
export const validateBridgeTransfer = async (params, contract) => {
  const { amount, recipient, data = '' } = params;
  const errors = [];
    
    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      errors.push('Invalid amount');
    }
    
  // Validate recipient address
  if (!recipient || !ethers.utils.isAddress(recipient)) {
    errors.push('Invalid recipient address');
  }

  // Validate data (optional)
  if (data && typeof data !== 'string') {
    errors.push('Invalid data format');
  }

  // Check if contract is valid
  try {
    await contract.settings();
  } catch (error) {
    errors.push('Invalid bridge contract');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get pending transfers for a user
 * @param {ethers.Contract} exportContract - Export bridge contract
 * @param {ethers.Contract} importContract - Import bridge contract
 * @param {string} userAddress - User address
 * @returns {Promise<Array>} Array of pending transfers
 */
export const getPendingTransfers = async (exportContract, importContract, userAddress) => {
  try {
    const pendingTransfers = [];
    
    // Get export transfers (outgoing)
    if (exportContract) {
      try {
    const exportFilter = exportContract.filters.NewExpatriation(userAddress);
    const exportEvents = await exportContract.queryFilter(exportFilter);
    
    for (const event of exportEvents) {
      const { sender_address, amount, reward, foreign_address, data } = event.args;
      const blockNumber = event.blockNumber;
      
      // Check if transfer is still pending (not claimed yet)
      const isClaimed = await checkIfTransferClaimed(exportContract, event.transactionHash);
      
      if (!isClaimed) {
        pendingTransfers.push({
          id: event.transactionHash,
          type: 'export',
          sender: sender_address,
          amount: ethers.utils.formatEther(amount),
          reward: ethers.utils.formatEther(reward),
          destinationAddress: foreign_address,
          data: data,
          blockNumber,
          timestamp: await getBlockTimestamp(exportContract.provider, blockNumber),
          status: 'pending',
          contract: exportContract,
        });
          }
        }
      } catch (error) {
        console.warn('Error getting export transfers:', error);
      }
    }
    
    // Get import transfers (incoming)
    if (importContract) {
      try {
    const importFilter = importContract.filters.NewRepatriation(userAddress);
    const importEvents = await importContract.queryFilter(importFilter);
    
    for (const event of importEvents) {
      const { sender_address, amount, reward, home_address, data } = event.args;
      const blockNumber = event.blockNumber;
      
      // Check if transfer is still pending (not claimed yet)
      const isClaimed = await checkIfTransferClaimed(importContract, event.transactionHash);
      
      if (!isClaimed) {
        pendingTransfers.push({
          id: event.transactionHash,
          type: 'import',
          sender: sender_address,
          amount: ethers.utils.formatEther(amount),
          reward: ethers.utils.formatEther(reward),
          destinationAddress: home_address,
          data: data,
          blockNumber,
          timestamp: await getBlockTimestamp(importContract.provider, blockNumber),
          status: 'pending',
          contract: importContract,
        });
          }
        }
      } catch (error) {
        console.warn('Error getting import transfers:', error);
      }
    }
    
    return pendingTransfers.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error getting pending transfers:', error);
    throw new Error(`Failed to get pending transfers: ${error.message}`);
  }
};

/**
 * Check if a transfer has been claimed
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} transferHash - Transfer hash
 * @returns {Promise<boolean>} True if claimed
 */
export const checkIfTransferClaimed = async (contract, transferHash) => {
  try {
    // This is a simplified check - in a real implementation, you'd need to
    // check the actual claim events or contract state
    const claimFilter = contract.filters.Claimed();
    const claimEvents = await contract.queryFilter(claimFilter);
    
    // Check if any claim event references this transfer
    for (const event of claimEvents) {
      if (event.transactionHash === transferHash) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if transfer claimed:', error);
    return false;
  }
};

/**
 * Get block timestamp
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {number} blockNumber - Block number
 * @returns {Promise<number>} Block timestamp
 */
export const getBlockTimestamp = async (provider, blockNumber) => {
  try {
    console.log(`🔍 Getting block timestamp for block ${blockNumber}`);
    const block = await provider.getBlock(blockNumber);
    
    console.log(`🔍 Block ${blockNumber} timestamp: ${block.timestamp} (${new Date(block.timestamp * 1000).toISOString()})`);
    
    return block.timestamp;
  } catch (error) {
    console.error(`❌ Error getting block timestamp for block ${blockNumber}:`, error);
    throw new Error(`Cannot get timestamp for block ${blockNumber}: ${error.message}`);
  }
};

/**
 * Claim a transfer using assistant contract
 * @param {ethers.Contract} assistantContract - Assistant contract instance
 * @param {Object} transfer - Transfer object
 * @param {string} claimerAddress - Claimer address
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const claimTransfer = async (assistantContract, transfer, claimerAddress) => {
  try {
    const { destinationAddress, data, amount, reward } = transfer;
    const amountWei = ethers.utils.parseEther(amount);
    const rewardWei = ethers.utils.parseEther(reward);
    
    // CRITICAL: Reward should be passed as int, not BigNumber for assistant claim function
    // The ABI expects "int reward", not "uint reward" - convert to integer
    const rewardInt = parseInt(rewardWei.toString());
    
    let tx;
    
    if (transfer.type === 'export') {
      // Claim export transfer
      tx = await assistantContract.claim(destinationAddress, data, amountWei, rewardInt);
    } else {
      // Claim import transfer
      tx = await assistantContract.claim(destinationAddress, data, amountWei, rewardInt);
    }
    
    return await tx.wait();
  } catch (error) {
    console.error('Error claiming transfer:', error);
    throw new Error(`Failed to claim transfer: ${error.message}`);
  }
};

/**
 * Get assistant contract for a bridge
 * @param {ethers.Contract} bridgeContract - Bridge contract instance
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantFactoryAddress - Assistant factory address
 * @returns {Promise<ethers.Contract|null>} Assistant contract or null
 */
export const getAssistantContract = async (bridgeContract, provider, assistantFactoryAddress) => {
  try {
    const factoryContract = new ethers.Contract(assistantFactoryAddress, ASSISTANT_FACTORY_ABI, provider);
    
    const bridgeAddress = bridgeContract.address;
    let assistantAddress;
    
    // Try to get export assistant first
    try {
      assistantAddress = await factoryContract.getExportAssistant(bridgeAddress);
    } catch (error) {
      // If not found, try import assistant
      try {
        assistantAddress = await factoryContract.getImportAssistant(bridgeAddress);
      } catch (error2) {
        return null;
      }
    }
    
    if (assistantAddress === ethers.constants.AddressZero) {
      return null;
    }
    
    // Determine which ABI to use based on the bridge contract
    const is3DPass = await is3DPassContract(bridgeContract);
    const abi = is3DPass ? EXPORT_ASSISTANT_ABI : EXPORT_ASSISTANT_ABI; // Use same ABI for now
    
    return new ethers.Contract(assistantAddress, abi, provider);
  } catch (error) {
    console.error('Error getting assistant contract:', error);
    return null;
  }
};

/**
 * Get transfer status
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} transferHash - Transfer hash
 * @returns {Promise<Object>} Transfer status
 */
export const getTransferStatus = async (contract, transferHash) => {
  try {
    const receipt = await contract.provider.getTransactionReceipt(transferHash);
    
    if (!receipt) {
      return { status: 'pending', confirmed: false };
    }
    
    if (receipt.status === 0) {
      return { status: 'failed', confirmed: true, error: 'Transaction failed' };
    }
    
    // Check if transfer has been claimed
    const isClaimed = await checkIfTransferClaimed(contract, transferHash);
    
    return {
      status: isClaimed ? 'claimed' : 'confirmed',
      confirmed: true,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (error) {
    console.error('Error getting transfer status:', error);
    return { status: 'unknown', confirmed: false, error: error.message };
  }
}; 

/**
 * Get claim details for a specific claim number
 * @param {ethers.Contract} contract - Counterstake contract instance
 * @param {number} claimNum - Claim number
 * @returns {Promise<Object|null>} Claim details or null if not found
 */
export const getClaimDetails = async (contract, claimNum, rpcUrl) => {
  try {
    console.log('🔍 getClaimDetails: Getting claim', claimNum, 'from contract:', contract.address);
    
    // Create a direct JsonRpcProvider using the provided RPC URL
    console.log('🔍 getClaimDetails: Using RPC URL:', rpcUrl);
    const directProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Use the same low-level call approach as the working script
    const encodedData = contract.interface.encodeFunctionData('getClaim(uint256)', [claimNum]);
    console.log('🔍 getClaimDetails: Encoded data:', encodedData);
    
    const result = await directProvider.call({
      to: contract.address,
      data: encodedData
    });
    
    console.log('🔍 getClaimDetails: Raw result from direct provider.call:', result);
    
    // Decode the successful result
    const decodedResult = contract.interface.decodeFunctionResult('getClaim(uint256)', result);
    console.log('🔍 getClaimDetails: Successfully decoded claim', claimNum, ':', decodedResult);
    
    if (decodedResult && decodedResult.length > 0) {
      return decodedResult[0]; // Return the decoded claim data
    }
    
    return null;
  } catch (error) {
    console.log('🔍 getClaimDetails: Full error object:', error);
    console.log('🔍 getClaimDetails: Error message:', error.message);
    console.log('🔍 getClaimDetails: Error code:', error.code);
    console.log('🔍 getClaimDetails: Error data:', error.data);
    console.log('🔍 getClaimDetails: Error reason:', error.reason);
    
    // Check if this is a revert indicating the claim doesn't exist
    if (error.message && error.message.includes('call revert exception')) {
      // If we have error.data, it means the call actually succeeded but ethers.js interpreted it as a revert
      // This often happens when the ABI doesn't match exactly or there's a decoding issue
      if (error.data && error.data !== '0x') {
        console.log('🔍 getClaimDetails: Call succeeded but ethers.js interpreted as revert. Raw data:', error.data);
        
        try {
          // Try to decode the raw data directly
          const decodedResult = contract.interface.decodeFunctionResult('getClaim(uint256)', error.data);
          console.log('🔍 getClaimDetails: Successfully decoded claim from error.data:', claimNum, ':', decodedResult);
          
          if (decodedResult && decodedResult.length > 0) {
            return decodedResult[0]; // Return the decoded claim data
          }
        } catch (decodeError) {
          console.log('🔍 getClaimDetails: Failed to decode error.data:', decodeError.message);
        }
      }
      
      console.log('🔍 getClaimDetails: Claim', claimNum, 'does not exist (revert)');
      return null;
    }
    
    console.log('🔍 getClaimDetails: Failed to decode claim', claimNum, ':', error.message);
    return null;
  }
};

/**
 * Get NewClaim events to extract txid information
 * @param {ethers.Contract} contract - Counterstake contract instance
 * @param {number} limit - Maximum number of events to fetch (default: 100)
 * @returns {Promise<Array>} Array of NewClaim events with txid
 */
export const getNewClaimEvents = async (contract, limit = 100, claimSearchDepth = 1, networkKey = null) => {
  try {
    console.log('🚀 getNewClaimEvents: STARTING - Getting NewClaim events from contract:', contract.address);
    console.log('🚀 getNewClaimEvents: Parameters - limit:', limit, 'claimSearchDepth:', claimSearchDepth, 'networkKey:', networkKey);
    
    // Get the last claim number to determine the range
    const lastClaimNum = await contract.last_claim_num();
    const startClaim = Math.max(1, lastClaimNum.toNumber() - limit + 1);
    const endClaim = lastClaimNum.toNumber();
    
    console.log('🚀 getNewClaimEvents: Checking NewClaim events from', startClaim, 'to', endClaim, 'lastClaimNum:', lastClaimNum.toString());
    
    // Get current block number to limit the query range
    const provider = contract.provider;
    const currentBlock = await provider.getBlockNumber();
    
    // Query events using the Claim Search Depth setting for consistency
    // Calculate block range based on time and network block time
    let fromBlock;
    if (networkKey && NETWORKS[networkKey]) {
      const blockTime = NETWORKS[networkKey].blockTime || 12; // seconds per block
      const blocksPerHour = 3600 / blockTime;
      const maxBlocks = Math.floor(claimSearchDepth * blocksPerHour);
      fromBlock = Math.max(0, currentBlock - maxBlocks);
      console.log(`🚀 getNewClaimEvents: Using Claim Search Depth (${claimSearchDepth}h) = ${maxBlocks} blocks for ${networkKey}`);
    } else {
      // Fallback to a reasonable default if network info is not available
      const defaultBlockTime = 12; // seconds per block
      const blocksPerHour = 3600 / defaultBlockTime;
      const maxBlocks = Math.floor(claimSearchDepth * blocksPerHour);
      fromBlock = Math.max(0, currentBlock - maxBlocks);
      console.log(`🚀 getNewClaimEvents: Using default block time (12s) for Claim Search Depth (${claimSearchDepth}h) = ${maxBlocks} blocks`);
    }
    
    console.log('🚀 getNewClaimEvents: Querying events from block', fromBlock, 'to', currentBlock);
    
    try {
      // Try to get recent NewClaim events with block range limit
      const allEvents = await contract.queryFilter(
        contract.filters.NewClaim(),
        fromBlock,
        currentBlock
      );
      
      console.log('🚀 getNewClaimEvents: Found', allEvents.length, 'NewClaim events in recent blocks');
      
      // If we found events, process and return them
      if (allEvents.length > 0) {
        // Sort by claim number and return the most recent ones
        const sortedEvents = allEvents.sort((a, b) => a.args.claim_num.toNumber() - b.args.claim_num.toNumber());
        const recentEvents = sortedEvents.slice(-limit);
        
        const events = [];
        for (const event of recentEvents) {
          const claimNum = event.args.claim_num.toNumber();
          const eventData = {
            claim_num: claimNum,
            author_address: event.args.author_address,
            sender_address: event.args.sender_address,
            recipient_address: event.args.recipient_address,
            txid: event.args.txid,
            txts: event.args.txts,
            amount: event.args.amount,
            reward: event.args.reward,
            stake: event.args.stake,
            data: event.args.data,
            expiry_ts: event.args.expiry_ts,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex
          };
          events.push(eventData);
          console.log('🔍 getNewClaimEvents: Found NewClaim event for claim', claimNum, 'with txid:', eventData.txid);
        }
        
        console.log('🚀 getNewClaimEvents: Returning', events.length, 'most recent events');
        return events;
      }
      
    } catch (recentError) {
      console.log('🔍 getNewClaimEvents: Recent events query failed:', recentError.message);
    }
    
    // Fallback: try to get events for each claim individually with a much larger block range
    console.log('🔍 getNewClaimEvents: Trying fallback method with larger block range...');
    
    const events = [];
    for (let claimNum = startClaim; claimNum <= endClaim; claimNum++) {
      try {
        const filter = contract.filters.NewClaim(claimNum);
        // Use a much larger block range for individual queries (5x the normal range)
        let fallbackFromBlock;
        if (networkKey && NETWORKS[networkKey]) {
          const blockTime = NETWORKS[networkKey].blockTime || 12;
          const blocksPerHour = 3600 / blockTime;
          const maxBlocks = Math.floor(claimSearchDepth * blocksPerHour * 5); // 5x larger for fallback
          fallbackFromBlock = Math.max(0, currentBlock - maxBlocks);
        } else {
          const defaultBlockTime = 12;
          const blocksPerHour = 3600 / defaultBlockTime;
          const maxBlocks = Math.floor(claimSearchDepth * blocksPerHour * 5); // 5x larger for fallback
          fallbackFromBlock = Math.max(0, currentBlock - maxBlocks);
        }
        const claimEvents = await Promise.race([
          contract.queryFilter(filter, fallbackFromBlock, currentBlock),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Individual query timeout')), 10000))
        ]);
        
        for (const event of claimEvents) {
          const eventData = {
            claim_num: claimNum,
            author_address: event.args.author_address,
            sender_address: event.args.sender_address,
            recipient_address: event.args.recipient_address,
            txid: event.args.txid,
            txts: event.args.txts,
            amount: event.args.amount,
            reward: event.args.reward,
            stake: event.args.stake,
            data: event.args.data,
            expiry_ts: event.args.expiry_ts,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex
          };
          events.push(eventData);
          console.log('🔍 getNewClaimEvents: Found NewClaim event for claim', claimNum, 'with txid:', eventData.txid);
        }
      } catch (individualError) {
        console.log(`🔍 getNewClaimEvents: Failed to get event for claim ${claimNum}:`, individualError.message);
        // Continue with next claim
      }
    }
    
    console.log('🚀 getNewClaimEvents: Total NewClaim events found via fallback:', events.length);
    return events;
  } catch (error) {
    console.error('❌ Error getting NewClaim events:', error);
    return [];
  } finally {
    console.log('🚀 getNewClaimEvents: FUNCTION COMPLETED');
  }
};

/**
 * Get all claims for a contract (up to a limit)
 * @param {ethers.Contract} contract - Counterstake contract instance
 * @param {number} limit - Maximum number of claims to fetch (default: 100)
 * @returns {Promise<Array>} Array of claim details
 */
export const getAllClaims = async (contract, limit = 100, rpcUrl, claimSearchDepth = 1, networkKey = null) => {
  try {
    console.log('🔍 getAllClaims: Getting last_claim_num from contract:', contract.address);
    
    // Use the same direct provider approach as the working script
    const directProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Create a contract instance with the direct provider for reading
    const directContract = new ethers.Contract(contract.address, contract.interface, directProvider);
    
    const lastClaimNum = await directContract.last_claim_num();
    console.log('🔍 getAllClaims: last_claim_num result:', lastClaimNum.toString());
    
    // Get NewClaim events to extract txid information
    console.log('🚀 getAllClaims: About to call getNewClaimEvents with parameters:', { limit, claimSearchDepth, networkKey });
    const newClaimEvents = await getNewClaimEvents(contract, limit, claimSearchDepth, networkKey);
    console.log('🚀 getAllClaims: getNewClaimEvents returned', newClaimEvents.length, 'events');
    console.log('🔍 getAllClaims: Got NewClaim events:', newClaimEvents.length);
    console.log('🔍 getAllClaims: NewClaim events details:', newClaimEvents.map(event => ({
      claim_num: event.claim_num,
      txid: event.txid,
      hasTxid: !!event.txid
    })));
    
    const claims = [];
    
    // Start from the most recent claims and work backwards
    const startClaim = Math.max(1, lastClaimNum.toNumber() - limit + 1);
    const endClaim = lastClaimNum.toNumber();
    
    console.log('🔍 getAllClaims: Checking claims from', startClaim, 'to', endClaim);
    
    for (let claimNum = endClaim; claimNum >= startClaim; claimNum--) {
      console.log('🔍 getAllClaims: Checking claim number:', claimNum);
      const claimDetails = await getClaimDetails(contract, claimNum, rpcUrl);
      if (claimDetails) {
        console.log('🔍 getAllClaims: Found claim:', claimNum, claimDetails);
        
        // Find the corresponding NewClaim event to get the txid, reward, and blockNumber
        const newClaimEvent = newClaimEvents.find(event => event.claim_num === claimNum);
        console.log('🔍 getAllClaims: Looking for NewClaim event for claim', claimNum, ':', {
          foundEvent: !!newClaimEvent,
          eventDetails: newClaimEvent ? {
            claim_num: newClaimEvent.claim_num,
            txid: newClaimEvent.txid,
            hasTxid: !!newClaimEvent.txid
          } : null,
          availableEvents: newClaimEvents.map(e => ({ claim_num: e.claim_num, hasTxid: !!e.txid }))
        });
        
        let txid = newClaimEvent ? newClaimEvent.txid : null;
        let reward = newClaimEvent ? newClaimEvent.reward : null;
        let blockNumber = newClaimEvent ? newClaimEvent.blockNumber : null;
        let claimTransactionHash = newClaimEvent ? newClaimEvent.transactionHash : null;
        
        // If we couldn't get txid from NewClaim event, try to get it from the claim data itself
        if (!txid && claimDetails.txid) {
          txid = claimDetails.txid;
          console.log('🔍 getAllClaims: Claim', claimNum, 'txid from claim data:', txid);
        } else if (newClaimEvent) {
          console.log('🔍 getAllClaims: Claim', claimNum, 'txid from NewClaim event:', txid);
        } else {
          console.log('🔍 getAllClaims: Claim', claimNum, 'no txid available - no matching NewClaim event found');
        }
        
        // Add the claim number, txid, reward, blockNumber, and claim transaction hash to the claim details
        const claimWithNumber = {
          ...claimDetails,
          claim_num: claimNum,
          txid: txid, // Add the txid from the NewClaim event
          reward: reward, // Add the reward from the NewClaim event
          blockNumber: blockNumber, // Add the blockNumber from the NewClaim event
          claimTransactionHash: claimTransactionHash // Add the transaction hash from the NewClaim event
        };
        console.log('🔍 getAllClaims: Added claim with number, txid, reward, blockNumber, and claim transaction hash:', {
          claimNum: claimNum,
          txid: txid,
          reward: reward,
          blockNumber: blockNumber,
          claimTransactionHash: claimTransactionHash,
          claimWithNumber: claimWithNumber,
          hasClaimNum: !!claimWithNumber.claim_num,
          hasTxid: !!claimWithNumber.txid,
          hasReward: !!claimWithNumber.reward,
          hasBlockNumber: !!claimWithNumber.blockNumber,
          hasClaimTransactionHash: !!claimWithNumber.claimTransactionHash
        });
        claims.push(claimWithNumber);
      } else {
        console.log('🔍 getAllClaims: Claim not found:', claimNum);
      }
    }
    
    console.log('🔍 getAllClaims: Total claims found:', claims.length);
    return claims;
  } catch (error) {
    console.error('❌ Error getting all claims:', error);
    return [];
  }
};

/**
 * Get claims for a specific recipient address
 * @param {ethers.Contract} contract - Counterstake contract instance
 * @param {string} recipientAddress - Recipient address to filter by
 * @param {number} limit - Maximum number of claims to fetch (default: 100)
 * @returns {Promise<Array>} Array of claim details for the recipient
 */
export const getClaimsForRecipient = async (contract, recipientAddress, limit = 100, rpcUrl, claimSearchDepth = 1, networkKey = null) => {
  try {
    const allClaims = await getAllClaims(contract, limit, rpcUrl, claimSearchDepth, networkKey);
    return allClaims.filter(claim => 
      claim.recipient_address.toLowerCase() === recipientAddress.toLowerCase()
    );
  } catch (error) {
    console.error('Error getting claims for recipient:', error);
    return [];
  }
};

/**
 * Create a Counterstake contract instance
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @param {string} contractAddress - Contract address
 * @returns {Promise<ethers.Contract>} Counterstake contract instance
 */
export const createCounterstakeContract = async (providerOrSigner, contractAddress) => {
  try {
    // Check if provider/signer is valid
    if (!providerOrSigner) {
      throw new Error('Provider or signer is required');
    }
    
    // Check if contract address is valid
    if (!contractAddress || !ethers.utils.isAddress(contractAddress)) {
      throw new Error('Invalid contract address');
    }
    
    const { COUNTERSTAKE_ABI } = await import('../contracts/abi');
    console.log('🔍 COUNTERSTAKE_ABI loaded:', COUNTERSTAKE_ABI ? 'yes' : 'no');
    console.log('🔍 COUNTERSTAKE_ABI length:', COUNTERSTAKE_ABI?.length);
    
    if (!COUNTERSTAKE_ABI) {
      throw new Error('Failed to load COUNTERSTAKE_ABI');
    }
    
    const contract = new ethers.Contract(contractAddress, COUNTERSTAKE_ABI, providerOrSigner);
    console.log('🔍 Contract created with address:', contract.address);
    console.log('🔍 Contract interface functions:', Object.keys(contract.interface.functions || {}));
    return contract;
  } catch (error) {
    console.error('Error creating Counterstake contract:', error);
    throw error;
  }
}; 