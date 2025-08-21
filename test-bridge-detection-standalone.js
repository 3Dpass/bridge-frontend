const { ethers } = require('ethers');

// Bridge type constants
const BRIDGE_TYPES = {
  EXPORT: 'export',
  IMPORT: 'import',
  IMPORT_WRAPPER: 'import_wrapper'
};

// ABIs for testing
const EXPORT_ABI = [
  'function foreign_network() view returns (string)',
  'function foreign_asset() view returns (address)',
  'function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)'
];

const IMPORT_ABI = [
  'function home_network() view returns (string)',
  'function home_asset() view returns (address)',
  'function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
];

const IMPORT_WRAPPER_ABI = [
  'function home_network() view returns (string)',
  'function home_asset() view returns (address)',
  'function precompileAddress() view returns (address)',
  'function P3D_PRECOMPILE() view returns (address)',
  'function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)'
];

// 3DPass RPC URL
const RPC_URL = 'http://127.0.0.1:9978';

// Test addresses
const TEST_ADDRESSES = [
  '0x8Ec164093319EAD78f6E289bb688Bef3c8ce9B0F', // USDT_IMPORT (should be import_wrapper)
  '0x1A85BD09E186b6EDc30D08Abb43c673A9636Cc4E', // USDC_IMPORT (should be import_wrapper)
  '0xccDdB081d48D7F312846ea4ECF18A963455c3C71'  // BUSD_IMPORT (should be import_wrapper)
];

/**
 * Detect bridge type by analyzing constructor parameters
 */
async function detectBridgeType(provider, bridgeAddress) {
  try {
    console.log(`🔍 Detecting bridge type for address: ${bridgeAddress}`);
    
    // Try EXPORT first (most distinct)
    try {
      console.log(`  Trying EXPORT...`);
      const exportContract = new ethers.Contract(bridgeAddress, EXPORT_ABI, provider);
      await exportContract.foreign_network();
      console.log(`  ✅ EXPORT detected!`);
      return BRIDGE_TYPES.EXPORT;
    } catch (error) {
      console.log(`  ❌ Not EXPORT: ${error.message}`);
    }
    
    // Both IMPORT and IMPORT_WRAPPER have home_network(), so we need to distinguish them
    // Try to call home_network() first to confirm it's an import-type bridge
    let homeNetwork;
    try {
      console.log(`  Checking if it's an import-type bridge...`);
      const importContract = new ethers.Contract(bridgeAddress, IMPORT_ABI, provider);
      homeNetwork = await importContract.home_network();
      console.log(`  ✅ Confirmed import-type bridge with home_network: ${homeNetwork}`);
    } catch (error) {
      console.log(`  ❌ Not an import-type bridge: ${error.message}`);
      throw new Error('Unable to detect bridge type');
    }
    
    // Now try to distinguish between IMPORT and IMPORT_WRAPPER
    // Try IMPORT_WRAPPER-specific functions with better error handling
    try {
      console.log(`  Trying IMPORT_WRAPPER-specific functions...`);
      const importWrapperContract = new ethers.Contract(bridgeAddress, IMPORT_WRAPPER_ABI, provider);
      
      // Try precompileAddress() first (most reliable)
      try {
        const precompileAddr = await importWrapperContract.precompileAddress();
        console.log(`  ✅ IMPORT_WRAPPER detected! precompileAddress: ${precompileAddr}`);
        return BRIDGE_TYPES.IMPORT_WRAPPER;
      } catch (error) {
        console.log(`  ❌ precompileAddress() failed: ${error.message}`);
      }
      
      // Try P3D_PRECOMPILE() as fallback
      try {
        const p3dPrecompile = await importWrapperContract.P3D_PRECOMPILE();
        console.log(`  ✅ IMPORT_WRAPPER detected via P3D_PRECOMPILE: ${p3dPrecompile}`);
        return BRIDGE_TYPES.IMPORT_WRAPPER;
      } catch (error) {
        console.log(`  ❌ P3D_PRECOMPILE() failed: ${error.message}`);
      }
      
      // Try to check if it has ERC20 functions (Import has them, ImportWrapper doesn't)
      try {
        console.log(`  Checking if it has ERC20 functions (Import vs ImportWrapper)...`);
        const erc20Contract = new ethers.Contract(bridgeAddress, ['function name() view returns (string)', 'function symbol() view returns (string)'], provider);
        await erc20Contract.name();
        console.log(`  ✅ Has ERC20 functions - assuming regular IMPORT`);
        return BRIDGE_TYPES.IMPORT;
      } catch (error) {
        console.log(`  ❌ No ERC20 functions - assuming IMPORT_WRAPPER`);
        return BRIDGE_TYPES.IMPORT_WRAPPER;
      }
      
    } catch (error) {
      console.log(`  ❌ IMPORT_WRAPPER detection failed: ${error.message}`);
      console.log(`  ✅ Assuming regular IMPORT`);
      return BRIDGE_TYPES.IMPORT;
    }
    
  } catch (error) {
    console.error('Error detecting bridge type:', error);
    throw new Error(`Failed to detect bridge type: ${error.message}`);
  }
}

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
        // Test the bridge type detection
        const bridgeType = await detectBridgeType(provider, address);
        
        console.log('\n🎯 Detection Result:');
        console.log('- Bridge Type:', bridgeType);
        console.log('- Expected:', 'import_wrapper');
        console.log('- Correct:', bridgeType === 'import_wrapper' ? '✅ YES' : '❌ NO');
        
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
