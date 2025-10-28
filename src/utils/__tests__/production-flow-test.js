/**
 * Test the complete production flow for txid fetching
 * This simulates the actual flow used in the application
 */

import { ethers } from 'ethers';
import { NETWORKS } from '../../config/networks.js';
import { getNewClaimEvents } from '../bridge-contracts.js';

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

async function testProductionFlow() {
  console.log('🧪 ===== PRODUCTION FLOW TEST =====');
  console.log(`Testing ${TEST_CONFIG.name} network with bridge ${TEST_CONFIG.bridgeAddress}`);
  
  try {
    // Step 1: Create provider and contract (same as production)
    const provider = new ethers.providers.JsonRpcProvider(TEST_CONFIG.rpcUrl, {
      name: TEST_CONFIG.name.toLowerCase(),
      chainId: TEST_CONFIG.chainId
    });
    
    const contract = new ethers.Contract(TEST_CONFIG.bridgeAddress, COUNTERSTAKE_ABI, provider);
    
    // Step 2: Get last claim number (same as production)
    const lastClaimNum = await contract.last_claim_num();
    console.log(`🔍 Last claim number: ${lastClaimNum.toString()}`);
    
    // Step 3: Test getNewClaimEvents function (production function)
    console.log('\n🔍 Step 3: Testing getNewClaimEvents function...');
    const newClaimEvents = await getNewClaimEvents(contract, 10, TEST_CONFIG.networkKey);
    
    console.log(`✅ getNewClaimEvents returned ${newClaimEvents.length} events`);
    
    if (newClaimEvents.length > 0) {
      console.log('\n🔍 NewClaim events from production function:');
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
      
      // Get claim details from contract
      const claimDetails = await contract.getClaim(claimNum);
      console.log(`  Claim details retrieved: ${!!claimDetails}`);
      
      if (claimDetails) {
        // Find corresponding NewClaim event
        const newClaimEvent = newClaimEvents.find(event => event.claim_num === claimNum);
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
    console.error('❌ Error in production flow test:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testProductionFlow();
