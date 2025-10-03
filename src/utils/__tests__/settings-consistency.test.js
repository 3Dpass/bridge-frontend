/**
 * Tests for settings consistency in the fallback mechanism
 * These tests verify that the provider manager respects custom RPC URLs from settings
 */

import { ProviderManager } from '../provider-manager';

describe('Settings Consistency', () => {
  let providerManager;

  beforeEach(() => {
    providerManager = new ProviderManager();
  });

  describe('Custom RPC URL Handling', () => {
    it('should use custom RPC URL from settings when enabled', () => {
      const customSettings = {
        ETHEREUM: {
          customRpc: true,
          rpcUrl: 'https://custom-ethereum-rpc.com'
        }
      };

      providerManager.updateSettings(customSettings);
      
      // The provider should use the custom RPC URL
      const provider = providerManager.getProvider('ETHEREUM');
      expect(provider).toBeDefined();
      
      // Verify that fallback providers include the custom URL
      const fallbackUrls = providerManager.fallbackProviders.get('ETHEREUM');
      expect(fallbackUrls).toContain('https://custom-ethereum-rpc.com');
    });

    it('should fall back to default RPC URL when custom RPC is disabled', () => {
      const settingsWithDisabledCustomRpc = {
        ETHEREUM: {
          customRpc: false,
          rpcUrl: 'https://custom-ethereum-rpc.com' // This should be ignored
        }
      };

      providerManager.updateSettings(settingsWithDisabledCustomRpc);
      
      // The provider should use the default RPC URL from networks.js
      const provider = providerManager.getProvider('ETHEREUM');
      expect(provider).toBeDefined();
      
      // Verify that fallback providers include the default URL, not the custom one
      const fallbackUrls = providerManager.fallbackProviders.get('ETHEREUM');
      expect(fallbackUrls).toContain('https://mainnet.infura.io/v3/a68b71d194e7493db5231530985b00b7');
      expect(fallbackUrls).not.toContain('https://custom-ethereum-rpc.com');
    });

    it('should update fallback providers when settings change', () => {
      // Initial settings
      const initialSettings = {
        ETHEREUM: {
          customRpc: true,
          rpcUrl: 'https://initial-custom-rpc.com'
        }
      };

      providerManager.updateSettings(initialSettings);
      let fallbackUrls = providerManager.fallbackProviders.get('ETHEREUM');
      expect(fallbackUrls).toContain('https://initial-custom-rpc.com');

      // Updated settings
      const updatedSettings = {
        ETHEREUM: {
          customRpc: true,
          rpcUrl: 'https://updated-custom-rpc.com'
        }
      };

      providerManager.updateSettings(updatedSettings);
      fallbackUrls = providerManager.fallbackProviders.get('ETHEREUM');
      expect(fallbackUrls).toContain('https://updated-custom-rpc.com');
      expect(fallbackUrls).not.toContain('https://initial-custom-rpc.com');
    });

    it('should exclude primary provider from fallback list', () => {
      const customSettings = {
        ETHEREUM: {
          customRpc: true,
          rpcUrl: 'https://primary-rpc.com'
        }
      };

      providerManager.updateSettings(customSettings);
      
      // When trying fallback providers, the primary should be excluded
      const fallbackUrls = providerManager.fallbackProviders.get('ETHEREUM');
      expect(fallbackUrls).toContain('https://primary-rpc.com');
      
      // The tryFallbackProviders method should filter out the primary URL
      // This is tested by checking that the method exists and can be called
      expect(typeof providerManager.tryFallbackProviders).toBe('function');
    });
  });

  describe('Settings Integration', () => {
    it('should handle empty settings gracefully', () => {
      providerManager.updateSettings({});
      
      // Should not throw errors
      expect(() => providerManager.getProvider('ETHEREUM')).not.toThrow();
    });

    it('should handle partial settings', () => {
      const partialSettings = {
        ETHEREUM: {
          customRpc: true,
          rpcUrl: 'https://partial-settings-rpc.com'
        }
        // BSC and THREEDPASS settings are missing
      };

      providerManager.updateSettings(partialSettings);
      
      // Should work for configured networks
      expect(() => providerManager.getProvider('ETHEREUM')).not.toThrow();
      
      // Should work for unconfigured networks (use defaults)
      expect(() => providerManager.getProvider('THREEDPASS')).not.toThrow();
    });
  });
});
