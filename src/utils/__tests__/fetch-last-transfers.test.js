import { fetchLastTransfers } from '../fetch-last-transfers';

describe('fetch-last-transfers', () => {
  describe('module', () => {
    it('should import module without syntax errors', () => {
      expect(fetchLastTransfers).toBeDefined();
      expect(typeof fetchLastTransfers).toBe('function');
    });
  });
});
