/**
 * Event Cache Management
 * 
 * Provides browser storage caching for transfer events to reduce RPC calls
 * and improve performance by only searching from the most recent cached event.
 */

const CACHE_PREFIX = 'bridge_events_';
const CACHE_VERSION = '1.0';
const CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours

/**
 * Get cache key for a specific network and bridge
 * @param {string} networkKey - Network identifier (e.g., 'ETHEREUM', 'THREEDPASS')
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type ('NewExpatriation' or 'NewRepatriation')
 * @returns {string} Cache key
 */
const getCacheKey = (networkKey, bridgeAddress, eventType) => {
  return `${CACHE_PREFIX}${networkKey}_${bridgeAddress}_${eventType}_v${CACHE_VERSION}`;
};

/**
 * Get cached events for a specific network, bridge, and event type
 * @param {string} networkKey - Network identifier
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type
 * @returns {Array|null} Cached events or null if not found/expired
 */
export const getCachedEvents = (networkKey, bridgeAddress, eventType) => {
  try {
    const cacheKey = getCacheKey(networkKey, bridgeAddress, eventType);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      console.log(`🔍 No cached events found for ${networkKey}:${bridgeAddress}:${eventType}`);
      return null;
    }
    
    const parsed = JSON.parse(cached);
    const now = Date.now();
    const cacheAge = now - parsed.timestamp;
    const maxAge = CACHE_EXPIRY_HOURS * 60 * 60 * 1000; // Convert hours to milliseconds
    
    if (cacheAge > maxAge) {
      console.log(`🔍 Cache expired for ${networkKey}:${bridgeAddress}:${eventType} (age: ${Math.round(cacheAge / 1000 / 60)} minutes)`);
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    console.log(`✅ Using cached events for ${networkKey}:${bridgeAddress}:${eventType} (${parsed.events.length} events, age: ${Math.round(cacheAge / 1000 / 60)} minutes)`);
    return parsed.events;
  } catch (error) {
    console.warn(`⚠️ Error reading cached events for ${networkKey}:${bridgeAddress}:${eventType}:`, error);
    return null;
  }
};

/**
 * Cache events for a specific network, bridge, and event type
 * @param {string} networkKey - Network identifier
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type
 * @param {Array} events - Events to cache
 */
export const setCachedEvents = (networkKey, bridgeAddress, eventType, events) => {
  try {
    const cacheKey = getCacheKey(networkKey, bridgeAddress, eventType);
    const cacheData = {
      timestamp: Date.now(),
      networkKey,
      bridgeAddress,
      eventType,
      events: events,
      version: CACHE_VERSION
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`💾 Cached ${events.length} events for ${networkKey}:${bridgeAddress}:${eventType}`);
  } catch (error) {
    console.warn(`⚠️ Error caching events for ${networkKey}:${bridgeAddress}:${eventType}:`, error);
  }
};

/**
 * Get the most recent block number from cached events
 * @param {string} networkKey - Network identifier
 * @param {string} bridgeAddress - Bridge contract address
 * @param {string} eventType - Event type
 * @returns {number|null} Most recent block number or null if no cached events
 */
export const getMostRecentCachedBlock = (networkKey, bridgeAddress, eventType) => {
  const cachedEvents = getCachedEvents(networkKey, bridgeAddress, eventType);
  
  if (!cachedEvents || cachedEvents.length === 0) {
    return null;
  }
  
  // Find the highest block number in cached events
  const maxBlock = Math.max(...cachedEvents.map(event => event.blockNumber));
  console.log(`🔍 Most recent cached block for ${networkKey}:${bridgeAddress}:${eventType}: ${maxBlock}`);
  
  return maxBlock;
};

/**
 * Merge new events with cached events, removing duplicates
 * @param {Array} cachedEvents - Previously cached events
 * @param {Array} newEvents - New events to merge
 * @returns {Array} Merged and deduplicated events
 */
export const mergeEvents = (cachedEvents, newEvents) => {
  if (!cachedEvents || cachedEvents.length === 0) {
    return newEvents;
  }
  
  if (!newEvents || newEvents.length === 0) {
    return cachedEvents;
  }
  
  // Create a map of existing events by transaction hash and log index
  const existingEvents = new Map();
  cachedEvents.forEach(event => {
    const key = `${event.transactionHash}_${event.logIndex}`;
    existingEvents.set(key, event);
  });
  
  // Add new events that don't already exist
  const mergedEvents = [...cachedEvents];
  newEvents.forEach(event => {
    const key = `${event.transactionHash}_${event.logIndex}`;
    if (!existingEvents.has(key)) {
      mergedEvents.push(event);
    }
  });
  
  // Sort by block number (most recent first)
  mergedEvents.sort((a, b) => b.blockNumber - a.blockNumber);
  
  console.log(`🔗 Merged events: ${cachedEvents.length} cached + ${newEvents.length} new = ${mergedEvents.length} total`);
  
  return mergedEvents;
};

/**
 * Clear all cached events (useful for debugging or cache reset)
 */
export const clearAllCachedEvents = () => {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    
    cacheKeys.forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log(`🗑️ Cleared ${cacheKeys.length} cached event entries`);
  } catch (error) {
    console.warn('⚠️ Error clearing cached events:', error);
  }
};

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
export const getCacheStats = () => {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    
    const stats = {
      totalEntries: cacheKeys.length,
      entries: []
    };
    
    cacheKeys.forEach(key => {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          stats.entries.push({
            key,
            networkKey: parsed.networkKey,
            bridgeAddress: parsed.bridgeAddress,
            eventType: parsed.eventType,
            eventCount: parsed.events?.length || 0,
            ageMinutes: Math.round(age / 1000 / 60),
            version: parsed.version
          });
        }
      } catch (error) {
        console.warn(`⚠️ Error reading cache entry ${key}:`, error);
      }
    });
    
    return stats;
  } catch (error) {
    console.warn('⚠️ Error getting cache stats:', error);
    return { totalEntries: 0, entries: [] };
  }
};

const eventCacheUtils = {
  getCachedEvents,
  setCachedEvents,
  getMostRecentCachedBlock,
  mergeEvents,
  clearAllCachedEvents,
  getCacheStats
};

export default eventCacheUtils;
