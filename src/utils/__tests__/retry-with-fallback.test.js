/**
 * Tests for retry-with-fallback utilities
 * These are basic tests to verify the retry mechanism works correctly
 */

import { CircuitBreaker, ProviderHealthMonitor } from '../retry-with-fallback';

describe('Retry with Fallback', () => {
  describe('CircuitBreaker', () => {
    it('should open after threshold failures', async () => {
      const circuitBreaker = new CircuitBreaker(3, 1000);
      
      // First 3 failures should be allowed
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(() => {
          throw new Error('Test error');
        })).rejects.toThrow('Test error');
      }
      
      // 4th failure should open the circuit
      await expect(circuitBreaker.execute(() => {
        throw new Error('Test error');
      })).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should close after timeout', async () => {
      const circuitBreaker = new CircuitBreaker(1, 100);
      
      // Open the circuit
      await expect(circuitBreaker.execute(() => {
        throw new Error('Test error');
      })).rejects.toThrow('Test error');
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should work again
      const result = await circuitBreaker.execute(() => 'success');
      expect(result).toBe('success');
    });
  });

  describe('ProviderHealthMonitor', () => {
    it('should track provider health correctly for rate limiting', () => {
      const monitor = new ProviderHealthMonitor();

      // Record some requests
      monitor.recordRequest('ETHEREUM', null, true, 100);
      monitor.recordRequest('ETHEREUM', null, true, 200);
      monitor.recordRequest('ETHEREUM', null, false, 300, new Error('429'));

      const health = monitor.getProviderHealth('ETHEREUM');
      expect(health).toBe('rate_limited'); // 1/3 rate limit ratio (33%) exceeds 30% threshold
    });

    it('should track provider health correctly for degraded state', () => {
      const monitor = new ProviderHealthMonitor();

      // Record some requests
      monitor.recordRequest('ETHEREUM', null, true, 100);
      monitor.recordRequest('ETHEREUM', null, true, 200);
      monitor.recordRequest('ETHEREUM', null, true, 150);
      monitor.recordRequest('ETHEREUM', null, false, 300, new Error('Network error'));

      const health = monitor.getProviderHealth('ETHEREUM');
      expect(health).toBe('degraded'); // 3/4 = 75% success rate
    });

    it('should detect rate limiting', () => {
      const monitor = new ProviderHealthMonitor();
      
      // Record multiple rate limit errors
      for (let i = 0; i < 6; i++) {
        monitor.recordRequest('ETHEREUM', null, false, 100, new Error('429'));
      }
      
      const health = monitor.getProviderHealth('ETHEREUM');
      expect(health).toBe('rate_limited');
    });
  });
});
