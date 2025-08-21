const { ethers } = require('ethers');

// ImportWrapper ABI (just the functions we need for testing)
const IMPORT_WRAPPER_ABI = [
  'function home_network() view returns (string)',
  'function home_asset() view returns (string)',
  'function precompileAddress() view returns (address)',
  'function P3D_PRECOMPILE() view returns (address)',
  'function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)',
  'function oracleAddress() view returns (address)',
  'function min_price20() view returns (uint)',
  'function governance() view returns (address)',
  'function last_claim_num() view returns (uint64)',
  'function getRequiredStake(uint amount) view returns (uint)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
];

// 3DPass RPC URL (you may need to adjust this)
const RPC_URL = 'http://127.0.0.1:9978';

// Known ImportWrapper addresses
const KNOWN_IMPORT_WRAPPERS = [
  '0x8Ec164093319EAD78f6E289bb688Bef3c8ce9B0F', // USDT_IMPORT
  '0x1A85BD09E186b6EDc30D08Abb43c673A9636Cc4E', // USDC_IMPORT
  '0xccDdB081d48D7F312846ea4ECF18A963455c3C71'  // BUSD_IMPORT
];

/**
 * Test ImportWrapper bridge variables
 */
async function testImportWrapper(bridgeAddress) {
  console.log(`🧪 Testing ImportWrapper bridge at: ${bridgeAddress}`);
  
  try {
    // Create provider
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(bridgeAddress, IMPORT_WRAPPER_ABI, provider);
    
    // Test 1: Check if contract exists
    console.log('\n📋 Test 1: Contract existence');
    const code = await provider.getCode(bridgeAddress);
    if (code === '0x') {
      throw new Error('No contract deployed at this address');
    }
    console.log('✅ Contract exists at address');
    
    // Test 2: Basic state variables
    console.log('\n📋 Test 2: Basic state variables');
    try {
      const homeNetwork = await contract.home_network();
      console.log(`✅ home_network: ${homeNetwork}`);
    } catch (error) {
      console.log(`❌ home_network failed: ${error.message}`);
    }
    
    try {
      const homeAsset = await contract.home_asset();
      console.log(`✅ home_asset: ${homeAsset}`);
    } catch (error) {
      console.log(`❌ home_asset failed: ${error.message}`);
    }
    
    // Test 3: ImportWrapper-specific variables
    console.log('\n📋 Test 3: ImportWrapper-specific variables');
    try {
      const precompileAddress = await contract.precompileAddress();
      console.log(`✅ precompileAddress: ${precompileAddress}`);
    } catch (error) {
      console.log(`❌ precompileAddress failed: ${error.message}`);
    }
    
    try {
      const p3dPrecompile = await contract.P3D_PRECOMPILE();
      console.log(`✅ P3D_PRECOMPILE: ${p3dPrecompile}`);
    } catch (error) {
      console.log(`❌ P3D_PRECOMPILE failed: ${error.message}`);
    }
    
    // Test 4: Inherited Counterstake variables
    console.log('\n📋 Test 4: Inherited Counterstake variables');
    try {
      const settings = await contract.settings();
      console.log(`✅ settings.tokenAddress: ${settings.tokenAddress}`);
      console.log(`✅ settings.ratio100: ${settings.ratio100}`);
      console.log(`✅ settings.counterstake_coef100: ${settings.counterstake_coef100}`);
    } catch (error) {
      console.log(`❌ settings failed: ${error.message}`);
    }
    
    try {
      const oracleAddress = await contract.oracleAddress();
      console.log(`✅ oracleAddress: ${oracleAddress}`);
    } catch (error) {
      console.log(`❌ oracleAddress failed: ${error.message}`);
    }
    
    try {
      const minPrice20 = await contract.min_price20();
      console.log(`✅ min_price20: ${minPrice20}`);
    } catch (error) {
      console.log(`❌ min_price20 failed: ${error.message}`);
    }
    
    // Test 5: Governance
    console.log('\n📋 Test 5: Governance');
    try {
      const governance = await contract.governance();
      console.log(`✅ governance: ${governance}`);
    } catch (error) {
      console.log(`❌ governance failed: ${error.message}`);
    }
    
    // Test 6: ERC20 functions (should NOT exist)
    console.log('\n📋 Test 6: ERC20 functions (should NOT exist)');
    try {
      const name = await contract.name();
      console.log(`❌ name() exists: ${name} (this should fail for ImportWrapper)`);
    } catch (error) {
      console.log(`✅ name() correctly fails: ${error.message}`);
    }
    
    try {
      const symbol = await contract.symbol();
      console.log(`❌ symbol() exists: ${symbol} (this should fail for ImportWrapper)`);
    } catch (error) {
      console.log(`✅ symbol() correctly fails: ${error.message}`);
    }
    
    // Test 7: Claim functions
    console.log('\n📋 Test 7: Claim functions');
    try {
      const lastClaimNum = await contract.last_claim_num();
      console.log(`✅ last_claim_num: ${lastClaimNum}`);
    } catch (error) {
      console.log(`❌ last_claim_num failed: ${error.message}`);
    }
    
    // Test 8: Required stake calculation
    console.log('\n📋 Test 8: Required stake calculation');
    try {
      const requiredStake = await contract.getRequiredStake(ethers.utils.parseEther('1'));
      console.log(`✅ getRequiredStake(1 token): ${ethers.utils.formatEther(requiredStake)}`);
    } catch (error) {
      console.log(`❌ getRequiredStake failed: ${error.message}`);
    }
    
    console.log('\n🎉 ImportWrapper test completed!');
    
    return {
      success: true,
      bridgeAddress,
      contractType: 'ImportWrapper'
    };
    
  } catch (error) {
    console.error('❌ ImportWrapper test failed:', error);
    return {
      success: false,
      bridgeAddress,
      error: error.message
    };
  }
}

/**
 * Quick test for a specific address
 */
async function quickTest(address) {
  console.log(`🚀 Quick test for ${address}`);
  
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(address, [
      'function precompileAddress() view returns (address)',
      'function home_network() view returns (string)',
      'function name() view returns (string)',
      'function symbol() view returns (string)'
    ], provider);
    
    console.log('Testing precompileAddress()...');
    const precompileAddr = await contract.precompileAddress();
    console.log('✅ precompileAddress():', precompileAddr);
    
    console.log('Testing home_network()...');
    const homeNetwork = await contract.home_network();
    console.log('✅ home_network():', homeNetwork);
    
    console.log('Testing name() (should fail for ImportWrapper)...');
    try {
      const name = await contract.name();
      console.log('❌ name() succeeded:', name);
    } catch (error) {
      console.log('✅ name() correctly failed:', error.message);
    }
    
    console.log('Testing symbol() (should fail for ImportWrapper)...');
    try {
      const symbol = await contract.symbol();
      console.log('❌ symbol() succeeded:', symbol);
    } catch (error) {
      console.log('✅ symbol() correctly failed:', error.message);
    }
    
    console.log('🎉 Quick test completed! This appears to be an ImportWrapper contract.');
    
  } catch (error) {
    console.error('❌ Quick test failed:', error);
  }
}

/**
 * Test all known ImportWrapper addresses
 */
async function testAllImportWrappers() {
  console.log('🧪 Testing all known ImportWrapper addresses...\n');
  
  for (const address of KNOWN_IMPORT_WRAPPERS) {
    console.log(`\n${'='.repeat(60)}`);
    await testImportWrapper(address);
    console.log(`${'='.repeat(60)}\n`);
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('🚀 Starting ImportWrapper bridge tests...\n');
  
  // Test a specific address
  console.log('Testing specific address: 0x8Ec164093319EAD78f6E289bb688Bef3c8ce9B0F');
  await quickTest('0x8Ec164093319EAD78f6E289bb688Bef3c8ce9B0F');
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Test all known addresses
  await testAllImportWrappers();
}

// Run the tests
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testImportWrapper,
  quickTest,
  testAllImportWrappers
};
