import { ethers } from 'ethers';
import { NETWORKS } from '../config/networks';
import { CircuitBreaker, ProviderHealthMonitor } from './retry-with-fallback';

/**
 * Enhanced Provider manager with circuit breaker and fallback support
 */
class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.settings = null;
    this.circuitBreakers = new Map();
    this.rateLimitCounters = new Map();
    this.fallbackProviders = new Map();
    this.healthMonitor = new ProviderHealthMonitor();
    
    // Initialize fallback providers
    this.initializeFallbacks();
  }

  /**
   * Initialize fallback providers for each network using existing network configurations
   * This method leverages the RPC URLs already configured in networks.js and adds
   * additional public endpoints for better redundancy and reliability.
   */
  initializeFallbacks() {
    // Initialize with empty fallback providers - they will be populated when settings are available
    Object.keys(NETWORKS).forEach(networkKey => {
      this.fallbackProviders.set(networkKey, []);
    });
  }

  /**
   * Update fallback providers based on current settings
   * This ensures fallback providers respect custom RPC URLs from settings
   */
  updateFallbackProviders() {
    Object.keys(NETWORKS).forEach(networkKey => {
      const network = NETWORKS[networkKey];
      if (!network.rpcUrl) return;

      // Get the current RPC URL (respecting custom settings)
      let currentRpcUrl = network.rpcUrl;
      if (this.settings && 
          this.settings[networkKey] && 
          this.settings[networkKey].customRpc && 
          this.settings[networkKey].rpcUrl) {
        currentRpcUrl = this.settings[networkKey].rpcUrl;
      }

      // Start with the current RPC URL (will be filtered out when used as fallback)
      const fallbacks = [currentRpcUrl];
      
      // Add additional fallback providers for better redundancy
      // These are public RPC endpoints that can serve as backups
      const additionalFallbacks = {
        'ETHEREUM': [
          'https://cloudflare-eth.com',
          'https://ethereum.publicnode.com',
          'https://rpc.ankr.com/eth'
        ],
        'BSC': [
          'https://bsc-dataseed1.defibit.io',
          'https://bsc-dataseed1.ninicoin.io'
        ],
        'THREEDPASS': [
          'https://rpc.3dpass.org'
        ]
      };

      // Add additional fallbacks for this network
      if (additionalFallbacks[networkKey]) {
        fallbacks.push(...additionalFallbacks[networkKey]);
      }

      this.fallbackProviders.set(networkKey, fallbacks);
    });
  }

  /**
   * Update settings and clear cached providers
   * @param {Object} settings - Current settings
   */
  updateSettings(settings) {
    this.settings = settings;
    this.providers.clear(); // Clear cached providers when settings change
    this.updateFallbackProviders(); // Update fallback providers to respect new settings
  }

  /**
   * Get provider for a specific network with circuit breaker protection
   * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
   * @param {boolean} useFallback - Whether to use fallback providers if primary fails
   * @returns {ethers.providers.Provider} Provider instance
   */
  getProvider(networkKey, useFallback = true) {
    // Ensure fallback providers are initialized if settings are available
    if (this.settings && Object.keys(this.settings).length > 0) {
      this.updateFallbackProviders();
    }

    // Check if provider is already cached
    if (this.providers.has(networkKey)) {
      return this.providers.get(networkKey);
    }

    const networkConfig = NETWORKS[networkKey];
    if (!networkConfig) {
      throw new Error(`Network ${networkKey} not found in configuration`);
    }

    let rpcUrl = networkConfig.rpcUrl;

    // Use custom RPC URL if available in settings
    if (this.settings && 
        this.settings[networkKey] && 
        this.settings[networkKey].customRpc && 
        this.settings[networkKey].rpcUrl) {
      rpcUrl = this.settings[networkKey].rpcUrl;
    }

    // Check if RPC URL is a placeholder
    if (rpcUrl.includes('YOUR_INFURA_KEY') || rpcUrl.includes('YOUR_PROJECT_ID')) {
      console.warn(`⚠️ RPC URL for ${networkKey} is a placeholder: ${rpcUrl}`);
      console.warn(`⚠️ Please configure a valid RPC URL in settings for ${networkKey}`);
      throw new Error(`RPC URL for ${networkKey} is not configured. Please set a valid RPC URL in settings.`);
    }
    
    // Create provider with circuit breaker
    const provider = this.createProviderWithCircuitBreaker(networkKey, rpcUrl, useFallback);
    
    // Cache the provider
    this.providers.set(networkKey, provider);
    
    return provider;
  }

  /**
   * Create provider with circuit breaker protection
   */
  createProviderWithCircuitBreaker(networkKey, rpcUrl, useFallback) {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Wrap provider methods with circuit breaker
    const originalCall = provider.call.bind(provider);
    const originalGetBlockNumber = provider.getBlockNumber.bind(provider);
    const originalGetNetwork = provider.getNetwork.bind(provider);
    
    // Get or create circuit breaker for this network
    if (!this.circuitBreakers.has(networkKey)) {
      this.circuitBreakers.set(networkKey, new CircuitBreaker(5, 60000)); // 5 failures, 1 minute timeout
    }
    
    const circuitBreaker = this.circuitBreakers.get(networkKey);
    
    // Wrap call method
    provider.call = async (...args) => {
      const startTime = Date.now();
      try {
        const result = await circuitBreaker.execute(() => originalCall(...args));
        this.healthMonitor.recordRequest(networkKey, provider, true, Date.now() - startTime);
        return result;
      } catch (error) {
        this.healthMonitor.recordRequest(networkKey, provider, false, Date.now() - startTime, error);
        
        // If circuit breaker is open and we have fallbacks, try fallback
        if (useFallback && error.message === 'Circuit breaker is OPEN') {
          console.log(`🔄 Circuit breaker open for ${networkKey}, trying fallback providers`);
          return this.tryFallbackProviders(networkKey, 'call', args);
        }
        
        throw error;
      }
    };
    
    // Wrap getBlockNumber method
    provider.getBlockNumber = async (...args) => {
      const startTime = Date.now();
      try {
        const result = await circuitBreaker.execute(() => originalGetBlockNumber(...args));
        this.healthMonitor.recordRequest(networkKey, provider, true, Date.now() - startTime);
        return result;
      } catch (error) {
        this.healthMonitor.recordRequest(networkKey, provider, false, Date.now() - startTime, error);
        
        if (useFallback && error.message === 'Circuit breaker is OPEN') {
          console.log(`🔄 Circuit breaker open for ${networkKey}, trying fallback providers`);
          return this.tryFallbackProviders(networkKey, 'getBlockNumber', args);
        }
        
        throw error;
      }
    };
    
    // Wrap getNetwork method
    provider.getNetwork = async (...args) => {
      const startTime = Date.now();
      try {
        const result = await circuitBreaker.execute(() => originalGetNetwork(...args));
        this.healthMonitor.recordRequest(networkKey, provider, true, Date.now() - startTime);
        return result;
      } catch (error) {
        this.healthMonitor.recordRequest(networkKey, provider, false, Date.now() - startTime, error);
        
        if (useFallback && error.message === 'Circuit breaker is OPEN') {
          console.log(`🔄 Circuit breaker open for ${networkKey}, trying fallback providers`);
          return this.tryFallbackProviders(networkKey, 'getNetwork', args);
        }
        
        throw error;
      }
    };
    
    return provider;
  }

  /**
   * Try fallback providers for a specific method
   */
  async tryFallbackProviders(networkKey, method, args) {
    const fallbackUrls = this.fallbackProviders.get(networkKey) || [];
    
    // Get the current primary provider URL (respecting custom settings)
    const networkConfig = NETWORKS[networkKey];
    let primaryUrl = networkConfig?.rpcUrl;
    
    if (this.settings && 
        this.settings[networkKey] && 
        this.settings[networkKey].customRpc && 
        this.settings[networkKey].rpcUrl) {
      primaryUrl = this.settings[networkKey].rpcUrl;
    }
    
    // Filter out the primary provider URL from fallbacks to avoid infinite loops
    const actualFallbacks = fallbackUrls.filter(url => url !== primaryUrl);
    
    if (actualFallbacks.length === 0) {
      console.log(`⚠️ No fallback providers available for ${networkKey} (excluding primary)`);
      throw new Error(`No fallback providers available for ${networkKey}`);
    }
    
    for (const fallbackUrl of actualFallbacks) {
      try {
        console.log(`🔄 Trying fallback provider: ${fallbackUrl}`);
        const fallbackProvider = new ethers.providers.JsonRpcProvider(fallbackUrl);
        const result = await fallbackProvider[method](...args);
        console.log(`✅ Fallback provider succeeded: ${fallbackUrl}`);
        return result;
      } catch (error) {
        console.log(`❌ Fallback provider failed: ${fallbackUrl}`, error.message);
        continue;
      }
    }
    
    throw new Error(`All fallback providers failed for ${networkKey}`);
  }

  /**
   * Record rate limit for a network
   */
  recordRateLimit(networkKey) {
    const current = this.rateLimitCounters.get(networkKey) || 0;
    this.rateLimitCounters.set(networkKey, current + 1);
    
    // If too many rate limits, open circuit breaker
    if (current >= 3) {
      const circuitBreaker = this.circuitBreakers.get(networkKey);
      if (circuitBreaker) {
        circuitBreaker.state = 'OPEN';
        circuitBreaker.lastFailureTime = Date.now();
        console.log(`🚨 Circuit breaker opened for ${networkKey} due to rate limiting`);
      }
    }
  }

  /**
   * Get provider health status
   */
  getProviderHealth(networkKey) {
    return this.healthMonitor.getProviderHealth(networkKey);
  }

  /**
   * Get providers for multiple networks
   * @param {Array<string>} networkKeys - Array of network keys
   * @returns {Object} Object with network keys as keys and providers as values
   */
  getProviders(networkKeys) {
    const providers = {};
    networkKeys.forEach(networkKey => {
      providers[networkKey] = this.getProvider(networkKey);
    });
    return providers;
  }

  /**
   * Get all available network providers
   * @returns {Object} Object with all network providers
   */
  getAllProviders() {
    return this.getProviders(Object.keys(NETWORKS));
  }

  /**
   * Test provider connectivity
   * @param {string} networkKey - Network key
   * @returns {Promise<boolean>} True if provider is working
   */
  async testProvider(networkKey) {
    try {
      const provider = this.getProvider(networkKey);
      await provider.getNetwork();
      return true;
    } catch (error) {
      console.error(`Provider test failed for ${networkKey}:`, error);
      return false;
    }
  }

  /**
   * Test all providers
   * @returns {Promise<Object>} Object with network keys and connectivity status
   */
  async testAllProviders() {
    const results = {};
    const networkKeys = Object.keys(NETWORKS);
    
    await Promise.all(
      networkKeys.map(async (networkKey) => {
        results[networkKey] = await this.testProvider(networkKey);
      })
    );
    
    return results;
  }

  /**
   * Clear cached providers
   */
  clearCache() {
    this.providers.clear();
  }

  /**
   * Get provider info for a network
   * @param {string} networkKey - Network key
   * @returns {Object} Provider info including RPC URL and network details
   */
  getProviderInfo(networkKey) {
    const networkConfig = NETWORKS[networkKey];
    if (!networkConfig) {
      return null;
    }

    let rpcUrl = networkConfig.rpcUrl;
    let isCustom = false;

    if (this.settings && 
        this.settings[networkKey] && 
        this.settings[networkKey].customRpc && 
        this.settings[networkKey].rpcUrl) {
      rpcUrl = this.settings[networkKey].rpcUrl;
      isCustom = true;
    }

    return {
      networkKey,
      networkName: networkConfig.name,
      rpcUrl,
      isCustom,
      chainId: networkConfig.id
    };
  }
}

// Create singleton instance
const providerManager = new ProviderManager();

// Make it globally available for retry mechanisms
if (typeof window !== 'undefined') {
  window.providerManager = providerManager;
}

export default providerManager;

/**
 * Get provider for a specific network
 * @param {string} networkKey - Network key
 * @returns {ethers.providers.Provider} Provider instance
 */
export const getProvider = (networkKey) => providerManager.getProvider(networkKey);

/**
 * Get providers for multiple networks
 * @param {Array<string>} networkKeys - Array of network keys
 * @returns {Object} Object with network keys as keys and providers as values
 */
export const getProviders = (networkKeys) => providerManager.getProviders(networkKeys);

/**
 * Update provider manager settings
 * @param {Object} settings - Current settings
 */
export const updateProviderSettings = (settings) => providerManager.updateSettings(settings);

/**
 * Test provider connectivity
 * @param {string} networkKey - Network key
 * @returns {Promise<boolean>} True if provider is working
 */
export const testProvider = (networkKey) => providerManager.testProvider(networkKey);

/**
 * Test all providers
 * @returns {Promise<Object>} Object with network keys and connectivity status
 */
export const testAllProviders = () => providerManager.testAllProviders();
