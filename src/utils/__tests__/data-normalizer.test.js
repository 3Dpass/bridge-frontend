import { normalizeAmount } from '../data-normalizer';

describe('data-normalizer', () => {
  describe('normalizeAmount', () => {
    it('should handle BigNumber objects with toNumber function', () => {
      const bigNumber = {
        toNumber: () => 12345,
        toString: () => '12345'
      };

      const result = normalizeAmount(bigNumber);

      expect(result).toBe('12345');
    });

    it('should handle string values', () => {
      const result = normalizeAmount('98765');

      expect(result).toBe('98765');
    });

    it('should handle number values', () => {
      const result = normalizeAmount(42);

      expect(result).toBe('42');
    });

    it('should handle objects with _hex property', () => {
      const obj = {
        _hex: '0x1234'
      };

      const result = normalizeAmount(obj);

      expect(result).toBe('0x1234');
    });

    it('should handle objects with hex property', () => {
      const obj = {
        hex: '0xabcd'
      };

      const result = normalizeAmount(obj);

      expect(result).toBe('0xabcd');
    });

    it('should handle objects with toString method', () => {
      const obj = {
        toString: () => '999'
      };

      const result = normalizeAmount(obj);

      expect(result).toBe('999');
    });

    it('should return "0" for null', () => {
      const result = normalizeAmount(null);

      expect(result).toBe('0');
    });

    it('should return "0" for undefined', () => {
      const result = normalizeAmount(undefined);

      expect(result).toBe('0');
    });

    it('should return "0" for empty object', () => {
      const result = normalizeAmount({});

      expect(result).toBe('0');
    });

    it('should prioritize _hex over hex if both exist', () => {
      const obj = {
        _hex: '0x1111',
        hex: '0x2222'
      };

      const result = normalizeAmount(obj);

      expect(result).toBe('0x1111');
    });

    it('should prioritize toNumber over string type', () => {
      const bigNumber = {
        toNumber: () => 100,
        toString: () => '100',
        valueOf: () => '100'
      };

      const result = normalizeAmount(bigNumber);

      expect(result).toBe('100');
    });

    it('should handle zero as number', () => {
      const result = normalizeAmount(0);

      expect(result).toBe('0');
    });

    it('should handle zero as string', () => {
      const result = normalizeAmount('0');

      expect(result).toBe('0');
    });

    it('should handle large numbers', () => {
      const result = normalizeAmount(999999999999999);

      expect(result).toBe('999999999999999');
    });

    it('should handle ethers BigNumber with hex', () => {
      const bigNumber = {
        _hex: '0x5f5e100',
        _isBigNumber: true,
        toString: () => '100000000'
      };

      const result = normalizeAmount(bigNumber);

      expect(result).toBe('0x5f5e100');
    });
  });
});
