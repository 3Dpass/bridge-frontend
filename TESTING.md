# Testing Guide

## Overview

This project uses **Jest** and **React Testing Library** for testing. Tests are located in `src/utils/__tests__/` directories alongside the code they test.

### Test Framework Stack

- **Jest**: Test runner and assertion library (via `react-scripts test`)
- **React Testing Library**: Component testing utilities
- **@testing-library/jest-dom**: Custom Jest matchers for DOM assertions
- **@testing-library/user-event**: User interaction simulation

## Running Tests

### Using npm

```bash
# Run all tests (watch mode, interactive)
npm test

# Run all tests once (CI mode)
npm test -- --watch=false

# Run specific test file
npm test -- src/utils/__tests__/retry-with-fallback.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="should track provider health"

# Run with coverage
npm test -- --coverage --watch=false
```

### Using Makefile

```bash
# Run all tests once (CI mode)
make test

# Run tests in watch mode
make test-watch

# Run tests with coverage report
make test-coverage

# Run specific test file
make test-file FILE=src/utils/__tests__/retry-with-fallback.test.js

# Run linter
make lint

# Auto-fix linting issues
make lint-fix

# Show all available commands
make help
```

## Test Structure

### Current Test Files

#### `src/utils/__tests__/retry-with-fallback.test.js`

Tests for resilient RPC call utilities:
- `createSearchDepthAwareRetry`: Exponential backoff retry mechanism
- `CircuitBreaker`: Circuit breaker pattern for failing providers
- `ProviderHealthMonitor`: Provider health tracking and status

**Key test cases:**
- Retry on failure with exponential backoff
- Stop retrying when search depth is too restrictive
- Respect max attempts limit
- Circuit breaker opens after threshold failures
- Circuit breaker closes after timeout
- Track provider health (healthy/degraded/unhealthy/rate_limited)
- Detect rate limiting errors

#### `src/utils/__tests__/settings-consistency.test.js`

Tests for settings integration with provider management:
- Custom RPC URL handling
- Settings updates and fallback provider management
- Default vs custom RPC URL selection
- Empty and partial settings handling

**Key test cases:**
- Use custom RPC URL from settings when enabled
- Fall back to default RPC URL when custom RPC is disabled
- Update fallback providers when settings change
- Handle empty and partial settings gracefully

## Testing Patterns

### Testing Utility Functions

```javascript
import { yourUtilityFunction } from '../your-utility';

describe('YourUtility', () => {
  it('should do something specific', () => {
    const result = yourUtilityFunction(input);
    expect(result).toBe(expectedValue);
  });
});
```

### Testing Async Functions

```javascript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBe(expectedValue);
});

// Or with promises
it('should reject on error', async () => {
  await expect(failingAsyncFunction()).rejects.toThrow('Error message');
});
```

### Testing Classes

```javascript
import { YourClass } from '../your-class';

describe('YourClass', () => {
  let instance;

  beforeEach(() => {
    instance = new YourClass();
  });

  it('should initialize correctly', () => {
    expect(instance.property).toBeDefined();
  });
});
```

### Testing with Mocks

```javascript
// Mock a function
const mockCallback = jest.fn();
mockCallback.mockReturnValue(42);

// Mock a module
jest.mock('../module', () => ({
  someFunction: jest.fn(() => 'mocked value')
}));
```

## Troubleshooting

### Tests Are Stuck in Watch Mode

Press `q` to quit watch mode, or use `CI=1` environment variable:

```bash
CI=1 npm test -- --watch=false
```

Or simply use:

```bash
make test
```

### Test Fails with "Cannot find module"

Ensure the import path is correct relative to the test file. Jest uses the same module resolution as your app.

### Test Fails with "TypeError: X is not a constructor"

Check that you're importing the correct export type:

```javascript
// Default export
import Something from './module';

// Named export
import { Something } from './module';

// Both
import Something, { OtherThing } from './module';
```

### Tests Pass Locally but Fail in CI

1. Check for timing issues - use `waitFor` for async operations
2. Ensure no tests depend on execution order
3. Check for environment-specific code (browser APIs, localStorage, etc.)

### Coverage Is Lower Than Expected

Run coverage report to see what's missing:

```bash
make test-coverage
```

Coverage report will be in `coverage/lcov-report/index.html`.

## Best Practices

### Write Descriptive Test Names

```javascript
// Good
it('should return empty array when no claims are found', () => { ... });

// Bad
it('works', () => { ... });
```

### Test One Thing Per Test

```javascript
// Good
it('should validate email format', () => { ... });
it('should reject empty email', () => { ... });

// Bad
it('should validate email', () => {
  // tests multiple scenarios
});
```

### Use `beforeEach` for Setup

```javascript
describe('MyClass', () => {
  let instance;

  beforeEach(() => {
    instance = new MyClass();
  });

  it('test 1', () => { ... });
  it('test 2', () => { ... });
});
```

### Mock External Dependencies

Don't make real network calls or use real Web3 providers in tests. Mock them:

```javascript
jest.mock('../provider-manager', () => ({
  getProvider: jest.fn(() => mockProvider)
}));
```

### Test Error Cases

```javascript
it('should throw error when required param is missing', () => {
  expect(() => functionCall()).toThrow('Expected error message');
});
```

### Clean Up After Tests

```javascript
afterEach(() => {
  jest.clearAllMocks();
  // Clean up any side effects
});
```

## Writing New Tests

### 1. Create Test File

Place test files next to the code they test:

```
src/utils/
  ├── your-utility.js
  └── __tests__/
      └── your-utility.test.js
```

### 2. Import Dependencies

```javascript
import { yourFunction } from '../your-utility';
```

### 3. Organize Tests with `describe`

```javascript
describe('YourUtility', () => {
  describe('specificFunction', () => {
    it('should handle case 1', () => { ... });
    it('should handle case 2', () => { ... });
  });
});
```

### 4. Write Assertions

```javascript
expect(result).toBe(expected);
expect(result).toEqual(expected); // For objects/arrays
expect(result).toBeDefined();
expect(result).toBeTruthy();
expect(array).toContain(item);
expect(fn).toThrow();
```

## CI/CD Integration

Tests run automatically in CI with:

```bash
CI=1 npm test -- --watch=false
```

The `CI=1` flag disables watch mode and runs tests once.

## Future Improvements

- Add component tests for React components
- Add integration tests for bridge operations
- Add E2E tests for complete user flows
- Set up test coverage thresholds
- Add pre-commit hooks to run tests

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
