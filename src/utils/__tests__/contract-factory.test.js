import {
  createContract,
  createBridgeContract,
  createTokenContract,
  getBridgeABI
} from '../contract-factory';
import {
  EXPORT_ABI,
  IMPORT_ABI,
  IMPORT_WRAPPER_ABI,
  ERC20_ABI
} from '../../contracts/abi';

describe('contract-factory', () => {
  const validAddress = '0x1234567890123456789012345678901234567890';
  const invalidAddress = '0xinvalid';

  describe('createContract', () => {
    it('should throw error for invalid address', () => {
      const mockAbi = ['function test()'];

      expect(() => {
        createContract(invalidAddress, mockAbi, null);
      }).toThrow('Invalid contract address');
    });

    it('should throw error for null address', () => {
      const mockAbi = ['function test()'];

      expect(() => {
        createContract(null, mockAbi, null);
      }).toThrow('Invalid contract address');
    });

    it('should throw error for undefined address', () => {
      const mockAbi = ['function test()'];

      expect(() => {
        createContract(undefined, mockAbi, null);
      }).toThrow('Invalid contract address');
    });

    it('should throw error for empty string address', () => {
      const mockAbi = ['function test()'];

      expect(() => {
        createContract('', mockAbi, null);
      }).toThrow('Invalid contract address');
    });
  });

  describe('getBridgeABI', () => {
    it('should return EXPORT_ABI for export type', () => {
      const abi = getBridgeABI('export');
      expect(abi).toBe(EXPORT_ABI);
    });

    it('should return IMPORT_ABI for import type', () => {
      const abi = getBridgeABI('import');
      expect(abi).toBe(IMPORT_ABI);
    });

    it('should return IMPORT_WRAPPER_ABI for import_wrapper type', () => {
      const abi = getBridgeABI('import_wrapper');
      expect(abi).toBe(IMPORT_WRAPPER_ABI);
    });

    it('should throw error for unknown bridge type', () => {
      expect(() => {
        getBridgeABI('unknown_type');
      }).toThrow('Unknown bridge type');
    });

    it('should throw error for null bridge type', () => {
      expect(() => {
        getBridgeABI(null);
      }).toThrow('Unknown bridge type');
    });
  });

  describe('createBridgeContract', () => {
    it('should throw error for invalid address', () => {
      expect(() => {
        createBridgeContract(invalidAddress, 'export', null);
      }).toThrow('Invalid contract address');
    });

    it('should throw error for unknown bridge type', () => {
      expect(() => {
        createBridgeContract(validAddress, 'unknown', null);
      }).toThrow('Unknown bridge type');
    });
  });

  describe('createTokenContract', () => {
    it('should throw error for invalid address', () => {
      expect(() => {
        createTokenContract(invalidAddress, null);
      }).toThrow('Invalid contract address');
    });
  });
});
