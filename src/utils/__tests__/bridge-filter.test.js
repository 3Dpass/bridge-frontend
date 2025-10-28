import { getBridgesForNetwork } from '../bridge-filter';

describe('bridge-filter', () => {
  describe('getBridgesForNetwork', () => {
    it('should return empty array when networkConfig has no bridges', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {}
      };
      const customBridges = {};

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toEqual([]);
    });

    it('should return bridges from networkConfig.bridges', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {},
        bridges: {
          bridge1: { address: '0x123', type: 'export' },
          bridge2: { address: '0x456', type: 'import' }
        }
      };
      const customBridges = {};

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ address: '0x123', type: 'export' });
      expect(result).toContainEqual({ address: '0x456', type: 'import' });
    });

    it('should extract import bridges from network-level properties', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {},
        bridges: {},
        P3D_IMPORT: { address: '0xabc', type: 'import' },
        USDT_WRAPPER: { address: '0xdef', type: 'import_wrapper' }
      };
      const customBridges = {};

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ address: '0xabc', type: 'import' });
      expect(result).toContainEqual({ address: '0xdef', type: 'import_wrapper' });
    });

    it('should not include non-bridge network properties', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {},
        bridges: {},
        assistants: { assist1: { address: '0x111' } },
        tokens: { token1: { address: '0x222' } },
        P3D_IMPORT: { address: '0xabc', type: 'import' }
      };
      const customBridges = {};

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('0xabc');
    });

    it('should include custom export bridges when network is home network', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {},
        bridges: {}
      };
      const customBridges = {
        custom1: {
          address: '0xcustom1',
          type: 'export',
          homeNetwork: 'ETHEREUM',
          foreignNetwork: 'BSC'
        },
        custom2: {
          address: '0xcustom2',
          type: 'export',
          homeNetwork: 'BSC',
          foreignNetwork: 'ETHEREUM'
        }
      };

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('0xcustom1');
    });

    it('should include custom import bridges when network is foreign network', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {},
        bridges: {}
      };
      const customBridges = {
        custom1: {
          address: '0xcustom1',
          type: 'import',
          homeNetwork: 'BSC',
          foreignNetwork: 'ETHEREUM'
        },
        custom2: {
          address: '0xcustom2',
          type: 'import',
          homeNetwork: 'ETHEREUM',
          foreignNetwork: 'BSC'
        }
      };

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('0xcustom1');
    });

    it('should not include duplicate bridges', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {},
        bridges: {
          bridge1: { address: '0x123', type: 'export' }
        }
      };
      const customBridges = {
        custom1: {
          address: '0x123',
          type: 'export',
          homeNetwork: 'ETHEREUM'
        }
      };

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('0x123');
    });

    it('should combine default bridges, import bridges, and custom bridges', () => {
      const networkConfig = {
        name: 'ETHEREUM',
        contracts: {},
        bridges: {
          bridge1: { address: '0x111', type: 'export' }
        },
        P3D_IMPORT: { address: '0x222', type: 'import' }
      };
      const customBridges = {
        custom1: {
          address: '0x333',
          type: 'import_wrapper',
          foreignNetwork: 'ETHEREUM'
        }
      };

      const result = getBridgesForNetwork(networkConfig, customBridges);

      expect(result).toHaveLength(3);
      expect(result.map(b => b.address).sort()).toEqual(['0x111', '0x222', '0x333']);
    });
  });
});
