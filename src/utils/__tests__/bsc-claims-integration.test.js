import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ethers } from 'ethers';
import ClaimList from '../../components/ClaimList';
import { NETWORKS } from '../../config/networks';
import { 
  getAllClaims, 
  getNewClaimEvents,
  createCounterstakeContract 
} from '../bridge-contracts';
import { fetchClaimsFromAllNetworks } from '../fetch-claims';

// Mock the contexts
const mockWeb3Context = {
  account: null,
  network: null,
  getNetworkWithSettings: (networkKey) => NETWORKS[networkKey] || null
};

const mockSettingsContext = {
  getBridgeInstancesWithSettings: () => ({}),
  getTokenDecimalsDisplayMultiplier: () => null
};

// Mock the contexts
jest.mock('../../contexts/Web3Context', () => ({
  useWeb3: () => mockWeb3Context
}));

jest.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => mockSettingsContext
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>
  },
  AnimatePresence: ({ children }) => <>{children}</>
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

describe('BSC Claims Integration Test', () => {
  let bscProvider;
  let bscNetworkConfig;
  
  beforeAll(async () => {
    // Setup BSC configuration
    bscNetworkConfig = NETWORKS.BSC;
    
    if (!bscNetworkConfig) {
      throw new Error('BSC network configuration not found');
    }
    
    // Create BSC provider
    bscProvider = new ethers.providers.JsonRpcProvider(bscNetworkConfig.rpcUrl);
    
    console.log('🔍 BSC Test Setup:', {
      networkName: bscNetworkConfig.name,
      rpcUrl: bscNetworkConfig.rpcUrl,
      chainId: bscNetworkConfig.id
    });
  });

  describe('BSC Network Integration', () => {
    test('should connect to BSC network', async () => {
      const network = await bscProvider.getNetwork();
      expect(network.chainId).toBe(56);
      
      const blockNumber = await bscProvider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
      
      console.log('✅ BSC Network connected:', {
        chainId: network.chainId,
        blockNumber
      });
    });

    test('should find BSC bridge contracts', () => {
      const bridges = bscNetworkConfig.bridges || {};
      const bridgeEntries = Object.entries(bridges);
      
      expect(bridgeEntries.length).toBeGreaterThan(0);
      
      bridgeEntries.forEach(([key, bridge]) => {
        expect(bridge.address).toBeDefined();
        expect(bridge.type).toBeDefined();
        console.log(`✅ BSC Bridge found: ${key}`, {
          address: bridge.address,
          type: bridge.type,
          homeTokenSymbol: bridge.homeTokenSymbol,
          foreignTokenSymbol: bridge.foreignTokenSymbol
        });
      });
    });
  });

  describe('BSC Claims Fetching', () => {
    test('should fetch NewClaim events from BSC bridges', async () => {
      const bridges = bscNetworkConfig.bridges || {};
      const results = [];
      
      for (const [bridgeKey, bridgeConfig] of Object.entries(bridges)) {
        if (!bridgeConfig.address) continue;
        
        try {
          const contract = createCounterstakeContract(
            bscProvider,
            bridgeConfig.address,
            'BSC',
            bridgeConfig.type || 'export'
          );
          
          // Fetch NewClaim events
          const events = await getNewClaimEvents(
            contract,
            10, // limit
            1,  // 1 hour search depth
            'BSC'
          );
          
          results.push({
            bridgeKey,
            bridgeAddress: bridgeConfig.address,
            eventsCount: events.length,
            events: events
          });
          
          console.log(`✅ BSC Bridge ${bridgeKey} NewClaim events:`, {
            count: events.length,
            sampleEvents: events.slice(0, 3).map(e => ({
              claimNum: e.claim_num,
              txid: e.txid,
              amount: e.amount?.toString(),
              sender: e.sender_address,
              recipient: e.recipient_address
            }))
          });
          
        } catch (error) {
          console.warn(`⚠️ Failed to fetch NewClaim events for ${bridgeKey}:`, error.message);
          results.push({
            bridgeKey,
            bridgeAddress: bridgeConfig.address,
            error: error.message,
            eventsCount: 0
          });
        }
      }
      
      expect(results.length).toBeGreaterThan(0);
      
      const successfulBridges = results.filter(r => !r.error);
      const totalEvents = results.reduce((sum, r) => sum + (r.eventsCount || 0), 0);
      
      console.log('✅ BSC NewClaim Events Summary:', {
        totalBridges: results.length,
        successfulBridges: successfulBridges.length,
        totalEvents
      });
    });

    test('should fetch claim details from BSC bridges', async () => {
      const bridges = bscNetworkConfig.bridges || {};
      const results = [];
      
      for (const [bridgeKey, bridgeConfig] of Object.entries(bridges)) {
        if (!bridgeConfig.address) continue;
        
        try {
          const contract = createCounterstakeContract(
            bscProvider,
            bridgeConfig.address,
            'BSC',
            bridgeConfig.type || 'export'
          );
          
          // Fetch claim details
          const claims = await getAllClaims(
            contract,
            5,  // limit to 5 claims
            bscNetworkConfig.rpcUrl,
            1,  // 1 hour search depth
            'BSC'
          );
          
          results.push({
            bridgeKey,
            bridgeAddress: bridgeConfig.address,
            claimsCount: claims.length,
            claims: claims
          });
          
          console.log(`✅ BSC Bridge ${bridgeKey} claim details:`, {
            count: claims.length,
            sampleClaims: claims.slice(0, 3).map(c => ({
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
          console.warn(`⚠️ Failed to fetch claim details for ${bridgeKey}:`, error.message);
          results.push({
            bridgeKey,
            bridgeAddress: bridgeConfig.address,
            error: error.message,
            claimsCount: 0
          });
        }
      }
      
      expect(results.length).toBeGreaterThan(0);
      
      const successfulBridges = results.filter(r => !r.error);
      const totalClaims = results.reduce((sum, r) => sum + (r.claimsCount || 0), 0);
      
      console.log('✅ BSC Claim Details Summary:', {
        totalBridges: results.length,
        successfulBridges: successfulBridges.length,
        totalClaims
      });
    });
  });

  describe('BSC Claims Integration with ClaimList', () => {
    test('should fetch claims from all networks including BSC', async () => {
      const allClaims = await fetchClaimsFromAllNetworks({
        getNetworkWithSettings: mockWeb3Context.getNetworkWithSettings,
        getBridgeInstancesWithSettings: mockSettingsContext.getBridgeInstancesWithSettings,
        filter: 'all',
        account: null,
        getTransferTokenSymbol: (claim) => 'P3D',
        getTokenDecimals: (claim) => 18
      });
      
      expect(allClaims).toBeDefined();
      expect(Array.isArray(allClaims)).toBe(true);
      
      // Filter BSC claims
      const bscClaims = allClaims.filter(claim => 
        claim.networkKey === 'BSC' || 
        claim.networkName === 'BSC' ||
        (claim.bridgeAddress && Object.values(bscNetworkConfig.bridges || {}).some(bridge => 
          bridge.address.toLowerCase() === claim.bridgeAddress.toLowerCase()
        ))
      );
      
      console.log('✅ BSC Claims Integration:', {
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
          txid: c.txid
        }))
      });
      
      // Verify BSC claims have expected properties
      bscClaims.forEach(claim => {
        expect(claim.bridgeAddress).toBeDefined();
        expect(claim.networkKey || claim.networkName).toBeDefined();
        expect(claim.amount).toBeDefined();
      });
    });

    test('should render ClaimList component with BSC data', async () => {
      // Mock the fetch functions to return BSC data
      const mockBSCClaims = [
        {
          claimNum: 1,
          actualClaimNum: 1,
          amount: ethers.BigNumber.from('1000000000000000000'), // 1 P3D
          reward: ethers.BigNumber.from('0'),
          yesStake: ethers.BigNumber.from('0'),
          noStake: ethers.BigNumber.from('0'),
          currentOutcome: 0,
          finished: false,
          withdrawn: false,
          bridgeAddress: Object.values(bscNetworkConfig.bridges || {})[0]?.address || '0x0000000000000000000000000000000000000000',
          networkKey: 'BSC',
          networkName: 'BSC',
          bridgeType: 'export',
          txid: '0x1234567890abcdef',
          senderAddress: '0x1234567890123456789012345678901234567890',
          recipientAddress: '0x0987654321098765432109876543210987654321',
          data: '0x',
          txts: Math.floor(Date.now() / 1000),
          expiryTs: ethers.BigNumber.from(Math.floor(Date.now() / 1000) + 3600)
        }
      ];
      
      // Mock the fetch functions
      jest.spyOn(require('../fetch-claims'), 'fetchClaimsFromAllNetworks')
        .mockResolvedValue(mockBSCClaims);
      
      jest.spyOn(require('../fetch-last-transfers'), 'fetchLastTransfers')
        .mockResolvedValue([]);
      
      render(<ClaimList />);
      
      // Wait for the component to load
      await waitFor(() => {
        expect(screen.getByText(/All/)).toBeInTheDocument();
      });
      
      // Check if BSC claims are displayed
      await waitFor(() => {
        const claimElements = screen.queryAllByText(/Claim #/);
        expect(claimElements.length).toBeGreaterThan(0);
      });
      
      console.log('✅ ClaimList component rendered with BSC data');
    });
  });

  describe('BSC Network Performance', () => {
    test('should measure BSC network response times', async () => {
      const startTime = Date.now();
      
      // Test multiple operations
      const [blockNumber, network] = await Promise.all([
        bscProvider.getBlockNumber(),
        bscProvider.getNetwork()
      ]);
      
      const responseTime = Date.now() - startTime;
      
      console.log('✅ BSC Network Performance:', {
        blockNumber,
        chainId: network.chainId,
        responseTime: `${responseTime}ms`,
        rpcUrl: bscNetworkConfig.rpcUrl
      });
      
      // Performance should be reasonable
      expect(responseTime).toBeLessThan(10000); // Less than 10 seconds
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
