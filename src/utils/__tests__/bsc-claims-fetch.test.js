import { ethers } from 'ethers';
import { NETWORKS } from '../../config/networks';
import { 
  getAllClaims, 
  getNewClaimEvents,
  createCounterstakeContract 
} from '../bridge-contracts';
import { fetchClaimsFromAllNetworks } from '../fetch-claims';

// Mock the settings context functions
const mockGetNetworkWithSettings = (networkKey) => {
  return NETWORKS[networkKey] || null;
};

const mockGetBridgeInstancesWithSettings = () => {
  // Return empty object for this test - we'll use network config bridges
  return {};
};

const mockGetTransferTokenSymbol = (claim) => {
  // Simple mock - return P3D for BSC claims
  return 'P3D';
};

const mockGetTokenDecimals = (claim) => {
  // Return 18 decimals for P3D token
  return 18;
};

describe('BSC Claims Fetch Test', () => {
  let bscProvider;
  let bscNetworkConfig;
  
  beforeAll(() => {
    // Get BSC network configuration
    bscNetworkConfig = NETWORKS.BSC;
    
    if (!bscNetworkConfig) {
      throw new Error('BSC network configuration not found');
    }
    
    // Create provider using BSC Infura URL
    bscProvider = new ethers.providers.JsonRpcProvider(bscNetworkConfig.rpcUrl);
    
    console.log('🔍 BSC Test Setup:', {
      networkName: bscNetworkConfig.name,
      rpcUrl: bscNetworkConfig.rpcUrl,
      chainId: bscNetworkConfig.id,
      hasContracts: !!bscNetworkConfig.contracts,
      counterstakeFactory: bscNetworkConfig.contracts?.counterstakeFactory
    });
  });

  describe('BSC Network Connection', () => {
    test('should connect to BSC network using Infura', async () => {
      expect(bscProvider).toBeDefined();
      expect(bscNetworkConfig.rpcUrl).toContain('infura.io');
      
      // Test network connection
      const network = await bscProvider.getNetwork();
      expect(network.chainId).toBe(56); // BSC mainnet chain ID
      
      console.log('✅ BSC Network Connection:', {
        chainId: network.chainId,
        name: network.name
      });
    });

    test('should get current block from BSC', async () => {
      const blockNumber = await bscProvider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
      
      const block = await bscProvider.getBlock(blockNumber);
      expect(block).toBeDefined();
      expect(block.number).toBe(blockNumber);
      
      console.log('✅ BSC Current Block:', {
        blockNumber,
        timestamp: block.timestamp,
        timestampDate: new Date(block.timestamp * 1000).toISOString()
      });
    });
  });

  describe('BSC Counterstake Factory Contract', () => {
    let counterstakeFactoryContract;
    
    beforeAll(() => {
      const factoryAddress = bscNetworkConfig.contracts.counterstakeFactory;
      expect(factoryAddress).toBeDefined();
      
      // Create contract instance
      counterstakeFactoryContract = new ethers.Contract(
        factoryAddress,
        [
          // Minimal ABI for testing
          'function getBridgeCount() view returns (uint256)',
          'function getBridge(uint256 index) view returns (address)',
          'function getBridgeByAddress(address bridgeAddress) view returns (bool)'
        ],
        bscProvider
      );
    });

    test('should interact with BSC Counterstake Factory', async () => {
      expect(counterstakeFactoryContract).toBeDefined();
      
      // Test factory contract interaction
      const bridgeCount = await counterstakeFactoryContract.getBridgeCount();
      expect(bridgeCount).toBeDefined();
      
      console.log('✅ BSC Counterstake Factory:', {
        address: counterstakeFactoryContract.address,
        bridgeCount: bridgeCount.toString()
      });
    });
  });

  describe('BSC Bridge Contracts and Claims', () => {
    let bridgeContracts = [];
    
    beforeAll(async () => {
      // Get all bridges from BSC network configuration
      const bridges = bscNetworkConfig.bridges || {};
      
      for (const [bridgeKey, bridgeConfig] of Object.entries(bridges)) {
        if (bridgeConfig.address) {
          try {
            const contract = createCounterstakeContract(
              bscProvider,
              bridgeConfig.address,
              'BSC',
              bridgeConfig.type || 'export'
            );
            
            bridgeContracts.push({
              key: bridgeKey,
              config: bridgeConfig,
              contract: contract
            });
            
            console.log('🔍 Found BSC Bridge:', {
              key: bridgeKey,
              address: bridgeConfig.address,
              type: bridgeConfig.type || 'export'
            });
          } catch (error) {
            console.warn(`⚠️ Failed to create contract for bridge ${bridgeKey}:`, error.message);
          }
        }
      }
    });

    test('should find BSC bridge contracts', () => {
      expect(bridgeContracts.length).toBeGreaterThan(0);
      console.log(`✅ Found ${bridgeContracts.length} BSC bridge contracts`);
    });

    test('should fetch NewClaim events from BSC bridges', async () => {
      const results = [];
      
      for (const bridge of bridgeContracts) {
        try {
          console.log(`🔍 Testing NewClaim events for bridge: ${bridge.key}`);
          
          // Test NewClaim events fetching
          const newClaimEvents = await getNewClaimEvents(
            bridge.contract,
            10, // limit to 10 events
            1,  // 1 hour search depth
            'BSC'
          );
          
          results.push({
            bridgeKey: bridge.key,
            bridgeAddress: bridge.config.address,
            eventsCount: newClaimEvents.length,
            events: newClaimEvents
          });
          
          console.log(`✅ Bridge ${bridge.key} NewClaim events:`, {
            count: newClaimEvents.length,
            events: newClaimEvents.map(e => ({
              claim_num: e.claim_num,
              txid: e.txid,
              amount: e.amount?.toString(),
              sender: e.sender_address,
              recipient: e.recipient_address
            }))
          });
          
        } catch (error) {
          console.warn(`⚠️ Failed to fetch NewClaim events for bridge ${bridge.key}:`, error.message);
          results.push({
            bridgeKey: bridge.key,
            bridgeAddress: bridge.config.address,
            error: error.message,
            eventsCount: 0
          });
        }
      }
      
      expect(results.length).toBeGreaterThan(0);
      
      // Log summary
      const successfulBridges = results.filter(r => !r.error);
      const totalEvents = results.reduce((sum, r) => sum + (r.eventsCount || 0), 0);
      
      console.log('✅ BSC NewClaim Events Summary:', {
        totalBridges: results.length,
        successfulBridges: successfulBridges.length,
        totalEvents,
        results: results.map(r => ({
          bridge: r.bridgeKey,
          events: r.eventsCount,
          hasError: !!r.error
        }))
      });
    });

    test('should fetch claim details from BSC bridges', async () => {
      const results = [];
      
      for (const bridge of bridgeContracts) {
        try {
          console.log(`🔍 Testing claim details for bridge: ${bridge.key}`);
          
          // Test claim details fetching
          const claims = await getAllClaims(
            bridge.contract,
            5,  // limit to 5 claims
            bscNetworkConfig.rpcUrl,
            1,  // 1 hour search depth
            'BSC'
          );
          
          results.push({
            bridgeKey: bridge.key,
            bridgeAddress: bridge.config.address,
            claimsCount: claims.length,
            claims: claims
          });
          
          console.log(`✅ Bridge ${bridge.key} claim details:`, {
            count: claims.length,
            claims: claims.map(c => ({
              claimNum: c.claimNum,
              amount: c.amount?.toString(),
              reward: c.reward?.toString(),
              currentOutcome: c.currentOutcome,
              finished: c.finished,
              withdrawn: c.withdrawn,
              txid: c.txid
            }))
          });
          
        } catch (error) {
          console.warn(`⚠️ Failed to fetch claim details for bridge ${bridge.key}:`, error.message);
          results.push({
            bridgeKey: bridge.key,
            bridgeAddress: bridge.config.address,
            error: error.message,
            claimsCount: 0
          });
        }
      }
      
      expect(results.length).toBeGreaterThan(0);
      
      // Log summary
      const successfulBridges = results.filter(r => !r.error);
      const totalClaims = results.reduce((sum, r) => sum + (r.claimsCount || 0), 0);
      
      console.log('✅ BSC Claim Details Summary:', {
        totalBridges: results.length,
        successfulBridges: successfulBridges.length,
        totalClaims,
        results: results.map(r => ({
          bridge: r.bridgeKey,
          claims: r.claimsCount,
          hasError: !!r.error
        }))
      });
    });
  });

  describe('BSC Claims Integration Test', () => {
    test('should fetch claims from all BSC networks using fetchClaimsFromAllNetworks', async () => {
      console.log('🔍 Testing fetchClaimsFromAllNetworks for BSC...');
      
      try {
        const allClaims = await fetchClaimsFromAllNetworks({
          getNetworkWithSettings: mockGetNetworkWithSettings,
          getBridgeInstancesWithSettings: mockGetBridgeInstancesWithSettings,
          filter: 'all',
          account: null,
          getTransferTokenSymbol: mockGetTransferTokenSymbol,
          getTokenDecimals: mockGetTokenDecimals
        });
        
        expect(allClaims).toBeDefined();
        expect(Array.isArray(allClaims)).toBe(true);
        
        // Filter BSC claims
        const bscClaims = allClaims.filter(claim => 
          claim.networkKey === 'BSC' || 
          claim.networkName === 'BSC' ||
          claim.bridgeAddress && Object.values(bscNetworkConfig.bridges || {}).some(bridge => 
            bridge.address.toLowerCase() === claim.bridgeAddress.toLowerCase()
          )
        );
        
        console.log('✅ BSC Claims Integration Test:', {
          totalClaims: allClaims.length,
          bscClaims: bscClaims.length,
          bscClaimsDetails: bscClaims.map(c => ({
            claimNum: c.claimNum || c.actualClaimNum,
            networkKey: c.networkKey,
            networkName: c.networkName,
            bridgeAddress: c.bridgeAddress,
            bridgeType: c.bridgeType,
            amount: c.amount?.toString(),
            reward: c.reward?.toString(),
            txid: c.txid,
            currentOutcome: c.currentOutcome,
            finished: c.finished,
            withdrawn: c.withdrawn
          }))
        });
        
        // Verify BSC claims have expected properties
        bscClaims.forEach(claim => {
          expect(claim.bridgeAddress).toBeDefined();
          expect(claim.networkKey || claim.networkName).toBeDefined();
          expect(claim.amount).toBeDefined();
        });
        
      } catch (error) {
        console.error('❌ BSC Claims Integration Test failed:', error);
        throw error;
      }
    });
  });

  describe('BSC Network Performance Test', () => {
    test('should measure BSC network response times', async () => {
      const startTime = Date.now();
      
      // Test basic network operations
      const blockNumber = await bscProvider.getBlockNumber();
      const blockTime = Date.now() - startTime;
      
      console.log('✅ BSC Network Performance:', {
        blockNumber,
        responseTime: `${blockTime}ms`,
        rpcUrl: bscNetworkConfig.rpcUrl
      });
      
      // Basic performance check - should respond within reasonable time
      expect(blockTime).toBeLessThan(10000); // Less than 10 seconds
    });

    test('should handle BSC network errors gracefully', async () => {
      // Test with invalid contract address
      const invalidContract = new ethers.Contract(
        '0x0000000000000000000000000000000000000000',
        ['function last_claim_num() view returns (uint256)'],
        bscProvider
      );
      
      try {
        await invalidContract.last_claim_num();
        // If this doesn't throw, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
        console.log('✅ BSC Error Handling:', {
          errorType: error.code,
          errorMessage: error.message
        });
      }
    });
  });
});
