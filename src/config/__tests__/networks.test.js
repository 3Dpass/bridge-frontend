import { NETWORKS, getBridgeInstances, getAssistantContracts } from '../networks';

describe('Network Configuration Validation', () => {
  let allBridges;
  let allAssistants;
  let allNetworks;

  beforeEach(() => {
    allBridges = getBridgeInstances();
    allAssistants = getAssistantContracts();
    allNetworks = Object.values(NETWORKS);
  });

  describe('Condition 0: Bridge IDs', () => {
    it('should have matching bridge IDs for Import/ImportWrapper and Export bridges', () => {
      const bridgeIds = new Map(); // bridgeId -> { export: [], import: [] }
      const errors = [];

      // Collect all bridges by bridgeId
      Object.entries(allBridges).forEach(([key, bridge]) => {
        if (!bridge.bridgeId) {
          errors.push(`Bridge ${key} is missing bridgeId`);
          return;
        }

        if (!bridgeIds.has(bridge.bridgeId)) {
          bridgeIds.set(bridge.bridgeId, { export: [], import: [] });
        }

        const entry = bridgeIds.get(bridge.bridgeId);
        if (bridge.type === 'export') {
          entry.export.push({ key, bridge });
        } else if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          entry.import.push({ key, bridge });
        }
      });

      // Check for matching pairs
      bridgeIds.forEach((bridges, bridgeId) => {
        if (bridges.export.length > 0 && bridges.import.length > 0) {
          // Valid pair exists - networks should match (home to home, foreign to foreign)
          bridges.export.forEach(exp => {
            bridges.import.forEach(imp => {
              // For a complete bridge pair:
              // Export's homeNetwork should match Import's homeNetwork
              // Export's foreignNetwork should match Import's foreignNetwork
              if (exp.bridge.homeNetwork !== imp.bridge.homeNetwork ||
                  exp.bridge.foreignNetwork !== imp.bridge.foreignNetwork) {
                errors.push(
                  `Bridge ID ${bridgeId}: Export ${exp.key} (${exp.bridge.homeNetwork} → ${exp.bridge.foreignNetwork}) ` +
                  `and Import ${imp.key} (${imp.bridge.homeNetwork} → ${imp.bridge.foreignNetwork}) have mismatched networks`
                );
              }
            });
          });
        } else if (bridges.export.length > 0 && bridges.import.length === 0) {
          errors.push(`Bridge ID ${bridgeId}: Export bridge(es) found but no matching Import/ImportWrapper`);
        } else if (bridges.import.length > 0 && bridges.export.length === 0) {
          errors.push(`Bridge ID ${bridgeId}: Import/ImportWrapper bridge(es) found but no matching Export`);
        }
      });

      expect(errors).toEqual([]);
    });

    it('should not have duplicate bridge IDs', () => {
      const bridgeIdCounts = new Map();
      const errors = [];

      Object.entries(allBridges).forEach(([key, bridge]) => {
        if (bridge.bridgeId) {
          if (!bridgeIdCounts.has(bridge.bridgeId)) {
            bridgeIdCounts.set(bridge.bridgeId, []);
          }
          bridgeIdCounts.get(bridge.bridgeId).push(key);
        }
      });

      bridgeIdCounts.forEach((keys, bridgeId) => {
        if (keys.length > 2) {
          errors.push(`Bridge ID ${bridgeId} is used by more than 2 bridges: ${keys.join(', ')}`);
        }
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 1: Networks', () => {
    it('should have matching home and foreign networks between Import/ImportWrapper and Export bridges', () => {
      const errors = [];
      const bridgePairs = new Map(); // bridgeId -> { export, import }

      // Group bridges by bridgeId
      Object.entries(allBridges).forEach(([key, bridge]) => {
        if (!bridge.bridgeId) return;

        if (!bridgePairs.has(bridge.bridgeId)) {
          bridgePairs.set(bridge.bridgeId, { export: [], import: [] });
        }

        const pair = bridgePairs.get(bridge.bridgeId);
        if (bridge.type === 'export') {
          pair.export.push({ key, bridge });
        } else if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          pair.import.push({ key, bridge });
        }
      });

      // Validate network matching
      bridgePairs.forEach((pair, bridgeId) => {
        pair.export.forEach(exp => {
          pair.import.forEach(imp => {
            // Export's home network should match Import's home network
            if (exp.bridge.homeNetwork !== imp.bridge.homeNetwork) {
              errors.push(
                `Bridge ID ${bridgeId}: Export ${exp.key} homeNetwork (${exp.bridge.homeNetwork}) ` +
                `does not match Import ${imp.key} homeNetwork (${imp.bridge.homeNetwork})`
              );
            }

            // Export's foreign network should match Import's foreign network
            if (exp.bridge.foreignNetwork !== imp.bridge.foreignNetwork) {
              errors.push(
                `Bridge ID ${bridgeId}: Export ${exp.key} foreignNetwork (${exp.bridge.foreignNetwork}) ` +
                `does not match Import ${imp.key} foreignNetwork (${imp.bridge.foreignNetwork})`
              );
            }
          });
        });
      });

      expect(errors).toEqual([]);
    });

    it('should not have duplicate bridge pairs (foreign token address + home token address)', () => {
      const pairMap = new Map(); // "foreignTokenAddress-homeTokenAddress" -> bridges[]
      const errors = [];

      Object.entries(allBridges).forEach(([key, bridge]) => {
        if (!bridge.foreignTokenAddress || !bridge.homeTokenAddress) return;

        const pairKey = `${bridge.foreignTokenAddress.toLowerCase()}-${bridge.homeTokenAddress.toLowerCase()}`;
        
        if (!pairMap.has(pairKey)) {
          pairMap.set(pairKey, []);
        }
        pairMap.get(pairKey).push({ key, bridge });
      });

      pairMap.forEach((bridges, pairKey) => {
        if (bridges.length > 2) {
          errors.push(
            `Duplicate bridge pair found (${pairKey}): ${bridges.map(b => b.key).join(', ')}`
          );
        }
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 2: Tokens', () => {
    it('should have matching foreign token addresses between Import/ImportWrapper and Export bridges', () => {
      const errors = [];
      const bridgePairs = new Map();

      // Group bridges by bridgeId
      Object.entries(allBridges).forEach(([key, bridge]) => {
        if (!bridge.bridgeId) return;

        if (!bridgePairs.has(bridge.bridgeId)) {
          bridgePairs.set(bridge.bridgeId, { export: [], import: [] });
        }

        const pair = bridgePairs.get(bridge.bridgeId);
        if (bridge.type === 'export') {
          pair.export.push({ key, bridge });
        } else if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          pair.import.push({ key, bridge });
        }
      });

      bridgePairs.forEach((pair, bridgeId) => {
        pair.export.forEach(exp => {
          pair.import.forEach(imp => {
            const expForeign = exp.bridge.foreignTokenAddress?.toLowerCase();
            const impForeign = imp.bridge.foreignTokenAddress?.toLowerCase();

            if (expForeign && impForeign && expForeign !== impForeign) {
              errors.push(
                `Bridge ID ${bridgeId}: Export ${exp.key} foreignTokenAddress (${exp.bridge.foreignTokenAddress}) ` +
                `does not match Import ${imp.key} foreignTokenAddress (${imp.bridge.foreignTokenAddress})`
              );
            }
          });
        });
      });

      expect(errors).toEqual([]);
    });

    it('should have matching home token addresses between Import/ImportWrapper and Export bridges', () => {
      const errors = [];
      const bridgePairs = new Map();

      // Group bridges by bridgeId
      Object.entries(allBridges).forEach(([key, bridge]) => {
        if (!bridge.bridgeId) return;

        if (!bridgePairs.has(bridge.bridgeId)) {
          bridgePairs.set(bridge.bridgeId, { export: [], import: [] });
        }

        const pair = bridgePairs.get(bridge.bridgeId);
        if (bridge.type === 'export') {
          pair.export.push({ key, bridge });
        } else if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          pair.import.push({ key, bridge });
        }
      });

      bridgePairs.forEach((pair, bridgeId) => {
        pair.export.forEach(exp => {
          pair.import.forEach(imp => {
            const expHome = exp.bridge.homeTokenAddress?.toLowerCase();
            const impHome = imp.bridge.homeTokenAddress?.toLowerCase();

            if (expHome && impHome && expHome !== impHome) {
              errors.push(
                `Bridge ID ${bridgeId}: Export ${exp.key} homeTokenAddress (${exp.bridge.homeTokenAddress}) ` +
                `does not match Import ${imp.key} homeTokenAddress (${imp.bridge.homeTokenAddress})`
              );
            }
          });
        });
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 3: isIssuerBurner', () => {
    it('should have isIssuerBurner: true for all Import/ImportWrapper bridges', () => {
      const errors = [];

      Object.entries(allBridges).forEach(([key, bridge]) => {
        if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          if (bridge.isIssuerBurner !== true) {
            errors.push(
              `Import/ImportWrapper bridge ${key} must have isIssuerBurner: true, but got: ${bridge.isIssuerBurner}`
            );
          }
        }
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 4: Token Configuration', () => {
    it('should have all bridge tokens configured in the tokens configuration', () => {
      const errors = [];

      Object.entries(allBridges).forEach(([bridgeKey, bridge]) => {
        // Find the network this bridge belongs to
        const network = allNetworks.find(n => {
          if (!n.bridges) return false;
          return Object.values(n.bridges).some(b => 
            b.address.toLowerCase() === bridge.address.toLowerCase()
          );
        });

        if (!network || !network.tokens) {
          errors.push(`Bridge ${bridgeKey} belongs to a network without tokens configuration`);
          return;
        }

        // Check home token - for import bridges, home token is on the home network
        // For export bridges, home token is on the current network
        const homeTokenSymbol = bridge.homeTokenSymbol;
        let homeTokenNetwork = network;
        
        if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
          // For imports, home token is on the home network
          homeTokenNetwork = allNetworks.find(n => 
            n.name === bridge.homeNetwork || n.symbol === bridge.homeNetwork
          );
        }
        
        if (homeTokenNetwork && homeTokenNetwork.tokens) {
          const homeToken = Object.values(homeTokenNetwork.tokens).find(t => t.symbol === homeTokenSymbol);
          if (!homeToken) {
            errors.push(
              `Bridge ${bridgeKey}: Home token ${homeTokenSymbol} not found in ${homeTokenNetwork.name} tokens configuration`
            );
          } else {
            // Verify address matches
            const expectedAddress = bridge.homeTokenAddress?.toLowerCase();
            const actualAddress = homeToken.address?.toLowerCase();
            if (expectedAddress && actualAddress && expectedAddress !== actualAddress) {
              errors.push(
                `Bridge ${bridgeKey}: Home token ${homeTokenSymbol} address mismatch. ` +
                `Bridge expects ${bridge.homeTokenAddress}, token config has ${homeToken.address}`
              );
            }
          }
        }

        // Check foreign token - for import bridges, foreign token is on the foreign network (where bridge is deployed)
        // For export bridges, foreign token is on the foreign network
        const foreignTokenSymbol = bridge.foreignTokenSymbol;
        let foreignTokenNetwork = network;
        
        if (bridge.type === 'export') {
          // For exports, foreign token is on the foreign network
          foreignTokenNetwork = allNetworks.find(n => 
            n.name === bridge.foreignNetwork || n.symbol === bridge.foreignNetwork
          );
        }
        // For imports, foreign token is on the same network as the bridge (where it's deployed)
        
        if (foreignTokenNetwork && foreignTokenNetwork.tokens) {
          const foreignToken = Object.values(foreignTokenNetwork.tokens).find(t => t.symbol === foreignTokenSymbol);
          if (!foreignToken) {
            errors.push(
              `Bridge ${bridgeKey}: Foreign token ${foreignTokenSymbol} not found in ${foreignTokenNetwork.name} tokens configuration`
            );
          } else {
            // Verify address matches
            const expectedAddress = bridge.foreignTokenAddress?.toLowerCase();
            const actualAddress = foreignToken.address?.toLowerCase();
            
            // For regular import bridges (not import_wrapper), the bridge address IS the foreign token address
            // Import_wrapper bridges have a separate bridge contract
            if (bridge.type === 'import') {
              const bridgeAddress = bridge.address?.toLowerCase();
              if (bridgeAddress && actualAddress && bridgeAddress !== actualAddress) {
                errors.push(
                  `Bridge ${bridgeKey}: Import bridge address (${bridge.address}) should match foreign token address (${foreignToken.address})`
                );
              }
            } else if (expectedAddress && actualAddress && expectedAddress !== actualAddress) {
              errors.push(
                `Bridge ${bridgeKey}: Foreign token ${foreignTokenSymbol} address mismatch. ` +
                `Bridge expects ${bridge.foreignTokenAddress}, token config has ${foreignToken.address}`
              );
            }
          }
        }

        // Check stake token
        if (bridge.stakeTokenSymbol) {
          const stakeToken = Object.values(network.tokens).find(t => t.symbol === bridge.stakeTokenSymbol);
          if (!stakeToken) {
            errors.push(
              `Bridge ${bridgeKey}: Stake token ${bridge.stakeTokenSymbol} not found in ${network.name} tokens configuration`
            );
          } else if (bridge.stakeTokenAddress) {
            const expectedAddress = bridge.stakeTokenAddress?.toLowerCase();
            const actualAddress = stakeToken.address?.toLowerCase();
            if (expectedAddress && actualAddress && expectedAddress !== actualAddress) {
              errors.push(
                `Bridge ${bridgeKey}: Stake token ${bridge.stakeTokenSymbol} address mismatch. ` +
                `Bridge expects ${bridge.stakeTokenAddress}, token config has ${stakeToken.address}`
              );
            }
          }
        }
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Condition 5: Assistant Validation', () => {
    it('should have assistant bridge addresses matching bridge addresses on the same network', () => {
      const errors = [];

      Object.entries(allAssistants).forEach(([assistantKey, assistant]) => {
        if (!assistant.bridgeAddress) {
          errors.push(`Assistant ${assistantKey} is missing bridgeAddress`);
          return;
        }

        // Find the network this assistant belongs to
        const network = allNetworks.find(n => {
          if (!n.assistants) return false;
          return Object.values(n.assistants).some(a => 
            a.address.toLowerCase() === assistant.address.toLowerCase()
          );
        });

        if (!network || !network.bridges) {
          errors.push(`Assistant ${assistantKey} belongs to a network without bridges configuration`);
          return;
        }

        // Check if bridge address exists in the same network
        const bridgeExists = Object.values(network.bridges).some(bridge =>
          bridge.address.toLowerCase() === assistant.bridgeAddress.toLowerCase()
        );

        if (!bridgeExists) {
          errors.push(
            `Assistant ${assistantKey}: Bridge address ${assistant.bridgeAddress} not found in ${network.name} bridges configuration`
          );
        }
      });

      expect(errors).toEqual([]);
    });
  });

  describe('Complete Bridge Validation', () => {
    it('should validate all conditions together and provide summary', () => {
      const validationResults = {
        totalBridges: 0,
        fullyOperational: 0,
        importOnly: 0,
        exportOnly: 0,
        errors: []
      };

      const bridgeIds = new Map();

      // Group bridges by bridgeId
      Object.entries(allBridges).forEach(([key, bridge]) => {
        validationResults.totalBridges++;
        
        if (bridge.bridgeId) {
          if (!bridgeIds.has(bridge.bridgeId)) {
            bridgeIds.set(bridge.bridgeId, { export: [], import: [] });
          }
          
          const entry = bridgeIds.get(bridge.bridgeId);
          if (bridge.type === 'export') {
            entry.export.push({ key, bridge });
          } else if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
            entry.import.push({ key, bridge });
          }
        }
      });

      // Classify bridges
      bridgeIds.forEach((bridges, bridgeId) => {
        const hasExport = bridges.export.length > 0;
        const hasImport = bridges.import.length > 0;

        if (hasExport && hasImport) {
          // Check if it's fully operational
          let isValid = true;
          
          bridges.export.forEach(exp => {
            bridges.import.forEach(imp => {
              // Check all conditions
              // Networks should match (home to home, foreign to foreign)
              if (exp.bridge.homeNetwork !== imp.bridge.homeNetwork ||
                  exp.bridge.foreignNetwork !== imp.bridge.foreignNetwork) {
                isValid = false;
              }
              
              const expForeign = exp.bridge.foreignTokenAddress?.toLowerCase();
              const impForeign = imp.bridge.foreignTokenAddress?.toLowerCase();
              if (expForeign && impForeign && expForeign !== impForeign) {
                isValid = false;
              }
              
              const expHome = exp.bridge.homeTokenAddress?.toLowerCase();
              const impHome = imp.bridge.homeTokenAddress?.toLowerCase();
              if (expHome && impHome && expHome !== impHome) {
                isValid = false;
              }
              
              if (imp.bridge.isIssuerBurner !== true) {
                isValid = false;
              }
            });
          });
          
          if (isValid) {
            validationResults.fullyOperational++;
          } else {
            validationResults.errors.push(`Bridge ID ${bridgeId} has matching export/import but validation failed`);
          }
        } else if (hasImport && !hasExport) {
          validationResults.importOnly++;
        } else if (hasExport && !hasImport) {
          validationResults.exportOnly++;
        }
      });

      // All individual tests should pass
      expect(validationResults.errors).toEqual([]);
      
      // Ensure we have at least some fully operational bridges
      expect(validationResults.fullyOperational).toBeGreaterThan(0);
    });
  });
});

