/**
 * Get bridges for a specific network
 *
 * Extracts bridges from three sources:
 * 1. Default bridges from networkConfig.bridges
 * 2. Import bridges defined at network level (not in bridges object)
 * 3. Custom bridges that match the network (based on bridge type)
 *
 * @param {Object} networkConfig - Network configuration object
 * @param {Object} customBridges - Custom bridges from settings
 * @returns {Array} Array of bridge instances for the network
 */
export const getBridgesForNetwork = (networkConfig, customBridges = {}) => {
  // Get default bridges from network config
  const defaultBridges = networkConfig.bridges ? Object.values(networkConfig.bridges) : [];

  // Get import bridges defined at network level (not in bridges object)
  const importBridges = Object.entries(networkConfig)
    .filter(([key, value]) =>
      key !== 'bridges' &&
      key !== 'assistants' &&
      key !== 'tokens' &&
      key !== 'contracts' &&
      typeof value === 'object' &&
      value.address &&
      (value.type === 'import' || value.type === 'import_wrapper')
    )
    .map(([key, value]) => value);

  const allDefaultBridges = [...defaultBridges, ...importBridges];

  // Get custom bridges for this network
  const customNetworkBridges = Object.values(customBridges).filter(bridge => {
    // For export bridges: include when this network is the home network
    if (bridge.type === 'export') {
      return bridge.homeNetwork === networkConfig.name;
    }
    // For import bridges: include when this network is the foreign network
    if (bridge.type === 'import' || bridge.type === 'import_wrapper') {
      return bridge.foreignNetwork === networkConfig.name;
    }
    // For other types, use the old logic
    return bridge.homeNetwork === networkConfig.name || bridge.foreignNetwork === networkConfig.name;
  });

  // Combine default bridges with custom bridges, avoiding duplicates
  const networkBridgeInstances = [...allDefaultBridges];
  customNetworkBridges.forEach(customBridge => {
    const exists = networkBridgeInstances.some(bridge => bridge.address === customBridge.address);
    if (!exists) {
      networkBridgeInstances.push(customBridge);
    }
  });

  return networkBridgeInstances;
};
