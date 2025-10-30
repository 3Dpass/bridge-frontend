# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Counterstake Bridge Frontend - A React.js Web3 application enabling cross-chain token transfers between Ethereum, BSC, and 3DPass networks using a trustless counterstake mechanism.

## Development Commands

### Running the Application
```bash
pnpm start           # Start development server (default port 3000)
pnpm dev             # Alias for pnpm start
pnpm build           # Build production bundle
pnpm test            # Run tests in watch mode
```

### Code Quality
```bash
pnpm lint            # Run ESLint
pnpm lint:fix        # Auto-fix ESLint issues
```

### Testing Individual Files
```bash
# Run tests in non-interactive mode (CI/automated)
pnpm test -- --no-watch --passWithNoTests --watchAll=false

# Run specific test file in non-interactive mode
pnpm test -- --no-watch --passWithNoTests --watchAll=false src/utils/__tests__/retry-with-fallback.test.js

# Run tests by pattern
pnpm test -- --testNamePattern="test name pattern"

# Watch mode (interactive)
pnpm test -- src/utils/__tests__/retry-with-fallback.test.js
```

## Architecture Overview

### Network Configuration System

All network, bridge, and token configurations are centralized in `src/config/networks.js`. This file defines:

- **Network configurations** for Ethereum, BSC, and 3DPass
- **Bridge instances** (export, import, import_wrapper types)
- **Token configurations** including precompile addresses
- **Oracle addresses** for price feeds
- **Assistant contracts** (pooled liquidity providers)

**Critical**: When adding new bridges, follow the exact procedure documented at the top of `src/config/networks.js` (lines 1-17).

### 3DPass Precompile System

3DPass uses a unique ERC20 precompile system where native tokens (like P3D) are accessed through special precompile addresses rather than standard ERC20 contracts:

- `P3D_PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000802` (native P3D)
- `wUSDT = 0xfBFBfbFA000000000000000000000000000000de` (wrapped USDT)

All tokens on 3DPass, including the native token, are treated as ERC20 tokens via precompiles. See `src/utils/threedpass.js` for precompile handling logic.

### Bridge Types

Three distinct bridge contract types exist:

1. **Export bridges** (`src/contracts/abi.js:EXPORT_ABI`) - Lock tokens on source chain, emit expatriation events
2. **Import bridges** (`IMPORT_ABI`) - Mint/burn wrapped tokens on EVM chains (Ethereum, BSC)
3. **Import Wrapper bridges** (`IMPORT_WRAPPER_ABI`) - Wrap existing precompile tokens on 3DPass

Bridge type detection is handled in `src/utils/bridge-detector.js`.

### Context Architecture

Two main React contexts manage global state:

1. **Web3Context** (`src/contexts/Web3Context.js`)
   - Wallet connection (MetaMask-only)
   - Network detection and switching
   - Provider/signer management
   - Custom RPC URL support via settings

2. **SettingsContext** (referenced in Web3Context)
   - Custom contract addresses
   - Custom tokens
   - RPC URL overrides
   - Persisted in localStorage

### Component Structure

```
src/
├── components/
│   ├── BridgeForm.js          # Main transfer interface
│   ├── ClaimList.js           # Transfer history and claims
│   ├── AssistantsList.js      # Pooled liquidity UI
│   ├── CreateNewBridge.js     # Bridge deployment
│   ├── CreateNewAssistant.js  # Assistant deployment
│   ├── DeployNewOracle.js     # Oracle deployment
│   └── Header.js              # Wallet connection & navigation
├── utils/
│   ├── bridge-detector.js     # Auto-detect bridge type
│   ├── bridge-contracts.js    # Bridge interaction helpers
│   ├── bridge-filter.js       # Extract bridges for specific network
│   ├── data-normalizer.js     # Normalize BigNumber/amounts to strings
│   ├── event-parser.js        # Parse event args into named fields
│   ├── threedpass.js          # 3DPass precompile utilities
│   ├── token-detector.js      # Auto-detect token type
│   ├── assistant-detector.js  # Assistant type detection
│   ├── provider-manager.js    # Multi-provider with fallbacks
│   ├── retry-with-fallback.js # Resilient RPC calls
│   ├── fetch-claims.js        # Claim event fetching
│   ├── fetch-last-transfers.js # Transfer event fetching
│   └── claim-estimator.js     # Time estimation for claims
└── config/
    └── networks.js            # All network/bridge/token config
```

### Key Architectural Patterns

**Provider Management**: `provider-manager.js` implements multi-provider support with automatic fallback. When a provider fails, it rotates to the next available RPC URL.

**Event Caching**: `event-cache.js` caches blockchain events (claims, transfers) to reduce RPC calls. Cache invalidation happens on block number changes.

**Settings Integration**: Settings from localStorage can override default network configs (RPC URLs, contract addresses, tokens). See `src/utils/settings.js`.

**Decimal Handling**: P3D has special decimal handling - native P3D uses 12 decimals on-chain but 18 decimals in EVM representation. Use `decimalsDisplayMultiplier: 1000000` in token configs to compensate.

**Bridge Filtering**: `bridge-filter.js` provides centralized logic for extracting bridges relevant to a specific network. It combines default bridges from config, import bridges defined at network level, and custom bridges from user settings, with automatic deduplication.

**Data Normalization**: `data-normalizer.js` handles conversion of various amount formats (BigNumber objects, hex strings, numbers) into consistent string representations. Essential for working with event args from smart contracts.

**Event Parsing**: `event-parser.js` converts raw event args arrays into named field objects, eliminating magic array indices and improving type safety. Automatically handles amount normalization.

## Critical Implementation Details

### Bridge Instance Creation Flow

1. Deploy Oracle on both chains
2. Add home token to `tokens` config
3. Set initial Oracle prices (Token/_NATIVE_, token_symbol/_NATIVE_, _NATIVE_/token_symbol)
4. Create Import bridge instance using Oracle address
5. Add foreign token to `tokens` config
6. Add Import bridge to `bridges` config
7. Create Export bridge instance using Import bridge foreign token address
8. Add Export bridge to `bridges` config

### Assistant Types

- **Export Assistants**: Provide liquidity for export bridges (lock operations)
- **Import Assistants**: Provide liquidity for import bridges (mint/burn operations)
- **Import Wrapper Assistants**: Provide liquidity for import_wrapper bridges (3DPass-specific)

Each assistant issues ERC20 shares representing pool ownership.

### Stake Token vs Transfer Token

Bridges require stake in a designated token (often different from transfer token):
- Ethereum P3D Import: stake in ETH, transfer P3D
- 3DPass USDT Import Wrapper: stake in P3D, transfer wUSDT
- Ethereum USDT Export: stake in USDT, transfer USDT

Use `getRequiredStake()` from bridge contracts to calculate stake amounts.

### Network Detection

`Web3Context.getCurrentNetwork()` returns the active network. It prioritizes:
1. Context network (manually selected)
2. Detected network from provider
3. Custom settings-based network configuration

When MetaMask changes networks, the context automatically updates provider, signer, and network state without page reload.

## Testing Notes

Tests exist in `src/utils/__tests__/`:
- `bridge-filter.test.js` - Network-specific bridge extraction
- `data-normalizer.test.js` - Amount/BigNumber normalization
- `event-parser.test.js` - Event args parsing
- `fetch-last-transfers.test.js` - Module import validation
- `retry-with-fallback.test.js` - Provider fallback logic
- `settings-consistency.test.js` - Settings validation
- `network-switcher.test.js` - Network switching logic
- `error-parser.test.js` - Error message parsing
- `decimal-converter.test.js` - Decimal conversion utilities

Run tests with `pnpm test` for watch mode.
Run full test suite: `pnpm test -- --no-watch --passWithNoTests --watchAll=false`

## Test-Driven Development (TDD)

**MANDATORY for all code changes, features, and bug fixes.**

### Iron Law
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

### RED-GREEN-REFACTOR Cycle

1. **RED**: Write a failing test
   - Write test first showing desired behavior
   - Run test and verify it fails for the right reason
   - If test passes immediately, you're testing existing code (fix test)

2. **GREEN**: Write minimal code to pass
   - Implement simplest code to make test pass
   - No extra features, no premature optimization
   - Run test and verify it passes

3. **REFACTOR**: Clean up
   - Remove duplication
   - Improve names
   - Keep tests green

4. **Repeat**: Next test for next behavior

### Non-Negotiable Rules

- Write code before test? **Delete it. Start over.**
- Test passes immediately? **Fix test or remove it.**
- "Skip TDD just this once"? **No. That's rationalization.**
- Already manually tested? **Still need automated tests.**
- Tests after achieve same goals? **No. Tests-first prove they work.**

### Test Requirements for Commits

```
NO COMMITS ALLOWED UNLESS 100% OF TESTS PASS
```

Before any commit or pull request:
1. Run full test suite: `pnpm test -- --no-watch --passWithNoTests --watchAll=false`
2. **ALL tests must pass** - no exceptions
3. If any test fails, fix it before committing
4. Never commit with failing, skipped, or disabled tests

**Work is not complete until all tests pass.** Test failures indicate either:
- Code is broken (fix the code)
- Test expectations are wrong (fix the test)
- Edge case discovered (add proper handling)

### Exceptions

Only skip TDD with explicit permission for:
- Throwaway prototypes
- Generated code
- Configuration files

**Everything else requires TDD. No exceptions.**

## Styling

Uses Tailwind CSS with custom theme in `tailwind.config.js`:
- Custom color palette (primary, secondary, accent, success, warning, error, dark)
- Custom animations (fade-in, slide-up, pulse-slow)
- Dark theme optimized (background: `bg-dark-950`)

## Security Considerations

- **MetaMask-only**: Only MetaMask wallet is supported
- **Address validation**: All addresses validated via `ethers.utils.isAddress()`
- **Network validation**: All network switches go through MetaMask confirmation
- **No auto-connect**: Users must manually connect wallet (auto-connect disabled in Web3Context)

## Common Development Patterns

**Reading bridge settings**:
```javascript
const settings = await bridgeContract.settings();
// Returns: { tokenAddress, ratio100, counterstake_coef100, min_tx_age, min_stake, large_threshold }
```

**Detecting bridge type**:
```javascript
import { detectBridgeType } from './utils/bridge-detector';
const bridgeType = await detectBridgeType(provider, bridgeAddress);
// Returns: 'export' | 'import' | 'import_wrapper'
```

**Working with 3DPass precompiles**:
```javascript
import { get3DPassTokenByAddress, get3DPassTokenABI } from './utils/threedpass';
const tokenConfig = get3DPassTokenByAddress(tokenAddress);
const abi = get3DPassTokenABI(tokenAddress);
```

**Multi-provider with fallback**:
```javascript
import { getProvider } from './utils/provider-manager';
const provider = await getProvider('ETHEREUM', settings);
// Automatically handles fallback if primary RPC fails
```

**Filtering bridges for a network**:
```javascript
import { getBridgesForNetwork } from './utils/bridge-filter';
const bridges = getBridgesForNetwork(networkConfig, customBridges);
// Returns: Array of bridge instances for the network
// Combines default, import, and custom bridges with deduplication
```

**Normalizing event amounts**:
```javascript
import { normalizeAmount } from './utils/data-normalizer';
const amount = normalizeAmount(event.args[1]);
// Handles BigNumber, string, number, objects with hex properties
// Returns: string representation or '0' if invalid
```

**Parsing event args**:
```javascript
import { parseExpatriationEvent, parseRepatriationEvent } from './utils/event-parser';
const eventData = parseExpatriationEvent(event);
// Returns: { senderAddress, amount, reward, foreignAddress, data }

const eventData = parseRepatriationEvent(event);
// Returns: { senderAddress, amount, reward, homeAddress, data }
// Eliminates magic array indices, uses normalizeAmount internally
```
