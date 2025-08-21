const { ethers } = require('ethers');

// Import the bridge detection function
const { autoDetectBridge } = require('./src/utils/bridge-detector');

// 3DPass RPC URL
const RPC_URL = 'http://127.0.0.1:9978';

// Test addresses
const TEST_ADDRESSES = [
  '0x8Ec164093319EAD78f6E289bb688Bef3c8ce9B0F', // USDT_IMPORT (should be import_wrapper)
  '0x1A85BD09E186b6EDc30D08Abb43c673A9636Cc4E', // USDC_IMPORT (should be import_wrapper)
  '0xccDdB081d48D7F312846ea4ECF18A963455c3C71'  // BUSD_IMPORT (should be import_wrapper)
];

async function testBridgeDetection() {
  console.log('🚀 Testing Bridge Detection...\n');
  
  try {
    // Create provider
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    console.log('✅ Provider created successfully');
    
    for (const address of TEST_ADDRESSES) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing address: ${address}`);
      console.log(`${'='.repeat(60)}`);
      
      try {
        // Test the autoDetectBridge function
        const result = await autoDetectBridge(provider, address, 'THREEDPASS', {});
        
        console.log('Detection Result:');
        console.log('- Success:', result.success);
        console.log('- Bridge Type:', result.bridgeType);
        console.log('- Message:', result.message);
        
        if (result.success && result.bridgeConfig) {
          console.log('- Bridge Config:');
          console.log('  - Address:', result.bridgeConfig.address);
          console.log('  - Type:', result.bridgeConfig.type);
          console.log('  - Home Network:', result.bridgeConfig.homeNetwork);
          console.log('  - Home Token Symbol:', result.bridgeConfig.homeTokenSymbol);
          console.log('  - Foreign Network:', result.bridgeConfig.foreignNetwork);
          console.log('  - Foreign Token Symbol:', result.bridgeConfig.foreignTokenSymbol);
        }
        
      } catch (error) {
        console.error('❌ Detection failed:', error.message);
        console.error('Full error:', error);
      }
    }
    
  } catch (error) {
    console.error('❌ Test setup failed:', error);
  }
}

// Run the test
testBridgeDetection().catch(console.error);
