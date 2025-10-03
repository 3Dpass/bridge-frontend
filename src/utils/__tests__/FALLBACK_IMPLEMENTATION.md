# Robust Exponential Fallback Mechanism Implementation

## Overview

This implementation provides a comprehensive solution for handling HTTP 429 (Too Many Requests) errors and other provider failures in the bridge frontend application. The system includes search depth-aware retry mechanisms, circuit breakers, provider health monitoring, and fallback providers.

## Key Features

### 1. Search Depth-Aware Retry Mechanism
- **Respects Settings**: Automatically stops retries when search depth limits are reached
- **Exponential Backoff**: Implements exponential backoff with jitter to prevent thundering herd
- **Configurable**: Supports different retry strategies for claims vs transfers
- **Smart Stopping**: Prevents infinite retries when search depth is too restrictive

### 2. Enhanced Provider Manager
- **Circuit Breaker Pattern**: Automatically opens circuit after threshold failures
- **Fallback Providers**: Uses existing network configurations from networks.js plus additional public endpoints
- **Health Monitoring**: Tracks provider performance and rate limiting
- **Automatic Recovery**: Circuit breaker closes after timeout period
- **Smart Fallback**: Avoids using the same provider as both primary and fallback

### 3. HTTP 429 Detection and Handling
- **Specific Detection**: Identifies HTTP 429 errors from various sources
- **Rate Limit Tracking**: Records rate limit occurrences per provider
- **Automatic Fallback**: Switches to alternative providers when rate limited
- **Circuit Breaker Integration**: Opens circuit breaker for consistently rate-limited providers

### 4. Provider Health Monitoring
- **Real-time Tracking**: Monitors success rates, response times, and error types
- **Health Status**: Provides health status (healthy, degraded, unhealthy, rate_limited)
- **Performance Metrics**: Tracks average response times and error patterns
- **Automatic Detection**: Identifies problematic providers automatically

### 5. Settings Validation
- **Search Depth Validation**: Ensures search depth settings are reasonable
- **Minimum Limits**: Prevents search depth below 15 minutes
- **Maximum Limits**: Prevents search depth above 1 week
- **Real-time Validation**: Validates settings when used

## Implementation Details

### Files Created/Modified

#### New Files:
1. **`src/utils/retry-with-fallback.js`**
   - Core retry mechanism with search depth awareness
   - Circuit breaker implementation
   - Provider health monitoring
   - Exponential backoff with jitter

2. **`src/utils/enhanced-fetch.js`**
   - Enhanced fetch functions with HTTP 429 detection
   - Wrapper functions for claims and transfers
   - Provider fallback logic
   - Error handling and retry integration

3. **`src/utils/__tests__/retry-with-fallback.test.js`**
   - Unit tests for retry mechanisms
   - Circuit breaker tests
   - Provider health monitoring tests

#### Modified Files:
1. **`src/utils/provider-manager.js`**
   - Enhanced with circuit breaker protection
   - Added fallback provider support
   - Integrated health monitoring
   - Wrapped provider methods with retry logic

2. **`src/components/ClaimList.js`**
   - Integrated enhanced fetch functions
   - Added retry status UI feedback
   - Enhanced error handling with specific messages
   - Added search depth information display

3. **`src/contexts/SettingsContext.js`**
   - Added search depth validation functions
   - Enhanced settings validation
   - Added validation utilities for search depth limits

## Usage Examples

### Basic Retry with Search Depth Awareness
```javascript
const retryFn = createSearchDepthAwareRetry(getHistorySearchDepth, getClaimSearchDepth);

const result = await retryFn(async () => {
  return await fetchData();
}, {
  maxAttempts: 3,
  baseDelay: 1000,
  searchDepthType: 'history'
});
```

### Enhanced Fetch with Fallback
```javascript
const claims = await fetchClaimsWithFallback(
  () => fetchClaimsFromAllNetworks(options),
  getHistorySearchDepth,
  getClaimSearchDepth,
  {
    maxRetries: 3,
    baseDelay: 1000,
    enableSearchDepthAwareRetry: true,
    onRetryStatus: (status) => {
      console.log(`Retry attempt ${status.attempt}/${status.maxAttempts}`);
    }
  }
);
```

### Provider Health Monitoring
```javascript
const health = providerManager.getProviderHealth('ETHEREUM');
// Returns: 'healthy', 'degraded', 'unhealthy', 'rate_limited', or 'unknown'
```

## Configuration

### Retry Settings
- **maxAttempts**: Maximum number of retry attempts (default: 5)
- **baseDelay**: Base delay in milliseconds (default: 1000)
- **maxDelay**: Maximum delay in milliseconds (default: 30000)
- **backoffMultiplier**: Exponential backoff multiplier (default: 2)
- **jitter**: Add randomness to delays (default: true)

### Circuit Breaker Settings
- **failureThreshold**: Number of failures before opening (default: 5)
- **timeout**: Time to wait before trying again (default: 60000ms)

### Search Depth Limits
- **Minimum**: 0.25 hours (15 minutes)
- **Maximum**: 168 hours (1 week)
- **Default**: 24 hours for history, 12 hours for claims

### Fallback Provider Configuration
The system uses a two-tier fallback approach that respects user settings:

1. **Primary Providers**: Uses the RPC URLs from settings (custom or default from `networks.js`)
   - **Default**: Uses RPC URLs configured in `networks.js`
   - **Custom**: Uses custom RPC URLs set by user in settings dialog
   - **Dynamic**: Automatically updates when user changes RPC settings

2. **Additional Fallback Providers**: Public RPC endpoints for redundancy
   - Ethereum: Cloudflare, PublicNode, Ankr
   - BSC: Binance DataSeed alternatives
   - 3DPass: Alternative 3DPass RPC endpoints

3. **Settings Consistency**: 
   - Fallback providers are automatically updated when settings change
   - Primary provider is always excluded from fallback list to prevent infinite loops
   - Custom RPC URLs from settings are respected in both primary and fallback logic

The system intelligently avoids using the same provider as both primary and fallback to prevent infinite loops.

## Error Handling

The system provides specific error messages for different failure scenarios:

1. **Search Depth Too Restrictive**: "Search depth limit too restrictive: Xh. Please increase search depth in settings."
2. **Rate Limit Exceeded**: "Rate limit exceeded. Retrying with fallback providers..."
3. **Circuit Breaker Open**: "Provider temporarily unavailable. Using fallback providers..."
4. **All Providers Failed**: "All RPC providers failed. Please check your network connection and RPC settings."

## UI Feedback

The implementation includes real-time UI feedback:

1. **Retry Status**: Shows current retry attempt and countdown
2. **Search Depth Info**: Displays current search depth settings
3. **Provider Health**: Visual indicators for provider status
4. **Loading States**: Enhanced loading messages with retry information

## Benefits

1. **Reliability**: Handles provider failures gracefully
2. **Performance**: Prevents unnecessary retries when search depth is reached
3. **User Experience**: Clear feedback about retry status and provider health
4. **Scalability**: Supports multiple fallback providers
5. **Monitoring**: Real-time visibility into provider health
6. **Configuration**: Flexible retry and fallback settings
7. **Settings Integration**: Fully respects user-configured RPC URLs and settings changes
8. **Consistency**: Primary and fallback providers use the same settings source

## Testing

The implementation includes comprehensive tests covering:
- Retry mechanism with exponential backoff
- Search depth validation and limits
- Circuit breaker functionality
- Provider health monitoring
- Error handling scenarios

## Future Enhancements

Potential improvements for future versions:
1. **Adaptive Retry**: Adjust retry parameters based on provider performance
2. **Provider Ranking**: Prioritize providers based on historical performance
3. **Load Balancing**: Distribute requests across multiple providers
4. **Metrics Dashboard**: Detailed provider performance analytics
5. **Configuration UI**: User interface for retry and fallback settings
