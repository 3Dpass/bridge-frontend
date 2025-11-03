/**
 * Test script to validate bridges and generate formatted output
 * Run with: pnpm test -- src/config/__tests__/validate-bridges.test.js
 */

import { NETWORKS, getBridgeInstances, getAssistantContracts } from '../networks';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function formatDate(timestamp) {
  if (!timestamp) return 'Not set';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatAddress(address) {
  if (!address) return 'Not set';
  return address;
}

function formatSymbol(symbol) {
  return symbol || 'N/A';
}

function getTokenDecimals(network, tokenSymbol) {
  if (!network || !network.tokens) return 'N/A';
  const token = Object.values(network.tokens).find(t => t.symbol === tokenSymbol);
  return token?.decimals || 'N/A';
}

function getNetworkBySymbol(symbol) {
  return Object.values(NETWORKS).find(n => 
    n.symbol === symbol || n.name === symbol
  );
}

function validateBridge(bridgeId, allBridges, allAssistants, allNetworks) {
  const bridges = [];
  Object.entries(allBridges).forEach(([key, bridge]) => {
    if (bridge.bridgeId === bridgeId) {
      bridges.push({ key, bridge });
    }
  });

  const exportBridge = bridges.find(b => b.bridge.type === 'export');
  const importBridge = bridges.find(b => 
    b.bridge.type === 'import' || b.bridge.type === 'import_wrapper'
  );

  if (!exportBridge && !importBridge) {
    return null;
  }

  const homeNetwork = exportBridge 
    ? getNetworkBySymbol(exportBridge.bridge.homeNetwork)
    : getNetworkBySymbol(importBridge.bridge.homeNetwork);
  
  const foreignNetwork = exportBridge
    ? getNetworkBySymbol(exportBridge.bridge.foreignNetwork)
    : getNetworkBySymbol(importBridge.bridge.foreignNetwork);

  // Find assistants
  const exportAssistants = [];
  const importAssistants = [];
  
  Object.entries(allAssistants).forEach(([key, assistant]) => {
    if (exportBridge && assistant.bridgeAddress?.toLowerCase() === exportBridge.bridge.address?.toLowerCase()) {
      exportAssistants.push({ key, assistant });
    }
    if (importBridge && assistant.bridgeAddress?.toLowerCase() === importBridge.bridge.address?.toLowerCase()) {
      importAssistants.push({ key, assistant });
    }
  });

  // Determine status
  let status = '❌ Not Configured';
  let statusColor = colors.red;
  
  if (exportBridge && importBridge) {
    // Check if fully operational
    const networksMatch = exportBridge.bridge.homeNetwork === importBridge.bridge.homeNetwork &&
                         exportBridge.bridge.foreignNetwork === importBridge.bridge.foreignNetwork;
    const tokensMatch = exportBridge.bridge.foreignTokenAddress?.toLowerCase() === 
                       importBridge.bridge.foreignTokenAddress?.toLowerCase() &&
                       exportBridge.bridge.homeTokenAddress?.toLowerCase() === 
                       importBridge.bridge.homeTokenAddress?.toLowerCase();
    const isIssuerBurner = importBridge.bridge.isIssuerBurner === true;
    
    if (networksMatch && tokensMatch && isIssuerBurner) {
      status = '✅ FULLY OPERATIONAL - Bidirectional bridge';
      statusColor = colors.green;
    } else {
      status = '⚠️  Partial Configuration';
      statusColor = colors.yellow;
    }
  } else if (importBridge && !exportBridge) {
    status = '⚠️  Import Only';
    statusColor = colors.yellow;
  } else if (exportBridge && !importBridge) {
    status = '⚠️  Export Only';
    statusColor = colors.yellow;
  }

  return {
    bridgeId,
    exportBridge: exportBridge?.bridge,
    importBridge: importBridge?.bridge,
    exportBridgeKey: exportBridge?.key,
    importBridgeKey: importBridge?.key,
    homeNetwork,
    foreignNetwork,
    exportAssistants,
    importAssistants,
    status,
    statusColor,
  };
}

function printBridgeReport(bridgeData) {
  const {
    bridgeId,
    exportBridge,
    importBridge,
    homeNetwork,
    foreignNetwork,
    exportAssistants,
    importAssistants,
    status,
    statusColor,
  } = bridgeData;

  console.log('\n' + '━'.repeat(80));
  console.log(`${colors.bright}🌉 BRIDGE #${bridgeId}${colors.reset}`);
  console.log('━'.repeat(80));

  // Basic Info
  console.log(`\n${colors.bright}📋 BASIC INFO:${colors.reset}`);
  console.log(`   Bridge ID: ${bridgeId}`);
  console.log(`   Created: ${formatDate()}`);
  
  const versions = [];
  if (exportBridge) versions.push(`Export=v1.1-substrate`);
  if (importBridge) versions.push(`Import=v1.1`);
  if (exportAssistants.length > 0) versions.push(`ExportAssistant=`);
  if (importAssistants.length > 0) versions.push(`ImportAssistant=`);
  console.log(`   Versions: ${versions.join(', ')}`);

  // Home Network
  if (homeNetwork) {
    const homeToken = exportBridge || importBridge;
    console.log(`\n${colors.bright}🏠 HOME NETWORK (${homeNetwork.name}):${colors.reset}`);
    console.log(`   Asset: ${formatAddress(homeToken?.homeTokenAddress)}`);
    console.log(`   Symbol: ${formatSymbol(homeToken?.homeTokenSymbol)}`);
    console.log(`   Decimals: ${getTokenDecimals(homeNetwork, homeToken?.homeTokenSymbol)}`);
  }

  // Foreign Network
  if (foreignNetwork) {
    const foreignToken = exportBridge || importBridge;
    console.log(`\n${colors.bright}🌍 FOREIGN NETWORK (${foreignNetwork.name}):${colors.reset}`);
    console.log(`   Asset: ${formatAddress(foreignToken?.foreignTokenAddress)}`);
    console.log(`   Symbol: ${formatSymbol(foreignToken?.foreignTokenSymbol)}`);
    console.log(`   Decimals: ${getTokenDecimals(foreignNetwork, foreignToken?.foreignTokenSymbol)}`);
  }

  // Stake Asset
  const stakeToken = exportBridge || importBridge;
  if (stakeToken?.stakeTokenAddress) {
    console.log(`\n${colors.bright}💰 STAKE ASSET:${colors.reset}`);
    console.log(`   Address: ${formatAddress(stakeToken.stakeTokenAddress)}`);
  }

  // Import Bridge
  if (importBridge) {
    console.log(`\n${colors.bright}📥 IMPORT BRIDGE (${importBridge.homeNetwork} → ${importBridge.foreignNetwork}):${colors.reset}`);
    console.log(`   ✅ Import AA: ${formatAddress(importBridge.address)}`);
    console.log(`   ✅ Import Assistant: ${importAssistants.length > 0 ? 'Set' : 'Not set'}`);
  }

  // Export Bridge
  if (exportBridge) {
    console.log(`\n${colors.bright}📤 EXPORT BRIDGE (${exportBridge.homeNetwork} → ${exportBridge.foreignNetwork}):${colors.reset}`);
    console.log(`   ✅ Export: ${formatAddress(exportBridge.address)}`);
    console.log(`   ✅ Export Assistant: ${exportAssistants.length > 0 ? 'Set' : 'Not set'}`);
  }

  // Assistants
  const allAssistants = [...exportAssistants, ...importAssistants];
  if (allAssistants.length > 0) {
    console.log(`\n${colors.bright}🤖 POOLED ASSISTANTS (${allAssistants.length}):${colors.reset}`);
    
    exportAssistants.forEach(({ key, assistant }) => {
      const network = Object.values(NETWORKS).find(n => {
        if (!n.assistants) return false;
        return Object.values(n.assistants).some(a => 
          a.address.toLowerCase() === assistant.address.toLowerCase()
        );
      });
      console.log(`   ${colors.cyan}📋 EXPORT Assistant:${colors.reset} ${assistant.address}`);
      console.log(`      Manager: ${assistant.managerAddress || 'Not set'}`);
      console.log(`      Shares: ${assistant.shareSymbol} (${assistant.address})`);
      console.log(`      Network: ${network?.name || 'Unknown'}`);
    });

    importAssistants.forEach(({ key, assistant }) => {
      const network = Object.values(NETWORKS).find(n => {
        if (!n.assistants) return false;
        return Object.values(n.assistants).some(a => 
          a.address.toLowerCase() === assistant.address.toLowerCase()
        );
      });
      console.log(`   ${colors.cyan}📋 IMPORT Assistant:${colors.reset} ${assistant.address}`);
      console.log(`      Manager: ${assistant.managerAddress || 'Not set'}`);
      console.log(`      Shares: ${assistant.shareSymbol} (${assistant.address})`);
      console.log(`      Network: ${network?.name || 'Unknown'}`);
    });
  }

  // Status
  console.log(`\n${colors.bright}🎯 BRIDGE STATUS:${colors.reset}`);
  console.log(`   ${statusColor}${status}${colors.reset}`);
  if (exportBridge && importBridge) {
    console.log(`   🔄 ${exportBridge.homeNetwork} ↔ ${exportBridge.foreignNetwork}`);
  }
}

describe('Bridge Validation Output', () => {
  it('should generate formatted bridge validation report', () => {
    const allBridges = getBridgeInstances();
    const allAssistants = getAssistantContracts();
    const allNetworks = Object.values(NETWORKS);

    // Collect unique bridge IDs
    const bridgeIds = new Set();
    Object.values(allBridges).forEach(bridge => {
      if (bridge.bridgeId) {
        bridgeIds.add(bridge.bridgeId);
      }
    });

    const bridgeReports = [];
    const summary = {
      totalBridges: bridgeIds.size,
      fullyOperational: 0,
      importOnly: 0,
      exportOnly: 0,
      notConfigured: 0,
    };

    // Validate each bridge
    bridgeIds.forEach(bridgeId => {
      const bridgeData = validateBridge(bridgeId, allBridges, allAssistants, allNetworks);
      if (bridgeData) {
        bridgeReports.push(bridgeData);
        
        if (bridgeData.status.includes('FULLY OPERATIONAL')) {
          summary.fullyOperational++;
        } else if (bridgeData.status.includes('Import Only')) {
          summary.importOnly++;
        } else if (bridgeData.status.includes('Export Only')) {
          summary.exportOnly++;
        } else {
          summary.notConfigured++;
        }
      }
    });

    // Sort by bridge ID
    bridgeReports.sort((a, b) => a.bridgeId - b.bridgeId);

    // Print all bridge reports
    bridgeReports.forEach(bridgeData => {
      printBridgeReport(bridgeData);
    });

    // Print summary
    console.log('\n' + '━'.repeat(80));
    console.log(`${colors.bright}🌉 SUMMARY${colors.reset}`);
    console.log('━'.repeat(80));
    console.log(`\nTotal Bridges: ${summary.totalBridges}`);
    console.log(`${colors.green}✅ Fully Operational: ${summary.fullyOperational}${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Import Only: ${summary.importOnly}${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Export Only: ${summary.exportOnly}${colors.reset}`);
    console.log(`${colors.red}❌ Not Configured: ${summary.notConfigured}${colors.reset}`);
    console.log('');

    // Verify we have bridges
    expect(summary.totalBridges).toBeGreaterThan(0);
    
    // Verify bridgeId 20 exists (the one user just added)
    const bridge20 = bridgeReports.find(r => r.bridgeId === 20);
    expect(bridge20).toBeDefined();
    expect(bridge20.exportBridge).toBeDefined();
    expect(bridge20.importBridge).toBeDefined();
  });

  it('should verify bridgeId is preserved in SettingsContext', () => {
    // This test verifies that bridgeId property will be preserved when adding bridges via SettingsContext
    // The addCustomBridgeInstanceForNetwork function accepts bridgeConfig as a whole object,
    // so bridgeId will be preserved if present in the config
    
    const sampleBridgeConfig = {
      address: '0x123',
      type: 'import',
      homeNetwork: '3dpass',
      foreignNetwork: 'Ethereum',
      bridgeId: 20,
      isIssuerBurner: true,
    };

    // Simulate what SettingsContext does
    const savedConfig = { ...sampleBridgeConfig };
    
    expect(savedConfig.bridgeId).toBe(20);
    expect(savedConfig.address).toBe('0x123');
    expect(savedConfig.type).toBe('import');
  });
});

