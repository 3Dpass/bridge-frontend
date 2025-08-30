import { ethers } from 'ethers';
import { NETWORKS } from '../config/networks';

/**
 * Provider manager for handling multiple network providers
 */
class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.settings = null;
  }

  /**
   * Update settings and clear cached providers
   * @param {Object} settings - Current settings
   */
  updateSettings(settings) {
    this.settings = settings;
    this.providers.clear(); // Clear cached providers when settings change
  }

  /**
   * Get provider for a specific network
   * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
   * @returns {ethers.providers.Provider} Provider instance
   */
  getProvider(networkKey) {
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
    
    // Create provider
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Cache the provider
    this.providers.set(networkKey, provider);
    
    return provider;
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
