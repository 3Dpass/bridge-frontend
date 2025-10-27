/**
 * Circuit Breaker and Provider Health Monitor utilities
 * Search depth logic removed as unified fetcher gets all events automatically
 */

/**
 * Provider Health Monitor
 */
export class ProviderHealthMonitor {
  constructor() {
    this.healthStats = new Map();
  }

  recordRequest(networkKey, provider, success, responseTime, error) {
    const stats = this.healthStats.get(networkKey) || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitErrors: 0,
      averageResponseTime: 0,
      lastError: null
    };

    stats.totalRequests++;
    stats.averageResponseTime = (stats.averageResponseTime + responseTime) / 2;
    
    if (success) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
      stats.lastError = error;
      
      if (error?.message?.includes('429')) {
        stats.rateLimitErrors++;
      }
    }

    this.healthStats.set(networkKey, stats);
    
    // Log health status
    if (stats.rateLimitErrors > 5) {
      console.warn(`🚨 ${networkKey} provider showing signs of rate limiting: ${stats.rateLimitErrors} errors`);
    }
  }

  getProviderHealth(networkKey) {
    const stats = this.healthStats.get(networkKey);
    if (!stats) return 'unknown';
    
    const successRate = stats.successfulRequests / stats.totalRequests;
    const rateLimitRatio = stats.rateLimitErrors / stats.totalRequests;
    
    if (rateLimitRatio > 0.3) return 'rate_limited';
    if (successRate < 0.7) return 'unhealthy';
    if (successRate < 0.9) return 'degraded';
    return 'healthy';
  }
}

/**
 * Circuit Breaker Pattern
 */
export class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}