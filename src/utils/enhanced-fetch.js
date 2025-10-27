/**
 * Enhanced fetch functions with HTTP 429 detection and retry logic
 */

/**
 * Enhanced fetch claims with retry and fallback
 */
export const fetchClaimsWithFallback = async (
  fetchClaimsFromAllNetworks,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000
    // onRetryStatus = null // Available for future use
  } = options;

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

  // Simple retry with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await enhancedFetchClaims();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`⏳ Retrying claims fetch in ${delay}ms (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Enhanced fetch transfers with retry and fallback
 */
export const fetchTransfersWithFallback = async (
  fetchLastTransfers,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000
  } = options;

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

  // Simple retry with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await enhancedFetchTransfers();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`⏳ Retrying transfers fetch in ${delay}ms (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Enhanced fetch events with chunked retry
 */
export const fetchEventsWithChunkedRetry = async (
  fetchEventsFromRecentBlocks,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000
    // chunkSize = 1000, // Available for future use
  } = options;

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

  // Simple retry with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await enhancedFetchEvents();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`⏳ Retrying events fetch in ${delay}ms (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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
