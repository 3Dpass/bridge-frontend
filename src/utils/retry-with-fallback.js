// import { ethers } from 'ethers'; // Available for future use

/**
 * Search depth-aware retry mechanism with exponential backoff
 * Respects the search depth limits from settings to prevent infinite retries
 */
export const createSearchDepthAwareRetry = (getHistorySearchDepth, getClaimSearchDepth) => {
  return async (fn, options = {}) => {
    const {
      maxAttempts = 5,
      baseDelay = 1000,
      maxDelay = 30000,
      backoffMultiplier = 2,
      jitter = true,
      searchDepthType = 'history', // 'history' or 'claim'
      retryCondition = (error) => true,
      onRetryStatus = null
    } = options;

    // Get the current search depth limit from settings
    const searchDepthLimit = searchDepthType === 'history' 
      ? getHistorySearchDepth() 
      : getClaimSearchDepth();
    
    console.log(`🔍 Search depth limit for ${searchDepthType}: ${searchDepthLimit} hours`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        // Check if we should stop due to search depth limit
        if (searchDepthLimit && searchDepthLimit <= 0.25) { // 15 minutes minimum
          console.log(`🛑 Search depth limit reached (${searchDepthLimit}h), stopping retries`);
          throw new Error(`Search depth limit too restrictive: ${searchDepthLimit}h. Please increase search depth in settings.`);
        }

        if (attempt === maxAttempts || !retryCondition(error)) {
          throw error;
        }

        const delay = Math.min(
          baseDelay * Math.pow(backoffMultiplier, attempt - 1),
          maxDelay
        );
        
        // Apply minimum timeout of 300ms for transfers search
        const minDelay = 300;
        const finalDelay = Math.max(delay, minDelay);
        
        const jitteredDelay = jitter 
          ? finalDelay + Math.random() * finalDelay * 0.1 
          : finalDelay;
        
        console.log(`⏳ Retry attempt ${attempt}/${maxAttempts} in ${jitteredDelay}ms (search depth: ${searchDepthLimit}h)`);
        
        // Update retry status if callback provided
        if (onRetryStatus) {
          onRetryStatus({
            attempt,
            maxAttempts,
            delay: jitteredDelay,
            searchDepthLimit,
            searchDepthType,
            error: error.message
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, jitteredDelay));
      }
    }
  };
};

/**
 * Enhanced retry with HTTP 429 detection and fallback
 */
export const fetchWithRateLimitHandling = async (fn, networkKey, options = {}) => {
  const { maxRetries = 3, baseDelay = 1000 } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Check for HTTP 429 specifically
      if (error.message?.includes('429') || 
          error.code === 429 || 
          error.status === 429 ||
          (error.response && error.response.status === 429)) {
        
        console.log(`🚨 HTTP 429 detected for ${networkKey}, attempt ${attempt}/${maxRetries}`);
        
        // Record rate limit for circuit breaker
        if (window.providerManager) {
          window.providerManager.recordRateLimit(networkKey);
        }
        
        if (attempt === maxRetries) {
          // Try fallback provider
          console.log(`🔄 All retries exhausted, switching to fallback provider for ${networkKey}`);
          return await fetchWithFallbackProvider(fn, networkKey);
        }
        
        // Exponential backoff with jitter and minimum timeout
        const calculatedDelay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        const minDelay = 300; // Minimum 300ms timeout for transfers search
        const delay = Math.max(calculatedDelay, minDelay);
        console.log(`⏳ Waiting ${delay}ms before retry ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } else {
        // Non-rate-limit error, throw immediately
        throw error;
      }
    }
  }
};

/**
 * Fallback provider fetch using the enhanced provider manager
 */
const fetchWithFallbackProvider = async (fn, networkKey) => {
  console.log(`🔄 Attempting fallback provider for ${networkKey}`);
  
  if (window.providerManager) {
    try {
      // Try to get a fresh provider instance (this will use fallback if primary fails)
      window.providerManager.getProvider(networkKey, true); // useFallback = true
      
      // If we get here, the provider manager handled the fallback internally
      // We can retry the original function
      return await fn();
    } catch (error) {
      console.log(`❌ Fallback provider also failed for ${networkKey}:`, error.message);
      throw new Error(`All providers failed for ${networkKey}: ${error.message}`);
    }
  } else {
    throw new Error(`Provider manager not available for ${networkKey}`);
  }
};

/**
 * Search Depth Manager with retry integration
 */
export class SettingsAwareSearchDepthManager {
  constructor(getHistorySearchDepth, getClaimSearchDepth) {
    this.getHistorySearchDepth = getHistorySearchDepth;
    this.getClaimSearchDepth = getClaimSearchDepth;
    this.failureCount = 0;
    this.retryCount = 0;
    this.maxRetriesPerDepth = 3;
  }

  getCurrentHistoryDepth() {
    return this.getHistorySearchDepth();
  }

  getCurrentClaimDepth() {
    return this.getClaimSearchDepth();
  }

  canRetry(searchDepthType = 'history') {
    const currentDepth = searchDepthType === 'history' 
      ? this.getCurrentHistoryDepth() 
      : this.getCurrentClaimDepth();
    
    // Stop if search depth is too restrictive
    if (currentDepth <= 0.25) { // 15 minutes minimum
      console.log(`🛑 Search depth too restrictive: ${currentDepth}h`);
      return false;
    }

    // Stop if we've retried too many times
    if (this.retryCount >= this.maxRetriesPerDepth) {
      console.log(`🛑 Max retries (${this.maxRetriesPerDepth}) reached`);
      return false;
    }

    return true;
  }

  onSuccess() {
    this.failureCount = 0;
    this.retryCount = 0;
  }

  onFailure() {
    this.failureCount++;
    this.retryCount++;
  }

  shouldStopSearching(searchDepthType = 'history') {
    return !this.canRetry(searchDepthType) || this.failureCount >= 5;
  }

  getRetryOptions(searchDepthType = 'history') {
    const currentDepth = searchDepthType === 'history' 
      ? this.getCurrentHistoryDepth() 
      : this.getCurrentClaimDepth();
    
    return {
      maxAttempts: Math.min(5, this.maxRetriesPerDepth - this.retryCount),
      baseDelay: 1000,
      maxDelay: 30000,
      searchDepthType,
      searchDepthLimit: currentDepth
    };
  }
}

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
