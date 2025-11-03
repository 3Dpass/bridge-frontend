import {
  getNetworkTokens,
  getTokenByAddress,
  getTokenBySymbol,
  getTokensBySymbol,
  findTokenKeyByAddress,
  findTokenKeyBySymbol,
} from '../token-helpers';
import { NETWORKS } from '../../config/networks';

describe('Token Helpers', () => {
  describe('getTokenByAddress', () => {
    it('should find token by address regardless of key format', () => {
      // Test with descriptive key (P3D_ON_ETHEREUM)
      const p3dOnEth = getTokenByAddress('ETHEREUM', '0x4f3a4e37701402C61146071309e45A15843025E1');
      expect(p3dOnEth).toBeDefined();
      expect(p3dOnEth.symbol).toBe('P3D');
      expect(p3dOnEth.address).toBe('0x4f3a4e37701402C61146071309e45A15843025E1');
    });

    it('should find token with symbol-based key', () => {
      // Test with symbol key (ETH)
      const eth = getTokenByAddress('ETHEREUM', '0x0000000000000000000000000000000000000000');
      expect(eth).toBeDefined();
      expect(eth.symbol).toBe('ETH');
    });

    it('should return null for non-existent address', () => {
      const result = getTokenByAddress('ETHEREUM', '0x1234567890123456789012345678901234567890');
      expect(result).toBeNull();
    });
  });

  describe('getTokenBySymbol', () => {
    it('should find first token by symbol', () => {
      const p3d = getTokenBySymbol('ETHEREUM', 'P3D');
      expect(p3d).toBeDefined();
      expect(p3d.symbol).toBe('P3D');
      expect(p3d.address).toBe('0x4f3a4e37701402C61146071309e45A15843025E1');
    });

    it('should handle duplicate symbols correctly', () => {
      // P3D exists on multiple networks
      const p3dEth = getTokenBySymbol('ETHEREUM', 'P3D');
      const p3dBsc = getTokenBySymbol('BSC', 'P3D');
      const p3d3dp = getTokenBySymbol('THREEDPASS', 'P3D');

      expect(p3dEth).toBeDefined();
      expect(p3dBsc).toBeDefined();
      expect(p3d3dp).toBeDefined();

      // They should have different addresses
      expect(p3dEth.address).not.toBe(p3dBsc.address);
      expect(p3dBsc.address).not.toBe(p3d3dp.address);
    });
  });

  describe('getTokensBySymbol', () => {
    it('should return all tokens matching a symbol', () => {
      // Even if there's only one, should return array
      const ethTokens = getTokensBySymbol('ETHEREUM', 'ETH');
      expect(Array.isArray(ethTokens)).toBe(true);
      expect(ethTokens.length).toBeGreaterThan(0);
      expect(ethTokens[0].symbol).toBe('ETH');
    });
  });

  describe('findTokenKeyByAddress', () => {
    it('should find token key for descriptive key format', () => {
      const key = findTokenKeyByAddress('ETHEREUM', '0x4f3a4e37701402C61146071309e45A15843025E1');
      expect(key).toBe('P3D_ON_ETHEREUM');
    });

    it('should find token key for symbol-based key format', () => {
      const key = findTokenKeyByAddress('ETHEREUM', '0x0000000000000000000000000000000000000000');
      expect(key).toBe('ETH');
    });

    it('should return null for non-existent address', () => {
      const key = findTokenKeyByAddress('ETHEREUM', '0x1234567890123456789012345678901234567890');
      expect(key).toBeNull();
    });
  });

  describe('findTokenKeyBySymbol', () => {
    it('should find token key by symbol', () => {
      const key = findTokenKeyBySymbol('ETHEREUM', 'P3D');
      expect(key).toBe('P3D_ON_ETHEREUM');
    });

    it('should return first match for duplicate symbols', () => {
      const key = findTokenKeyBySymbol('ETHEREUM', 'ETH');
      expect(key).toBe('ETH');
    });
  });

  describe('Key Format Compatibility', () => {
    it('should work with all current key formats', () => {
      const tokens = getNetworkTokens('ETHEREUM');
      
      // Should include tokens with different key formats
      expect(tokens['ETH']).toBeDefined(); // Symbol-based key
      expect(tokens['P3D_ON_ETHEREUM']).toBeDefined(); // Descriptive key
      expect(tokens['USDT']).toBeDefined(); // Symbol-based key
    });

    it('should access tokens regardless of key format using address lookup', () => {
      // Test descriptive key
      const p3dEth = getTokenByAddress('ETHEREUM', '0x4f3a4e37701402C61146071309e45A15843025E1');
      expect(p3dEth).toBeDefined();
      expect(p3dEth.symbol).toBe('P3D');

      // Test symbol-based key
      const eth = getTokenByAddress('ETHEREUM', '0x0000000000000000000000000000000000000000');
      expect(eth).toBeDefined();
      expect(eth.symbol).toBe('ETH');
    });
  });
});

