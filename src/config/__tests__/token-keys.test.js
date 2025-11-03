import { NETWORKS } from '../networks';

describe('Token Key Validation', () => {
  describe('Condition 1: Token Keys Must Not Equal Token Symbols When Symbols Are Duplicated', () => {
    it('should ensure token keys do not equal symbols when there are duplicate symbols', () => {
      const errors = [];

      Object.entries(NETWORKS).forEach(([networkKey, network]) => {
        if (!network.tokens) return;

        // First, find symbols that appear multiple times (duplicate symbols)
        const symbolCounts = {};
        Object.entries(network.tokens).forEach(([tokenKey, tokenConfig]) => {
          const symbol = tokenConfig.symbol;
          if (!symbolCounts[symbol]) {
            symbolCounts[symbol] = [];
          }
          symbolCounts[symbol].push(tokenKey);
        });

        // Only check for key === symbol violations when the symbol is duplicated
        Object.entries(network.tokens).forEach(([tokenKey, tokenConfig]) => {
          const symbol = tokenConfig.symbol;
          // Only fail if: key equals symbol AND symbol appears multiple times
          if (tokenKey === symbol && symbolCounts[symbol].length > 1) {
            errors.push(
              `Network ${networkKey}: Token key "${tokenKey}" equals its symbol "${symbol}", ` +
              `but this symbol is used by ${symbolCounts[symbol].length} tokens: ${symbolCounts[symbol].join(', ')}. ` +
              `Keys must be unique identifiers and different from symbols when symbols are duplicated.`
            );
          }
        });
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 2: Token Keys Must Be Unique Within Network', () => {
    it('should ensure no duplicate token keys within the same network', () => {
      const errors = [];

      Object.entries(NETWORKS).forEach(([networkKey, network]) => {
        if (!network.tokens) return;

        const keys = Object.keys(network.tokens);
        const seenKeys = new Set();
        const duplicates = new Set();

        keys.forEach(key => {
          if (seenKeys.has(key)) {
            duplicates.add(key);
          } else {
            seenKeys.add(key);
          }
        });

        if (duplicates.size > 0) {
          errors.push(
            `Network ${networkKey}: Duplicate token keys found: ${Array.from(duplicates).join(', ')}`
          );
        }
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 3: Token Addresses Must Be Unique Within Network', () => {
    it('should ensure no duplicate token addresses within the same network', () => {
      const errors = [];

      Object.entries(NETWORKS).forEach(([networkKey, network]) => {
        if (!network.tokens) return;

        const addressMap = new Map(); // address -> tokenKey

        Object.entries(network.tokens).forEach(([tokenKey, tokenConfig]) => {
          if (!tokenConfig.address) return;

          const address = tokenConfig.address.toLowerCase();
          if (addressMap.has(address)) {
            const existingKey = addressMap.get(address);
            errors.push(
              `Network ${networkKey}: Duplicate token address ${tokenConfig.address} found. ` +
              `Keys: "${existingKey}" and "${tokenKey}"`
            );
          } else {
            addressMap.set(address, tokenKey);
          }
        });
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 4: Token Symbols Can Be Duplicated', () => {
    it('should allow duplicate symbols within the same network', () => {
      // This test documents that duplicate symbols are allowed
      // We'll check if there are any duplicate symbols and just log them
      const symbolCounts = {};

      Object.entries(NETWORKS).forEach(([networkKey, network]) => {
        if (!network.tokens) return;

        symbolCounts[networkKey] = {};
        Object.entries(network.tokens).forEach(([tokenKey, tokenConfig]) => {
          const symbol = tokenConfig.symbol;
          if (!symbolCounts[networkKey][symbol]) {
            symbolCounts[networkKey][symbol] = [];
          }
          symbolCounts[networkKey][symbol].push(tokenKey);
        });
      });

      // Log if there are duplicates (this is allowed, just for documentation)
      Object.entries(symbolCounts).forEach(([networkKey, symbols]) => {
        Object.entries(symbols).forEach(([symbol, keys]) => {
          if (keys.length > 1) {
            console.log(
              `Network ${networkKey}: Symbol "${symbol}" is used by ${keys.length} tokens: ${keys.join(', ')}`
            );
          }
        });
      });

      // Test passes - duplicate symbols are allowed
      expect(true).toBe(true);
    });
  });

  describe('Condition 5: Token Key Naming Convention', () => {
    it('should recommend descriptive keys that include network or address suffix for duplicate symbols', () => {
      const recommendations = [];

      Object.entries(NETWORKS).forEach(([networkKey, network]) => {
        if (!network.tokens) return;

        const symbolCounts = {};
        Object.entries(network.tokens).forEach(([tokenKey, tokenConfig]) => {
          const symbol = tokenConfig.symbol;
          if (!symbolCounts[symbol]) {
            symbolCounts[symbol] = [];
          }
          symbolCounts[symbol].push({ key: tokenKey, address: tokenConfig.address });
        });

        // Check for symbols that appear multiple times
        Object.entries(symbolCounts).forEach(([symbol, tokens]) => {
          if (tokens.length > 1) {
            const keys = tokens.map(t => t.key);
            // Check if keys are descriptive (include address suffix or network identifier)
            const descriptiveKeys = keys.filter(key => 
              key.includes('_') || 
              key.length > symbol.length ||
              key !== symbol
            );

            if (descriptiveKeys.length < keys.length) {
              recommendations.push(
                `Network ${networkKey}: Symbol "${symbol}" has ${tokens.length} tokens. ` +
                `Consider using descriptive keys like "${symbol}_${networkKey.substring(0, 3)}" or "${symbol}_${tokens[0].address.slice(-4)}" ` +
                `instead of reusing the symbol as the key.`
              );
            }
          }
        });
      });

      // Log recommendations but don't fail the test
      if (recommendations.length > 0) {
        console.log('\n📋 Token Key Naming Recommendations:');
        recommendations.forEach(rec => console.log(`  - ${rec}`));
      }

      // Test passes - these are just recommendations
      expect(true).toBe(true);
    });
  });
});

