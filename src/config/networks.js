// Network configuration for Counterstake Bridge

export const P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802'; // native token address on 3dpass
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'; // native token address on most other networks

export const NETWORKS = {
  ETHEREUM: {
    id: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.infura.io/v3/a68b71d194e7493db5231530985b00b7',
    explorer: 'https://etherscan.io',
    erc20Precompile: false,
    isHybrid: false,
    isEVM: true,
    blockTime: 12, // Average block time in seconds
    claimBlockRatio: 2, // Average claims per block (configurable)
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    contracts: {
      // Official Counterstake Bridge contract addresses
      counterstakeFactory: '0x077231Cc83303dF37406C604c9d3F12b9DFcFc3A', // ETHEREUM_COUNTERSTAKE_FACTORY v.1.1
      assistantFactory: '0x0B7f26083d6892Ca6b410FEffA2b24A4304Fa739', // ETHEREUM_ASSISTANT_FACTORY v.1.1
    },
    oracles: {
      Oracle_1: {
        address: '0xD69cdEF8cD89F1b47d820f4b4d7133DB66E3Fc7F', // ETHEREUM oracle v.1.1
        name: 'Ethereum Oracle',
        description: 'Oracle for Ethereum price feeds',
      },
    },
    tokens: {
      ETH: {
        address: ADDRESS_ZERO,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether',
        isPrecompile: false,
        isNative: true,
      },
      USDT: {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        decimals: 6,
        name: 'Tether USD',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      USDTEA: {
        address: '0xA07a7a1514F391E1e636F2d5eB71c53ee80fC6DB',
        symbol: 'USDTEA',
        decimals: 18,
        name: 'USDTEA export assistant shares on Ethereum',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },

    },
    // Bridge instances deployed on Ethereum
    bridges: {
      // Export bridges (External -> 3DPass)
      USDT_WUSDT_EXPORT: {
        address: '0x3a96AC42A28D5610Aca2A79AE782988110108eDe',
        type: 'export',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDT',
        homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wUSDT',
        foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de',
        stakeTokenSymbol: 'USDT',
        stakeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        description: 'Ethereum USDT → 3DPass wUSDT Bridge',
        isIssuerBurner: false
      },
    },
    // Assistant contracts deployed on Ethereum
    assistants: {
      // Export Assistants
      USDT_EXPORT_ASSISTANT: {
        address: '0xA07a7a1514F391E1e636F2d5eB71c53ee80fC6DB',
        type: 'export',
        bridgeAddress: '0x3a96AC42A28D5610Aca2A79AE782988110108eDe',
        description: 'USDT Export Assistant',
        shareSymbol: 'USDTEA',
        shareName: 'USDTEA export assistant shares on Ethereum',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      }
    }
  },
  // BSC: {
  //   id: 56,
  //   name: 'Binance Smart Chain',
  //   symbol: 'BSC',
  //   rpcUrl: 'https://bsc-dataseed1.binance.org',
  //   explorer: 'https://bscscan.com',
  //   isHybrid: true,
  //   isEVM: true,
  //   erc20Precompile: false,
  //   nativeCurrency: {
  //     name: 'BNB',
  //     symbol: 'BNB',
  //     decimals: 18,
  //   },
  //   contracts: {
  //     // Official Counterstake Bridge contract addresses
  //     counterstakeFactory: '0xa5893a1A1FF15031d8AB5aC24531D3B3418612EE', // BSC_COUNTERSTAKE_FACTORY
  //     assistantFactory: '0x9F60328982ab3e34020A9D43763db43d03Add7CF', // BSC_ASSISTANT_FACTORY
  //   },
  //   oracles: {
  //     default: {
  //       address: '0xdD52899A001a4260CDc43307413A5014642f37A2', // BSC oracle
  //       name: 'BSC Oracle',
  //       description: 'Main oracle for BSC price feeds',
  //     },
  //   },
  //   tokens: {
  //     BNB: {
  //       address: ADDRESS_ZERO,
  //       symbol: 'BNB',
  //       decimals: 18,
  //       name: 'BNB token',
  //       isPrecompile: false,
  //       isNative: true,
  //     },
  //   },
  // },
  THREEDPASS: {
    id: 1333,
    name: '3DPass',
    symbol: '3DPass',
    rpcUrl: 'https://rpc-http.3dpass.org',
    explorer: 'https://3dpscan.xyz',
    isHybrid: true,
    isEVM: true,
    erc20Precompile: true,
    blockTime: 60, // Average block time in seconds (1 minute)
    claimBlockRatio: 0.5, // Average claims per block (configurable) - lower activity
    nativeCurrency: {
      name: 'P3D',
      symbol: 'P3D',
      decimals: 18,
      decimalsDisplayMultiplier: 1000000,
    },
    contracts: {
      // Updated contract addresses from bridge-setup-test.log and deploy-counterstake.log
      bridgesRegistry: '0x9092Fe0755299C57dBC8AbB59678fCc004339a3b', // BridgesRegistry from deployment
      counterstakeFactory: '0x1bB031c2Fc2b93d98569e81877E9664Bfb32db43', // CounterstakeFactory from deployment
      assistantFactory: '0x51D7976F592724401e9DAE0dC75B126D889C9C9e', // AssistantFactory from deployment
    },
    oracles: {
      Oracle_1: {
        address: '0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB', // Oracle from deployment
        name: '3DPass Oracle',
        description: 'Oracle for 3dpass tokens price feeds',
      },
    },
    tokens: {
      P3D: {
        address: P3D_PRECOMPILE_ADDRESS,
        symbol: 'P3D',
        decimals: 18,
        name: 'P3D Token',
        isPrecompile: true,
        isNative: true,
        standard: 'ERC20',
        decimalsDisplayMultiplier: 1000000,
      },
      wUSDT: {
        address: '0xfBFBfbFA000000000000000000000000000000de',
        symbol: 'wUSDT',
        decimals: 6,
        name: 'Wrapped Tether USDT on 3Dpass blockchain',
        isPrecompile: true,
        assetId: 222,
        standard: 'ERC20',
      },
      USDTIA: {
        address: '0x2Dce9B2dc9983f9b435da02a69C6F0e8A31Bf3E8',
        symbol: 'USDTIA',
        decimals: 18,
        name: 'USDT import assistant shares on 3dpass',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      WUSDTA: {
        address: '0x6F7c9FFa2250E7119B44e3496B6f6b37736035F8',
        symbol: 'WUSDTA',
        decimals: 18,
        name: 'WUSDT import assistant shares on 3dpass',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
    },
    // Bridge instances deployed on 3DPass
    bridges: {
    // Import Wrapper bridges (External -> 3DPass)
    USDT_IMPORT: {
      address: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C',
      type: 'import_wrapper',
      homeNetwork: 'Ethereum',
      homeTokenSymbol: 'USDT',
      homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      foreignNetwork: '3DPass',
      foreignTokenSymbol: 'wUSDT',
      foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de',
      stakeTokenSymbol: 'P3D',
      stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
      oracleAddress: '0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB',
      description: 'USDT Import Wrapper Bridge (Ethereum → 3DPass)',
      isIssuerBurner: true
      }
    },
    // Assistant contracts deployed on 3DPass
    assistants: {
      // Import Wrapper Assistants
      USDT_IMPORT_ASSISTANT: {
        address: '0x2Dce9B2dc9983f9b435da02a69C6F0e8A31Bf3E8',
        type: 'import_wrapper',
        bridgeAddress: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C',
        description: 'USDT Import Wrapper Assistant',
        shareSymbol: 'USDTIA',
        shareName: 'USDT import assistant shares on 3dpass',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      },
      WUSDT_IMPORT_ASSISTANT: {
        address: '0x6F7c9FFa2250E7119B44e3496B6f6b37736035F8',
        type: 'import_wrapper',
        bridgeAddress: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C',
        description: 'WUSDT Import Wrapper Assistant',
        shareSymbol: 'WUSDTA',
        shareName: 'WUSDT import assistant',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      }
    }
  }
};

// Testnet configurations
export const TESTNET_NETWORKS = {
  ETHEREUM: {
    ...NETWORKS.ETHEREUM,
    id: 5, // Goerli
    name: 'Ethereum Goerli',
    rpcUrl: 'https://goerli.infura.io/v3/YOUR_INFURA_KEY',
    explorer: 'https://goerli.etherscan.io',
    blockTime: 12, // Average block time in seconds
    claimBlockRatio: 1, // Average claims per block (configurable) - lower activity on testnet
  },
  BSC: {
    ...NETWORKS.BSC,
    id: 97, // BSC Testnet
    name: 'BSC Testnet',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    explorer: 'https://testnet.bscscan.com',
    claimBlockRatio: 0.8, // Average claims per block (configurable) - moderate activity on testnet
  },
  THREEDPASS: {
    ...NETWORKS.THREEDPASS,
    id: 1334, // 3DPass Testnet
    name: '3DPass Testnet',
    rpcUrl: 'https://test-rpc-http.3dpass.org',
    explorer: 'https://test.3dpscan.xyz',
    blockTime: 60, // Average block time in seconds (1 minute)
    claimBlockRatio: 0.2, // Average claims per block (configurable) - very low activity on testnet
  }
};

// Bridge configuration
export const BRIDGE_CONFIG = {
  // Default stake ratio (10-20%)
  defaultStakeRatio: 15,
  
  // Minimum stake amounts
  minStake: {
    ETHEREUM: '0.01',
    BSC: '0.1',
    THREEDPASS: '100',
  },
  
  // Challenging periods (in hours)
  challengingPeriods: [72, 168, 720, 1440],
  
  // Large transfer threshold
  largeThreshold: {
    ETHEREUM: '1000000000000000000000', // 1000 ETH
    BSC: '10000000000000000000000', // 10000 BNB
    THREEDPASS: '1000000000000000000000000' // 1000000 P3D
  }
};

// Helper functions
export const getNetworkById = (chainId) => {
  const allNetworks = { ...NETWORKS, ...TESTNET_NETWORKS };
  return Object.values(allNetworks).find(network => network.id === chainId);
};

export const getNetworkBySymbol = (symbol) => {
  const allNetworks = { ...NETWORKS, ...TESTNET_NETWORKS };
  return Object.values(allNetworks).find(network => network.symbol === symbol);
};

export const isTestnet = (chainId) => {
  return [5, 97, 1334].includes(chainId);
};

export const getSupportedNetworks = () => {
  return Object.values(NETWORKS);
};

export const getSupportedTestnetNetworks = () => {
  return Object.values(TESTNET_NETWORKS);
};

// Bridge instance helper functions - Updated to work with new structure
export const getBridgeInstances = () => {
  const allBridges = {};
  Object.values(NETWORKS).forEach(network => {
    if (network.bridges) {
      Object.assign(allBridges, network.bridges);
    }
    // Also include import_wrapper bridges that are defined at the network level
    // These are properties of the network object, not inside the bridges object
    Object.keys(network).forEach(key => {
      if (key.endsWith('_IMPORT') && network[key].type === 'import_wrapper') {
        allBridges[key] = network[key];
      }
    });
  });
  return allBridges;
};

export const getBridgeInstanceByAddress = (address) => {
  return Object.values(NETWORKS).reduce((found, network) => {
    if (found) return found;
    if (network.bridges) {
      return Object.values(network.bridges).find(bridge => 
    bridge.address.toLowerCase() === address.toLowerCase()
  );
    }
    return null;
  }, null);
};

export const getBridgeInstancesByType = (type) => {
  const bridges = [];
  Object.values(NETWORKS).forEach(network => {
    if (network.bridges) {
      Object.values(network.bridges).forEach(bridge => {
        if (bridge.type === type) {
          bridges.push(bridge);
        }
      });
    }
  });
  return bridges;
};

export const getBridgeInstancesByNetwork = (networkSymbol) => {
  const bridges = [];
  Object.values(NETWORKS).forEach(network => {
    if (network.bridges) {
      Object.values(network.bridges).forEach(bridge => {
        if (bridge.homeNetwork === networkSymbol || bridge.foreignNetwork === networkSymbol) {
          bridges.push(bridge);
        }
      });
    }
  });
  return bridges;
};

// Assistant contract helper functions - Updated to work with new structure
export const getAssistantContracts = () => {
  const allAssistants = {};
  Object.values(NETWORKS).forEach(network => {
    if (network.assistants) {
      Object.assign(allAssistants, network.assistants);
    }
  });
  return allAssistants;
};

export const getAssistantContractByAddress = (address) => {
  return Object.values(NETWORKS).reduce((found, network) => {
    if (found) return found;
    if (network.assistants) {
      return Object.values(network.assistants).find(assistant => 
    assistant.address.toLowerCase() === address.toLowerCase()
  );
    }
    return null;
  }, null);
};

export const getAssistantContractsByType = (type) => {
  const assistants = [];
  Object.values(NETWORKS).forEach(network => {
    if (network.assistants) {
      Object.values(network.assistants).forEach(assistant => {
        if (assistant.type === type) {
          assistants.push(assistant);
        }
      });
    }
  });
  return assistants;
};

export const getAssistantContractsByNetwork = (networkSymbol) => {
  const networkConfig = NETWORKS[networkSymbol];
  if (!networkConfig || !networkConfig.assistants) {
    return [];
  }
  
  return Object.values(networkConfig.assistants);
};

export const getAssistantContractForBridge = (bridgeAddress) => {
  return Object.values(NETWORKS).reduce((found, network) => {
    if (found) return found;
    if (network.assistants) {
      return Object.values(network.assistants).find(assistant => 
    assistant.bridgeAddress.toLowerCase() === bridgeAddress.toLowerCase()
  );
    }
    return null;
  }, null);
}; 