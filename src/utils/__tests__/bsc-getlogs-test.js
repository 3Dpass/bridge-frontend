/**
 * Test eth_getLogs method for BSC contract
 * Contract: 0x078E7A2037b63846836E9d721cf2dabC08b94281 (P3D Import Bridge on BSC)
 */

import { NETWORKS } from '../../config/networks.js';

const CONTRACT_ADDRESS = '0x078E7A2037b63846836E9d721cf2dabC08b94281';
const NETWORK_KEY = 'BSC';

async function testBscGetLogs() {
  console.log('🧪 Testing eth_getLogs method for BSC contract...');
  console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
  console.log(`Network: ${NETWORK_KEY}`);
  console.log('');

  try {
    // Get BSC network configuration
    const bscConfig = NETWORKS[NETWORK_KEY];
    if (!bscConfig) {
      throw new Error(`Network configuration not found for ${NETWORK_KEY}`);
    }

    console.log('📡 Network Configuration:');
    console.log(`  RPC URL: ${bscConfig.rpcUrl}`);
    console.log(`  Chain ID: ${bscConfig.id}`);
    console.log(`  Explorer: ${bscConfig.explorer}`);
    console.log('');

    // First, get the latest block number to use a more recent range
    console.log('🔍 Getting latest block number...');
    const latestBlockResponse = await fetch(bscConfig.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1
      })
    });
    
    const latestBlockResult = await latestBlockResponse.json();
    const latestBlock = parseInt(latestBlockResult.result, 16);
    const startBlock = Math.max(0, latestBlock - 50000); // Start from 50,000 blocks ago (within BSC limit)
    
    console.log(`  Latest Block: ${latestBlock}`);
    console.log(`  Start Block: ${startBlock} (0x${startBlock.toString(16)})`);
    console.log('');

    // Prepare the eth_getLogs request with a more recent block range
    const requestPayload = {
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [
        {
          fromBlock: `0x${startBlock.toString(16)}`,
          toBlock: "latest",
          address: CONTRACT_ADDRESS,
          topics: []
        }
      ],
      id: 1
    };

    console.log('📤 Request Payload:');
    console.log(JSON.stringify(requestPayload, null, 2));
    console.log('');

    // Make the request
    console.log('🚀 Making eth_getLogs request...');
    const startTime = Date.now();

    const response = await fetch(bscConfig.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload)
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    console.log('✅ Request completed successfully!');
    console.log(`⏱️ Duration: ${duration}ms`);
    console.log('');

    // Display results
    console.log('📊 Response Analysis:');
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Response ID: ${result.id}`);
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error.message}`);
      console.log(`  Error Code: ${result.error.code}`);
    } else {
      const logs = result.result || [];
      console.log(`  ✅ Success: Found ${logs.length} log entries`);
      
      if (logs.length > 0) {
        console.log('');
        console.log('📋 Log Details:');
        
        // Group logs by event signature (first topic)
        const eventGroups = {};
        logs.forEach((log, index) => {
          const eventSignature = log.topics[0] || 'anonymous';
          if (!eventGroups[eventSignature]) {
            eventGroups[eventSignature] = [];
          }
          eventGroups[eventSignature].push({ index, log });
        });

        console.log(`  Event Types Found: ${Object.keys(eventGroups).length}`);
        console.log('');

        // Display summary by event type
        Object.entries(eventGroups).forEach(([signature, groupLogs]) => {
          console.log(`  📝 Event: ${signature}`);
          console.log(`    Count: ${groupLogs.length}`);
          console.log(`    Block Range: ${groupLogs[0].log.blockNumber} - ${groupLogs[groupLogs.length - 1].log.blockNumber}`);
          
          // Show sample log details
          if (groupLogs.length > 0) {
            const sampleLog = groupLogs[0].log;
            console.log(`    Sample Log:`);
            console.log(`      Block: ${sampleLog.blockNumber} (${parseInt(sampleLog.blockNumber, 16)})`);
            console.log(`      Transaction: ${sampleLog.transactionHash}`);
            console.log(`      Log Index: ${sampleLog.logIndex}`);
            console.log(`      Topics: ${sampleLog.topics.length}`);
            console.log(`      Data Length: ${sampleLog.data.length} characters`);
          }
          console.log('');
        });

        // Show recent logs (last 5)
        if (logs.length > 0) {
          console.log('🕒 Recent Logs (Last 5):');
          const recentLogs = logs.slice(-5);
          recentLogs.forEach((log, index) => {
            const logNumber = logs.length - 5 + index + 1;
            console.log(`  ${logNumber}. Block ${parseInt(log.blockNumber, 16)} - ${log.transactionHash.substring(0, 10)}...`);
          });
        }

        // Event signature analysis
        console.log('');
        console.log('🔍 Event Signature Analysis:');
        Object.entries(eventGroups).forEach(([signature, groupLogs]) => {
          let eventName = 'Unknown Event';
          
          // Common ERC20 and bridge event signatures
          switch (signature) {
            case '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
              eventName = 'Transfer (ERC20)';
              break;
            case '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925':
              eventName = 'Approval (ERC20)';
              break;
            case '0x1ea767f4ded010b74d77c472069320fb2964c6e1bdb734785d4cbca1aec10323':
              eventName = 'NewClaim (Bridge)';
              break;
            case '0xb4096a3b39efa6fa23e55edafbb26c619699ce4eb0b8f8c0178b1a4919ac6736':
              eventName = 'NewRepatriation (Bridge)';
              break;
            case '0xb29fe5d66641f291db1657da090dd1ebad21e549868d3514b7a7c57c99a68671':
              eventName = 'NewExpatriation (Bridge)';
              break;
            default:
              eventName = `Unknown (${signature.substring(0, 10)}...)`;
          }
          
          console.log(`  ${eventName}: ${groupLogs.length} occurrences`);
        });
      } else {
        console.log('  ℹ️ No logs found for this contract address');
        console.log('  This could mean:');
        console.log('    - The contract has no events emitted yet');
        console.log('    - The contract address is incorrect');
        console.log('    - The contract is not deployed at this address');
      }
    }

    console.log('');
    console.log('🎯 BSC Test completed successfully!');

  } catch (error) {
    console.error('❌ BSC Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testBscGetLogs();
