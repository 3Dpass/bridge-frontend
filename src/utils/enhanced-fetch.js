import { createSearchDepthAwareRetry } from './retry-with-fallback';

/**
 * Enhanced fetch functions with HTTP 429 detection and search depth awareness
 */

/**
 * Enhanced fetch claims with retry and fallback
 */
export const fetchClaimsWithFallback = async (
  fetchClaimsFromAllNetworks,
  getHistorySearchDepth,
  getClaimSearchDepth,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    enableSearchDepthAwareRetry = true
    // onRetryStatus = null // Available for future use
  } = options;

  // Create search depth-aware retry function
  const retryWithSearchDepth = createSearchDepthAwareRetry(
    getHistorySearchDepth,
    getClaimSearchDepth
  );

  // Enhanced fetch function with HTTP 429 handling
  const enhancedFetchClaims = async () => {
    try {
      return await fetchClaimsFromAllNetworks();
    } catch (error) {
      // Check for HTTP 429 specifically
      if (error.message?.includes('429') || 
          error.code === 429 || 
          error.status === 429 ||
          (error.response && error.response.status === 429)) {
        
        console.log('🚨 HTTP 429 detected in fetchClaimsFromAllNetworks');
        
        // Record rate limit for circuit breaker
        if (window.providerManager) {
          // Extract network key from error if possible
          const networkKey = extractNetworkKeyFromError(error) || 'ETHEREUM';
          window.providerManager.recordRateLimit(networkKey);
        }
        
        throw error; // Re-throw to trigger retry mechanism
      }
      
      throw error;
    }
  };

  if (enableSearchDepthAwareRetry) {
    return await retryWithSearchDepth(enhancedFetchClaims, {
      maxAttempts: maxRetries,
      baseDelay,
      searchDepthType: 'claim',
      retryCondition: (error) => {
        // Retry on HTTP 429, network errors, but not on configuration errors
        return error.message?.includes('429') || 
               error.message?.includes('network') ||
               error.message?.includes('timeout') ||
               error.code === 'NETWORK_ERROR' ||
               error.code === 'TIMEOUT';
      }
    });
  } else {
    return await enhancedFetchClaims();
  }
};

/**
 * Enhanced fetch transfers with retry and fallback
 */
export const fetchTransfersWithFallback = async (
  fetchLastTransfers,
  getHistorySearchDepth,
  getClaimSearchDepth,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    enableSearchDepthAwareRetry = true
  } = options;

  // Create search depth-aware retry function
  const retryWithSearchDepth = createSearchDepthAwareRetry(
    getHistorySearchDepth,
    getClaimSearchDepth
  );

  // Enhanced fetch function with HTTP 429 handling
  const enhancedFetchTransfers = async () => {
    try {
      return await fetchLastTransfers();
    } catch (error) {
      // Check for HTTP 429 specifically
      if (error.message?.includes('429') || 
          error.code === 429 || 
          error.status === 429 ||
          (error.response && error.response.status === 429)) {
        
        console.log('🚨 HTTP 429 detected in fetchLastTransfers');
        
        // Record rate limit for circuit breaker
        if (window.providerManager) {
          const networkKey = extractNetworkKeyFromError(error) || 'ETHEREUM';
          window.providerManager.recordRateLimit(networkKey);
        }
        
        throw error; // Re-throw to trigger retry mechanism
      }
      
      throw error;
    }
  };

  if (enableSearchDepthAwareRetry) {
    return await retryWithSearchDepth(enhancedFetchTransfers, {
      maxAttempts: maxRetries,
      baseDelay,
      searchDepthType: 'history',
      retryCondition: (error) => {
        // Retry on HTTP 429, network errors, but not on configuration errors
        return error.message?.includes('429') || 
               error.message?.includes('network') ||
               error.message?.includes('timeout') ||
               error.code === 'NETWORK_ERROR' ||
               error.code === 'TIMEOUT';
      }
    });
  } else {
    return await enhancedFetchTransfers();
  }
};

/**
 * Enhanced fetch events with chunked retry
 */
export const fetchEventsWithChunkedRetry = async (
  fetchEventsFromRecentBlocks,
  getHistorySearchDepth,
  getClaimSearchDepth,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    // chunkSize = 1000, // Available for future use
    enableSearchDepthAwareRetry = true
  } = options;

  // Create search depth-aware retry function
  const retryWithSearchDepth = createSearchDepthAwareRetry(
    getHistorySearchDepth,
    getClaimSearchDepth
  );

  // Enhanced fetch function with HTTP 429 handling
  const enhancedFetchEvents = async () => {
    try {
      return await fetchEventsFromRecentBlocks();
    } catch (error) {
      // Check for HTTP 429 specifically
      if (error.message?.includes('429') || 
          error.code === 429 || 
          error.status === 429 ||
          (error.response && error.response.status === 429)) {
        
        console.log('🚨 HTTP 429 detected in fetchEventsFromRecentBlocks');
        
        // Record rate limit for circuit breaker
        if (window.providerManager) {
          const networkKey = extractNetworkKeyFromError(error) || 'ETHEREUM';
          window.providerManager.recordRateLimit(networkKey);
        }
        
        throw error; // Re-throw to trigger retry mechanism
      }
      
      throw error;
    }
  };

  if (enableSearchDepthAwareRetry) {
    return await retryWithSearchDepth(enhancedFetchEvents, {
      maxAttempts: maxRetries,
      baseDelay,
      searchDepthType: 'history',
      retryCondition: (error) => {
        // Retry on HTTP 429, network errors, but not on configuration errors
        return error.message?.includes('429') || 
               error.message?.includes('network') ||
               error.message?.includes('timeout') ||
               error.code === 'NETWORK_ERROR' ||
               error.code === 'TIMEOUT';
      }
    });
  } else {
    return await enhancedFetchEvents();
  }
};

/**
 * Extract network key from error message
 */
const extractNetworkKeyFromError = (error) => {
  const message = error.message || '';
  
  // Look for network indicators in error message
  if (message.includes('mainnet') || message.includes('ethereum')) return 'ETHEREUM';
  if (message.includes('bsc') || message.includes('binance')) return 'BSC';
  if (message.includes('3dpass') || message.includes('threedpass')) return 'THREEDPASS';
  
  // Look for RPC URL patterns
  if (message.includes('infura.io')) return 'ETHEREUM';
  if (message.includes('alchemyapi.io')) return 'ETHEREUM';
  if (message.includes('bsc-dataseed')) return 'BSC';
  
  return null;
};

/**
 * Enhanced provider test with retry
 */
export const testProviderWithRetry = async (networkKey, maxRetries = 3) => {
  const retryWithBackoff = async (fn, attempts = 0) => {
    try {
      return await fn();
    } catch (error) {
      if (attempts >= maxRetries) {
        throw error;
      }
      
      const delay = Math.pow(2, attempts) * 1000 + Math.random() * 1000;
      console.log(`⏳ Retrying provider test for ${networkKey} in ${delay}ms (attempt ${attempts + 1})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, attempts + 1);
    }
  };

  return retryWithBackoff(async () => {
    if (window.providerManager) {
      return await window.providerManager.testProvider(networkKey);
    }
    throw new Error('Provider manager not available');
  });
};

/**
 * Get provider health status with retry
 */
export const getProviderHealthWithRetry = async (networkKey) => {
  try {
    if (window.providerManager) {
      return window.providerManager.getProviderHealth(networkKey);
    }
    return 'unknown';
  } catch (error) {
    console.error(`Failed to get provider health for ${networkKey}:`, error);
    return 'unknown';
  }
};
