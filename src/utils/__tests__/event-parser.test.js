import { parseExpatriationEvent, parseRepatriationEvent } from '../event-parser';

describe('event-parser', () => {
  describe('parseExpatriationEvent', () => {
    it('should parse NewExpatriation event args', () => {
      const event = {
        args: [
          '0xSenderAddress',
          { hex: '0x1234', toString: () => '4660' },
          { hex: '0x5678', toString: () => '22136' },
          '0xForeignAddress',
          'someData'
        ]
      };

      const result = parseExpatriationEvent(event);

      expect(result).toEqual({
        senderAddress: '0xSenderAddress',
        amount: '0x1234',
        reward: '0x5678',
        foreignAddress: '0xForeignAddress',
        data: 'someData'
      });
    });

    it('should handle missing sender address', () => {
      const event = {
        args: [
          null,
          { hex: '0x1234' },
          { hex: '0x5678' },
          '0xForeignAddress',
          'data'
        ]
      };

      const result = parseExpatriationEvent(event);

      expect(result.senderAddress).toBe('Unknown');
    });

    it('should handle missing foreign address', () => {
      const event = {
        args: [
          '0xSender',
          { hex: '0x1234' },
          { hex: '0x5678' },
          null,
          'data'
        ]
      };

      const result = parseExpatriationEvent(event);

      expect(result.foreignAddress).toBe('Unknown');
    });

    it('should handle missing data', () => {
      const event = {
        args: [
          '0xSender',
          { hex: '0x1234' },
          { hex: '0x5678' },
          '0xForeign',
          null
        ]
      };

      const result = parseExpatriationEvent(event);

      expect(result.data).toBe('');
    });
  });

  describe('parseRepatriationEvent', () => {
    it('should parse NewRepatriation event args', () => {
      const event = {
        args: [
          '0xSenderAddress',
          { hex: '0xabcd', toString: () => '43981' },
          { hex: '0xef01', toString: () => '61185' },
          '0xHomeAddress',
          'repatriationData'
        ]
      };

      const result = parseRepatriationEvent(event);

      expect(result).toEqual({
        senderAddress: '0xSenderAddress',
        amount: '0xabcd',
        reward: '0xef01',
        homeAddress: '0xHomeAddress',
        data: 'repatriationData'
      });
    });

    it('should handle missing sender address', () => {
      const event = {
        args: [
          null,
          { hex: '0xabcd' },
          { hex: '0xef01' },
          '0xHome',
          'data'
        ]
      };

      const result = parseRepatriationEvent(event);

      expect(result.senderAddress).toBe('Unknown');
    });

    it('should handle missing home address', () => {
      const event = {
        args: [
          '0xSender',
          { hex: '0xabcd' },
          { hex: '0xef01' },
          null,
          'data'
        ]
      };

      const result = parseRepatriationEvent(event);

      expect(result.homeAddress).toBe('Unknown');
    });

    it('should handle missing data', () => {
      const event = {
        args: [
          '0xSender',
          { hex: '0xabcd' },
          { hex: '0xef01' },
          '0xHome',
          null
        ]
      };

      const result = parseRepatriationEvent(event);

      expect(result.data).toBe('');
    });

    it('should normalize amount and reward using normalizeAmount', () => {
      const event = {
        args: [
          '0xSender',
          100, // Plain number
          '200', // String
          '0xHome',
          'data'
        ]
      };

      const result = parseRepatriationEvent(event);

      expect(result.amount).toBe('100');
      expect(result.reward).toBe('200');
    });
  });
});
