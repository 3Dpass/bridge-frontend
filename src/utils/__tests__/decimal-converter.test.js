import { convertActualToDisplay, convertDisplayToActual } from '../decimal-converter';

describe('decimal-converter', () => {
  describe('convertActualToDisplay', () => {
    describe('without decimalsDisplayMultiplier', () => {
      it('should return actual amount as is for standard tokens', () => {
        const result = convertActualToDisplay('1.5', 18, '0xStandardToken', () => null);
        expect(result).toBe('1.5');
      });

      it('should return 0 for zero amount', () => {
        const result = convertActualToDisplay('0', 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });

      it('should return 0 for null amount', () => {
        const result = convertActualToDisplay(null, 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });

      it('should return 0 for undefined amount', () => {
        const result = convertActualToDisplay(undefined, 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });

      it('should return 0 for empty string', () => {
        const result = convertActualToDisplay('', 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });
    });

    describe('with decimalsDisplayMultiplier (P3D tokens)', () => {
      const getMultiplier = (address) => {
        if (address === '0xP3DToken') return 1000000;
        return null;
      };

      it('should multiply by decimalsDisplayMultiplier for P3D tokens', () => {
        // 0.000001 actual * 1000000 = 1.0 display
        const result = convertActualToDisplay('0.000001', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('1');
      });

      it('should handle large amounts correctly', () => {
        // 0.001 actual * 1000000 = 1000 display
        const result = convertActualToDisplay('0.001', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('1000');
      });

      it('should handle very small amounts correctly', () => {
        // 0.0000001 actual * 1000000 = 0.1 display
        const result = convertActualToDisplay('0.0000001', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('0.1');
      });

      it('should strip trailing zeros', () => {
        // 0.0000015 actual * 1000000 = 1.5 display
        const result = convertActualToDisplay('0.0000015', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('1.5');
      });

      it('should strip trailing zeros and decimal point', () => {
        // 0.000002 actual * 1000000 = 2.0 display -> '2'
        const result = convertActualToDisplay('0.000002', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('2');
      });

      it('should return 0 for zero amount with P3D token', () => {
        const result = convertActualToDisplay('0', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('0');
      });

      it('should limit to 6 decimal places', () => {
        // 0.0000001234567 actual * 1000000 = 0.1234567 -> should be truncated to 6 decimals
        const result = convertActualToDisplay('0.0000001234567', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('0.123457'); // rounded to 6 decimals
      });
    });

    describe('error handling', () => {
      it('should return 0 when multiplier function throws', () => {
        const throwingMultiplier = () => {
          throw new Error('Test error');
        };
        const result = convertActualToDisplay('1', 18, '0xToken', throwingMultiplier);
        expect(result).toBe('0');
      });
    });
  });

  describe('convertDisplayToActual', () => {
    describe('without decimalsDisplayMultiplier', () => {
      it('should return display amount as is for standard tokens', () => {
        const result = convertDisplayToActual('1.5', 18, '0xStandardToken', () => null);
        expect(result).toBe('1.5');
      });

      it('should return 0 for zero amount', () => {
        const result = convertDisplayToActual('0', 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });

      it('should return 0 for null amount', () => {
        const result = convertDisplayToActual(null, 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });

      it('should return 0 for undefined amount', () => {
        const result = convertDisplayToActual(undefined, 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });

      it('should return 0 for empty string', () => {
        const result = convertDisplayToActual('', 18, '0xStandardToken', () => null);
        expect(result).toBe('0');
      });
    });

    describe('with decimalsDisplayMultiplier (P3D tokens)', () => {
      const getMultiplier = (address) => {
        if (address === '0xP3DToken') return 1000000;
        return null;
      };

      it('should divide by decimalsDisplayMultiplier for P3D tokens', () => {
        // 1.0 display / 1000000 = 0.000001 actual
        const result = convertDisplayToActual('1', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('0.000001000000000000');
      });

      it('should handle large amounts correctly', () => {
        // 1000 display / 1000000 = 0.001 actual
        const result = convertDisplayToActual('1000', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('0.001000000000000000');
      });

      it('should handle decimal amounts correctly', () => {
        // 1.5 display / 1000000 = 0.0000015 actual
        const result = convertDisplayToActual('1.5', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('0.000001500000000000');
      });

      it('should respect decimals parameter for precision', () => {
        // 1.0 display / 1000000 = 0.000001 actual with 12 decimals
        const result = convertDisplayToActual('1', 12, '0xP3DToken', getMultiplier);
        expect(result).toBe('0.000001000000');
      });

      it('should return 0 for zero amount with P3D token', () => {
        const result = convertDisplayToActual('0', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('0');
      });

      it('should handle very large display amounts', () => {
        // 1000000 display / 1000000 = 1.0 actual
        const result = convertDisplayToActual('1000000', 18, '0xP3DToken', getMultiplier);
        expect(result).toBe('1.000000000000000000');
      });
    });

    describe('error handling', () => {
      it('should return 0 when multiplier function throws', () => {
        const throwingMultiplier = () => {
          throw new Error('Test error');
        };
        const result = convertDisplayToActual('1', 18, '0xToken', throwingMultiplier);
        expect(result).toBe('0');
      });
    });
  });

  describe('round-trip conversion', () => {
    const getMultiplier = (address) => {
      if (address === '0xP3DToken') return 1000000;
      return null;
    };

    it('should maintain value through round-trip for P3D tokens', () => {
      const original = '0.000001';
      const display = convertActualToDisplay(original, 18, '0xP3DToken', getMultiplier);
      const backToActual = convertDisplayToActual(display, 18, '0xP3DToken', getMultiplier);
      expect(parseFloat(backToActual)).toBeCloseTo(parseFloat(original), 15);
    });

    it('should maintain value through round-trip for standard tokens', () => {
      const original = '1.5';
      const display = convertActualToDisplay(original, 18, '0xStandardToken', getMultiplier);
      const backToActual = convertDisplayToActual(display, 18, '0xStandardToken', getMultiplier);
      expect(backToActual).toBe(original);
    });
  });
});
