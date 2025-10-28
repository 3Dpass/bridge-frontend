/**
 * Direct test of the txid fetching flow without importing bridge-contracts
 * This simulates the exact logic used in the production code
 */

import { ethers } from 'ethers';
import { NETWORKS } from '../../config/networks.js';

// Test configuration
const TEST_CONFIG = {
  name: 'Ethereum',
  bridgeAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // P3D Import Bridge
  networkKey: 'ETHEREUM',
  rpcUrl: NETWORKS.ETHEREUM.rpcUrl,
  chainId: NETWORKS.ETHEREUM.id
};

// Counterstake ABI
const COUNTERSTAKE_ABI = [
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  "function last_claim_num() view returns (uint64)",
  "function getClaim(uint claim_num) view returns (tuple(uint amount, address recipient_address, uint32 txts, uint32 ts, address claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake))"
];

// Simulate the getNewClaimEvents function logic
async function simulateGetNewClaimEvents(contract, limit, networkKey) {
  console.log('🔍 Simulating getNewClaimEvents function...');
  
  try {
    // Get current block number
    const currentBlock = await contract.provider.getBlockNumber();
    console.log(`  Current block: ${currentBlock}`);
    
    // Query recent blocks for NewClaim events (simulate the fallback approach)
    const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10000 blocks
    const toBlock = currentBlock;
    
    console.log(`  Querying events from block ${fromBlock} to ${toBlock}`);
    
    const filter = contract.filters.NewClaim();
    const events = await contract.queryFilter(filter, fromBlock, toBlock);
    
    console.log(`  Found ${events.length} NewClaim events`);
    
    // Process events (same as production)
    const processedEvents = [];
    for (const event of events) {
      const eventData = {
        claim_num: event.args.claim_num,
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
      processedEvents.push(eventData);
    }
    
    // Sort by claim number and return most recent
    const sortedEvents = processedEvents.sort((a, b) => a.claim_num.toNumber() - b.claim_num.toNumber());
    const recentEvents = sortedEvents.slice(-limit);
    
    console.log(`  Returning ${recentEvents.length} most recent events`);
    return recentEvents;
    
  } catch (error) {
    console.error('  Error in simulateGetNewClaimEvents:', error.message);
    return [];
  }
}

async function testDirectFlow() {
  console.log('🧪 ===== DIRECT FLOW TEST =====');
  console.log(`Testing ${TEST_CONFIG.name} network with bridge ${TEST_CONFIG.bridgeAddress}`);
  
  try {
    // Step 1: Create provider and contract
    const provider = new ethers.providers.JsonRpcProvider(TEST_CONFIG.rpcUrl, {
      name: TEST_CONFIG.name.toLowerCase(),
      chainId: TEST_CONFIG.chainId
    });
    
    const contract = new ethers.Contract(TEST_CONFIG.bridgeAddress, COUNTERSTAKE_ABI, provider);
    
    // Step 2: Get last claim number
    const lastClaimNum = await contract.last_claim_num();
    console.log(`🔍 Last claim number: ${lastClaimNum.toString()}`);
    
    // Step 3: Simulate getNewClaimEvents
    const newClaimEvents = await simulateGetNewClaimEvents(contract, 10, TEST_CONFIG.networkKey);
    
    console.log(`\n✅ Simulated getNewClaimEvents returned ${newClaimEvents.length} events`);
    
    if (newClaimEvents.length > 0) {
      console.log('\n🔍 NewClaim events details:');
      newClaimEvents.forEach((event, index) => {
        console.log(`\n  Event ${index + 1}:`);
        console.log(`    claim_num: ${event.claim_num?.toString()}`);
        console.log(`    txid: "${event.txid}"`);
        console.log(`    hasTxid: ${!!event.txid}`);
        console.log(`    txidType: ${typeof event.txid}`);
        console.log(`    txidLength: ${event.txid?.length}`);
        console.log(`    sender_address: "${event.sender_address}"`);
        console.log(`    recipient_address: ${event.recipient_address}`);
        console.log(`    amount: ${event.amount?.toString()}`);
        console.log(`    reward: ${event.reward?.toString()}`);
        console.log(`    blockNumber: ${event.blockNumber}`);
        console.log(`    transactionHash: ${event.transactionHash}`);
      });
    }
    
    // Step 4: Test the complete getAllClaims flow
    console.log('\n🔍 Step 4: Testing complete getAllClaims flow...');
    
    const limit = 5;
    const startClaim = Math.max(1, lastClaimNum.toNumber() - limit + 1);
    const endClaim = lastClaimNum.toNumber();
    
    console.log(`🔍 Checking claims from ${startClaim} to ${endClaim}`);
    
    const claims = [];
    
    for (let claimNum = endClaim; claimNum >= startClaim; claimNum--) {
      console.log(`\n🔍 Processing claim ${claimNum}...`);
      
      try {
        // Get claim details from contract
        const claimDetails = await contract.getClaim(claimNum);
        console.log(`  Claim details retrieved: ${!!claimDetails}`);
        
        if (claimDetails) {
          // Find corresponding NewClaim event
          const newClaimEvent = newClaimEvents.find(event => event.claim_num.toNumber() === claimNum);
          console.log(`  Found matching NewClaim event: ${!!newClaimEvent}`);
          
          if (newClaimEvent) {
            console.log(`  NewClaim event txid: "${newClaimEvent.txid}"`);
            console.log(`  NewClaim event hasTxid: ${!!newClaimEvent.txid}`);
          }
          
          // Create final claim object (same as production)
          const claimWithNumber = {
            claim_num: claimNum,
            amount: claimDetails[0],
            recipient_address: claimDetails[1],
            txts: claimDetails[2],
            ts: claimDetails[3],
            claimant_address: claimDetails[4],
            expiry_ts: claimDetails[5],
            period_number: claimDetails[6],
            current_outcome: claimDetails[7],
            is_large: claimDetails[8],
            withdrawn: claimDetails[9],
            finished: claimDetails[10],
            sender_address: claimDetails[11],
            data: claimDetails[12],
            yes_stake: claimDetails[13],
            no_stake: claimDetails[14],
            // Add txid from NewClaim event
            txid: newClaimEvent ? newClaimEvent.txid : null,
            reward: newClaimEvent ? newClaimEvent.reward : null,
            blockNumber: newClaimEvent ? newClaimEvent.blockNumber : null,
            claimTransactionHash: newClaimEvent ? newClaimEvent.transactionHash : null
          };
          
          console.log(`  Final claim txid: "${claimWithNumber.txid}"`);
          console.log(`  Final claim hasTxid: ${!!claimWithNumber.txid}`);
          
          claims.push(claimWithNumber);
        }
      } catch (claimError) {
        console.log(`  Error processing claim ${claimNum}: ${claimError.message}`);
      }
    }
    
    console.log(`\n✅ Processed ${claims.length} claims`);
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`  Total NewClaim events found: ${newClaimEvents.length}`);
    console.log(`  Total claims processed: ${claims.length}`);
    console.log(`  Claims with txid: ${claims.filter(c => !!c.txid).length}`);
    console.log(`  Claims without txid: ${claims.filter(c => !c.txid).length}`);
    
    if (claims.length > 0) {
      console.log('\n🔍 Sample final claims:');
      claims.slice(0, 3).forEach((claim, index) => {
        console.log(`\n  Claim ${index + 1}:`);
        console.log(`    claim_num: ${claim.claim_num}`);
        console.log(`    txid: "${claim.txid}"`);
        console.log(`    hasTxid: ${!!claim.txid}`);
        console.log(`    amount: ${claim.amount?.toString()}`);
        console.log(`    reward: ${claim.reward?.toString()}`);
        console.log(`    sender_address: "${claim.sender_address}"`);
        console.log(`    recipient_address: ${claim.recipient_address}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error in direct flow test:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testDirectFlow();
