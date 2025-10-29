/**
 * Test eth_getLogs method for Ethereum contract
 * Contract: 0x4f3a4e37701402C61146071309e45A15843025E1 (P3D Import Bridge on Ethereum)
 */

import { NETWORKS } from '../../config/networks.js';

const CONTRACT_ADDRESS = '0x4f3a4e37701402C61146071309e45A15843025E1';
const NETWORK_KEY = 'ETHEREUM';

async function testEthGetLogs() {
  console.log('🧪 Testing eth_getLogs method for Ethereum contract...');
  console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
  console.log(`Network: ${NETWORK_KEY}`);
  console.log('');

  try {
    // Get Ethereum network configuration
    const ethereumConfig = NETWORKS[NETWORK_KEY];
    if (!ethereumConfig) {
      throw new Error(`Network configuration not found for ${NETWORK_KEY}`);
    }

    console.log('📡 Network Configuration:');
    console.log(`  RPC URL: ${ethereumConfig.rpcUrl}`);
    console.log(`  Chain ID: ${ethereumConfig.id}`);
    console.log(`  Explorer: ${ethereumConfig.explorer}`);
    console.log('');

    // Prepare the eth_getLogs request
    const requestPayload = {
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [
        {
          fromBlock: "0x0",
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

    const response = await fetch(ethereumConfig.rpcUrl, {
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
      } else {
        console.log('  ℹ️ No logs found for this contract address');
        console.log('  This could mean:');
        console.log('    - The contract has no events emitted yet');
        console.log('    - The contract address is incorrect');
        console.log('    - The contract is not deployed at this address');
      }
    }

    console.log('');
    console.log('🎯 Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testEthGetLogs();
