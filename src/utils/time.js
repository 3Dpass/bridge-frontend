/**
 * Reliable External Time Utilities
 * 
 * Provides reliable external time sources for blockchain applications
 * where local system clock cannot be trusted.
 */

/**
 * Get a reliable external Unix timestamp
 * Tries multiple external time sources with fallbacks
 * 
 * @returns {Promise<number>} Unix timestamp in seconds
 */
export const getReliableTimestamp = async () => {
  try {
    // Try multiple reliable time sources
    const timeSources = [
      // WorldTimeAPI (free, reliable)
      () => fetch('https://worldtimeapi.org/api/timezone/UTC').then(res => res.json()).then(data => Math.floor(new Date(data.utc_datetime).getTime() / 1000)),
      // TimeAPI (backup)
      () => fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC').then(res => res.json()).then(data => Math.floor(new Date(data.dateTime).getTime() / 1000)),
      // NTP-style fallback using a simple time service
      () => fetch('https://api.github.com').then(res => {
        const dateHeader = res.headers.get('date');
        return dateHeader ? Math.floor(new Date(dateHeader).getTime() / 1000) : null;
      })
    ];

    // Try each source until one works
    for (const source of timeSources) {
      try {
        const timestamp = await Promise.race([
          source(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        if (timestamp && timestamp > 0) {
          console.log('✅ Got reliable external timestamp:', timestamp, new Date(timestamp * 1000).toISOString());
          return timestamp;
        }
      } catch (error) {
        console.warn('⚠️ External time source failed:', error.message);
        continue;
      }
    }

    // If all external sources fail, fall back to local time with warning
    console.warn('⚠️ All external time sources failed, falling back to local time');
    return Math.floor(Date.now() / 1000);
  } catch (error) {
    console.error('❌ Error getting reliable timestamp:', error);
    // Final fallback to local time
    return Math.floor(Date.now() / 1000);
  }
};

/**
 * Get a reliable external timestamp with custom timeout
 * 
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<number>} Unix timestamp in seconds
 */
export const getReliableTimestampWithTimeout = async (timeoutMs = 5000) => {
  try {
    const timeSources = [
      () => fetch('https://worldtimeapi.org/api/timezone/UTC').then(res => res.json()).then(data => Math.floor(new Date(data.utc_datetime).getTime() / 1000)),
      () => fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC').then(res => res.json()).then(data => Math.floor(new Date(data.dateTime).getTime() / 1000)),
      () => fetch('https://api.github.com').then(res => {
        const dateHeader = res.headers.get('date');
        return dateHeader ? Math.floor(new Date(dateHeader).getTime() / 1000) : null;
      })
    ];

    for (const source of timeSources) {
      try {
        const timestamp = await Promise.race([
          source(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
        ]);
        if (timestamp && timestamp > 0) {
          console.log('✅ Got reliable external timestamp:', timestamp, new Date(timestamp * 1000).toISOString());
          return timestamp;
        }
      } catch (error) {
        console.warn('⚠️ External time source failed:', error.message);
        continue;
      }
    }

    console.warn('⚠️ All external time sources failed, falling back to local time');
    return Math.floor(Date.now() / 1000);
  } catch (error) {
    console.error('❌ Error getting reliable timestamp:', error);
    return Math.floor(Date.now() / 1000);
  }
};

/**
 * Get current time from a specific external source
 * 
 * @param {string} source - Time source ('worldtimeapi', 'timeapi', 'github')
 * @returns {Promise<number>} Unix timestamp in seconds
 */
export const getTimestampFromSource = async (source) => {
  const sources = {
    worldtimeapi: () => fetch('https://worldtimeapi.org/api/timezone/UTC').then(res => res.json()).then(data => Math.floor(new Date(data.utc_datetime).getTime() / 1000)),
    timeapi: () => fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC').then(res => res.json()).then(data => Math.floor(new Date(data.dateTime).getTime() / 1000)),
    github: () => fetch('https://api.github.com').then(res => {
      const dateHeader = res.headers.get('date');
      return dateHeader ? Math.floor(new Date(dateHeader).getTime() / 1000) : null;
    })
  };

  if (!sources[source]) {
    throw new Error(`Unknown time source: ${source}. Available sources: ${Object.keys(sources).join(', ')}`);
  }

  try {
    const timestamp = await sources[source]();
    if (timestamp && timestamp > 0) {
      console.log(`✅ Got timestamp from ${source}:`, timestamp, new Date(timestamp * 1000).toISOString());
      return timestamp;
    } else {
      throw new Error(`Invalid timestamp received from ${source}`);
    }
  } catch (error) {
    console.error(`❌ Error getting timestamp from ${source}:`, error);
    throw error;
  }
};

/**
 * Validate if a timestamp is reasonable (not too old or in the future)
 * 
 * @param {number} timestamp - Unix timestamp in seconds
 * @param {number} maxAgeHours - Maximum age in hours (default: 24)
 * @param {number} maxFutureMinutes - Maximum future time in minutes (default: 5)
 * @returns {boolean} True if timestamp is reasonable
 */
export const validateTimestamp = (timestamp, maxAgeHours = 24, maxFutureMinutes = 5) => {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = maxAgeHours * 3600; // Convert hours to seconds
  const maxFuture = maxFutureMinutes * 60; // Convert minutes to seconds
  
  const isTooOld = timestamp < (now - maxAge);
  const isTooFuture = timestamp > (now + maxFuture);
  
  if (isTooOld) {
    console.warn(`⚠️ Timestamp is too old: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
    return false;
  }
  
  if (isTooFuture) {
    console.warn(`⚠️ Timestamp is too far in the future: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
    return false;
  }
  
  return true;
};

/**
 * Get a reliable timestamp with validation
 * 
 * @param {number} maxAgeHours - Maximum age in hours (default: 24)
 * @param {number} maxFutureMinutes - Maximum future time in minutes (default: 5)
 * @returns {Promise<number>} Validated Unix timestamp in seconds
 */
export const getValidatedReliableTimestamp = async (maxAgeHours = 24, maxFutureMinutes = 5) => {
  const timestamp = await getReliableTimestamp();
  
  if (!validateTimestamp(timestamp, maxAgeHours, maxFutureMinutes)) {
    console.warn('⚠️ External timestamp failed validation, using local time');
    return Math.floor(Date.now() / 1000);
  }
  
  return timestamp;
};

const timeUtils = {
  getReliableTimestamp,
  getReliableTimestampWithTimeout,
  getTimestampFromSource,
  validateTimestamp,
  getValidatedReliableTimestamp
};

export default timeUtils;
