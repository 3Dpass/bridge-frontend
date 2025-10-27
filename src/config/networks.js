// New bridges are created over the WEB User Interface. Navigate "Settings" to create new ones.
// ----------------------------------------------------------------------------------------------
// Creating neww bridges:
// Adhere the following procedure exaclty to add new bridges into the configuration!
// ----------------------------------------------------------------------------------------------
// 1. Deploy Oracle on both source and destination blockchains
// 2. Add home token to the `tokens` configuration under the chain it is going to be exported from
// 3. Set up initial prices to the oracles (required: Token_address/_NATIVE_, token_symbol/_NAITVE_, _NATIVE_/Token_symbol)
// 4. Create Import bridge instance on destination blockchain using the Oracle address and the home token address
// 5. Add foreign token from Import bridge to the `tokens` configuraton (For Import Wrapper type the foreign token address must be added before the instance creation)
// 6. Add Import bridge instance to the `bridges` configuration under the chain it is deployed to
// 7. Create Export bridge instance on source blockchain using the Import bridge foreign token address
// 8. Add Export bridge instance to the `bridges` configuration under the chain it is deployed to
// ----------------------------------------------------------------------------------------------
// Creating new pooled assistants:
// 1. Navigate "Settings" to create new ones over the WEB User Interface.
// 2. Add new assistants to the configuration under the chain it is deployed to

// Counterstake Bridge configuration

export const P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802'; // native token address on 3dpass
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'; // native token address on most other networks

export const NETWORKS = {
  // Ethereum network configuration
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
      // CORE Counterstake contracts deployed on Ethereum
      counterstakeFactory: '0x077231Cc83303dF37406C604c9d3F12b9DFcFc3A', // ETHEREUM_COUNTERSTAKE_FACTORY v.1.1
      assistantFactory: '0x0B7f26083d6892Ca6b410FEffA2b24A4304Fa739', // ETHEREUM_ASSISTANT_FACTORY v.1.1
    },
    oracles: {
      // Oracle contracts deployed on Ethereum
      ORACLE_1: {
        address: '0xD69cdEF8cD89F1b47d820f4b4d7133DB66E3Fc7F', // ETHEREUM oracle v.1.1
        name: '3DPass Oracle',
        description: 'Oracle providing price feeds for 3DPass bridges on Ethereum',
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
      P3D: {
        address: '0x4f3a4e37701402C61146071309e45A15843025E1',
        symbol: 'P3D',
        decimals: 18,
        name: 'Bridged 3dpass P3D on Ethereum blockchain',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
        decimalsDisplayMultiplier: 1000000, // Multiplier for displaying decimals in the UI to compensate the differennce between Native P3D (12 decimals) and EVM P3D (18 decimals)
      },
      P3DIA: {
        address: '0x0C5c51Ca6104b8907349513bde13eE3f992bBc08',
        symbol: 'P3DIA',
        decimals: 18,
        name: 'P3D Import Assistant Shares',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
    },
    // Bridge instances deployed on Ethereum
    bridges: {
      // Export bridge contracts (Ethereum <-> 3dpass)
      USDT_WUSDT_EXPORT: {
        address: '0x3a96AC42A28D5610Aca2A79AE782988110108eDe', // Not an ERC20 token itself, but a bridge contract that controls locked supply of USDT on Ethereum
        type: 'export',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDT',
        homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Matches homeTokenAddress on 3dpass USDT_ImportWrapper bridge
        foreignNetwork: '3dpass',
        foreignTokenSymbol: 'wUSDT',
        foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de', // Matches foreignTokenAddress on 3dpass USDT_ImportWrapper bridge
        stakeTokenSymbol: 'USDT',
        stakeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Stake is required for Claiming USDT on the way back home from 3dpass to Ethereum
        description: 'Ethereum USDT → 3DPass wUSDT Bridge',
        isIssuerBurner: false // This bridge can only lock and unlock USDT on Ethereum
      },
      // Import bridge contracts (3dpass <-> Ethereum)
      P3D_IMPORT: {
        address: '0x4f3a4e37701402C61146071309e45A15843025E1', // ERC20 token itself, matches the P3D token address on Ethereum
        type: 'import',
        homeNetwork: '3dpass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS, // Matches homeTokenAddress on 3dpass P3D_Export bridge
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'P3D',
        foreignTokenAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // Matches foreignTokenAddress on 3dpass P3D_Export bridge
        stakeTokenSymbol: 'ETH',
        stakeTokenAddress: ADDRESS_ZERO, // Stake is required for Claiming P3D on the way from 3dpass to Ethereum
        oracleAddress: '0xD69cdEF8cD89F1b47d820f4b4d7133DB66E3Fc7F',
        description: 'P3D Import Bridge (3DPass → Ethereum)',
        isIssuerBurner: true // This bridge is issuer and burner of P3D on Ethereum
        }
    },
    // Assistant contracts deployed on Ethereum
    assistants: {
      // Export Assistants
      USDT_EXPORT_ASSISTANT: {
        address: '0xA07a7a1514F391E1e636F2d5eB71c53ee80fC6DB', // ERC20 token itself, matches the USDTEA token address on Ethereum
        type: 'export',
        bridgeAddress: '0x3a96AC42A28D5610Aca2A79AE782988110108eDe', // Matches the bridge address on Ethereum USDT_WUSDT_EXPORT
        description: 'USDT Export Assistant',
        shareSymbol: 'USDTEA',
        shareName: 'USDTEA export assistant shares on Ethereum',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      },
       // Import Assistants
      P3D_IMPORT_ASSISTANT: {
        address: '0x0C5c51Ca6104b8907349513bde13eE3f992bBc08', // ERC20 token itself, matches the P3DIA token address on Ethereum
        type: 'import',
        bridgeAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // Matches the bridge address on Ethereum P3D_IMPORT
        description: 'P3D Import Assistant',
        shareSymbol: 'P3DIA',
        shareName: 'P3D Import Assistant Shares',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      }
    }
  }, 
  // BSC network configuration
  BSC: {
    id: 56,
    name: 'BSC',
    symbol: 'BSC',
    rpcUrl: 'https://bsc-mainnet.infura.io/v3/a68b71d194e7493db5231530985b00b7', // https://bsc-dataseed1.binance.org
    explorer: 'https://bscscan.com',
    isHybrid: false,
    isEVM: true,
    erc20Precompile: false,
    blockTime: 3, // Average block time in seconds (BSC is ~3 seconds)
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    contracts: {
      // CORE Counterstake contracts deployed on BSC
      // counterstakeFactory: '0x91C79A253481bAa22E7E481f6509E70e5E6A883F', // v.1.0
      counterstakeFactory: '0x472Af6Fdf5677C5B4A7F718Dc6baF8c9f86db7FB', // BSC_COUNTERSTAKE_FACTORY 1.1
      // assistantFactory: '0xd634330ca14524A43d193E1c2e92cbaB72952896', // v.1.0
      assistantFactory: '0x65f7CB5A76c975ff763BeAE41b761861D019301c', // BSC_ASSISTANT_FACTORY 1.1
    },
    oracles: {
      ORACLE_1: {
        address: '0xD69cdEF8cD89F1b47d820f4b4d7133DB66E3Fc7F', // 3dpass oracle
        name: '3DPass Oracle',
        description: 'Oracle providing price feeds for 3DPass bridges on BSC',
      }
    },
    tokens: {
      BNB: {
        address: ADDRESS_ZERO,
        symbol: 'BNB',
        decimals: 18,
        name: 'BNB token',
        isPrecompile: false,
        isNative: true,
      },
      P3D: {
        address: '0x078E7A2037b63846836E9d721cf2dabC08b94281',
        symbol: 'P3D',
        decimals: 18,
        name: 'Bridged 3dpass P3D on Binance Smart Chain blockchain',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
        decimalsDisplayMultiplier: 1000000, // Multiplier for displaying decimals in the UI to compensate the differennce between Native P3D (12 decimals) and EVM P3D (18 decimals)
      },
      P3DIAS: {
        address: '0xdaBb6424Fc6D256c8E01D091c2a0360bAcf1399E',
        symbol: 'P3DIAS',
        decimals: 18,
        name: 'P3D import assistant shares on BSC',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
    },
      // Bridge instances deployed on BSC
      bridges: {
      // Import bridge contracts (3dpass <-> BSC)
      P3D_IMPORT_2: {
        address: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // ERC20 token itself, matches the P3D token address on BSC
        type: 'import',
        homeNetwork: '3dpass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS, // Matches homeTokenAddress on 3dpass P3D_Export bridge
        foreignNetwork: 'BSC',
        foreignTokenSymbol: 'P3D',
        foreignTokenAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // Matches foreignTokenAddress on 3dpass P3D_Export bridge
        stakeTokenSymbol: 'BNB',
        stakeTokenAddress: ADDRESS_ZERO, // Stake is required for Claiming P3D on the way from 3dpass to BSC
        oracleAddress: '0xD69cdEF8cD89F1b47d820f4b4d7133DB66E3Fc7F',
        description: 'P3D Import Bridge (3DPass → BSC)',
        isIssuerBurner: true // This bridge is issuer and burner of P3D on BSC
       }
     },  
        // Assistant contracts deployed on Ethereum
    assistants: {
       // Import Assistants
      P3D_IMPORT_ASSISTANT_2: {
        address: '0xdaBb6424Fc6D256c8E01D091c2a0360bAcf1399E', // ERC20 token itself, matches the P3DIA token address on BSC
        type: 'import',
        bridgeAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // Matches the bridge address on Ethereum P3D_IMPORT
        description: 'P3D Import Assistant on BSC',
        shareSymbol: 'P3DIAS',
        shareName: 'P3D import assistant shares on BSC',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      }
    }  
  },
  // 3DPass network configuration
  THREEDPASS: {
    id: 1333,
    name: '3dpass',
    symbol: 'P3D',
    rpcUrl: 'https://rpc-http.3dpass.org',
    explorer: 'https://3dpscan.xyz',
    isHybrid: true,
    isEVM: true,
    erc20Precompile: true,
    blockTime: 60, // Average block time in seconds (1 minute)
    claimBlockRatio: 0.5, // Average claims per block (configurable) - lower activity
    nativeCurrency: {
      name: '3dpass',
      symbol: 'P3D',
      decimals: 18,
      decimalsDisplayMultiplier: 1000000, // Multiplier for displaying decimals in the UI to compensate the differennce between Native P3D (12 decimals) and EVM P3D (18 decimals)
    },
    contracts: {
      // CORE Counterstake contracts deployed on 3dpass
      bridgesRegistry: '0x9092Fe0755299C57dBC8AbB59678fCc004339a3b', // BridgesRegistry from deployment
      counterstakeFactory: '0x1bB031c2Fc2b93d98569e81877E9664Bfb32db43', // CounterstakeFactory from deployment
      assistantFactory: '0x51D7976F592724401e9DAE0dC75B126D889C9C9e', // AssistantFactory from deployment
    },
    oracles: {
      ORACLE_1: {
        address: '0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB', // Oracle from deployment
        name: '3DPass Oracle',
        description: 'Oracle providing price feeds for 3dpass bridges on 3dpass',
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
        isPrecompile: true, // Cross-platform Substrate-EVM 3dpass token
        assetId: 222,
        standard: 'ERC20',
      },
      USDTIA: {
        address: '0x2Dce9B2dc9983f9b435da02a69C6F0e8A31Bf3E8',
        symbol: 'USDTIA',
        decimals: 18,
        name: 'USDT import assistant shares on 3dpass',
        isPrecompile: false, // Regular ERC20 token
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
      P3DEA: {
        address: '0xCf710B8715869b7fEd296275bEFCE275d69bDEd9',
        symbol: 'P3DEA',
        decimals: 18,
        name: 'P3D Export Assistant Shares',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      P3DEAS: {
        address: '0x8de2F4FF2392d9f967c374469b70cc834a38766b',
        symbol: 'P3DEAS',
        decimals: 18,
        name: 'P3D Export Assistant Shares 3dpass-BSC',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      }
    },
    // Bridge instances deployed on 3DPass
    bridges: {
    // Import Wrapper bridges (Ethereum -> 3DPass)
    USDT_IMPORT: {
        address: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C', // Not an ERC20 token itself, but a bridge contract that controls supply of wUSDT on 3dpass
        type: 'import_wrapper',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDT',
        homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Matches homeTokenAddress on Ethereum USDT_Export bridge
        foreignNetwork: '3dpass',
        foreignTokenSymbol: 'wUSDT',
        foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de', // Matches foreignTokenAddress on Ethereum USDT_Export bridge
        stakeTokenSymbol: 'P3D',
        stakeTokenAddress: P3D_PRECOMPILE_ADDRESS, // Stake is required for Claiming wUSDT on the way from Ethereum to 3dpass
        oracleAddress: '0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB',
        description: 'USDT Import Wrapper Bridge (Ethereum → 3DPass)',
        isIssuerBurner: true // This bridge is issuer and burner of wUSDT on 3dpass
      },
      // Export bridges (3dpass <-> Ethereum)
      P3D_EXPORT: {
        address: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F', // Not an ERC20 token itself, but a bridge contract that controls locked supply of P3D on 3dpass
        type: 'export',
        homeNetwork: '3dpass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS, // Matches homeTokenAddress on Ethereum P3D_Import bridge
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'P3D',
        foreignTokenAddress: '0x4f3a4e37701402C61146071309e45A15843025E1', // Matches foreignTokenAddress on Ethereum P3D_Import bridge
        stakeTokenSymbol: 'P3D',
        stakeTokenAddress: P3D_PRECOMPILE_ADDRESS, // Stake is required for Claiming P3D on the way back home from Ethereum to 3dpass
        description: '3DPass P3D → Ethereum P3D Bridge',
        isIssuerBurner: false // This bridge can only lock and unlock P3D on 3dpass
      },
      P3D_EXPORT_2: {
        address: '0x65101a5889F33E303b3753aa7311161F6C708F27', // Not an ERC20 token itself, but a bridge contract that controls locked supply of P3D on 3dpass
        type: 'export',
        homeNetwork: '3dpass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS, // Matches homeTokenAddress on BSC P3D_Import bridge
        foreignNetwork: 'BSC',
        foreignTokenSymbol: 'P3D',
        foreignTokenAddress: '0x078E7A2037b63846836E9d721cf2dabC08b94281', // Matches foreignTokenAddress on BSC P3D_Import bridge
        stakeTokenSymbol: 'P3D',
        stakeTokenAddress: P3D_PRECOMPILE_ADDRESS, // Stake is required for Claiming P3D on the way back home from BSC to 3dpass
        description: '3DPass P3D → BSC P3D Bridge',
        isIssuerBurner: false // This bridge can only lock and unlock P3D on 3dpass
      },
    },
    // Assistant contracts deployed on 3DPass
    assistants: {
      // Import Wrapper Assistants
      USDT_IMPORT_ASSISTANT: {
        address: '0x2Dce9B2dc9983f9b435da02a69C6F0e8A31Bf3E8', // ERC20 token itself, matches the USDTIA token address on 3dpass
        type: 'import_wrapper',
        bridgeAddress: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C', // Matches the bridge address on 3dpass USDT_IMPORT
        description: 'USDT Import Wrapper Assistant',
        shareSymbol: 'USDTIA',
        shareName: 'USDT import assistant shares on 3dpass',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      },
      WUSDT_IMPORT_ASSISTANT: {
        address: '0x6F7c9FFa2250E7119B44e3496B6f6b37736035F8', // ERC20 token itself, matches the WUSDTA token address on 3dpass
        type: 'import_wrapper',
        bridgeAddress: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C', // Matches the bridge address on 3dpass USDT_IMPORT
        description: 'WUSDT Import Wrapper Assistant',
        shareSymbol: 'WUSDTA',
        shareName: 'WUSDT import assistant',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      },
      P3D_EXPORT_ASSISTANT: {
        address: '0xCf710B8715869b7fEd296275bEFCE275d69bDEd9', // ERC20 token itself, matches the P3DEA token address on 3dpass
        type: 'export_wrapper',
        bridgeAddress: '0x50fcE1D58b41c3600C74de03238Eee71aFDfBf1F', // Matches the bridge address on 3dpass P3D_EXPORT
        description: 'P3D Export Assistant 3dpass-Ethereum',
        shareSymbol: 'P3DEA',
        shareName: 'P3D Import Assistant Shares',
        managerAddress: '0x067Fac51f31Dc80263D55f9980DF1358357DC10d'
      },
      P3D_EXPORT_ASSISTANT_2: {
        address: '0x8de2F4FF2392d9f967c374469b70cc834a38766b', // ERC20 token itself, matches the P3DEAS token address on 3dpass
        type: 'export_wrapper',
        bridgeAddress: '0x65101a5889F33E303b3753aa7311161F6C708F27', // Matches the bridge address on 3dpass P3D_EXPORT_2
        description: 'P3D Export Assistant 3Dpass-BSC',
        shareSymbol: 'P3DEAS',
        shareName: 'P3D Export Assistant Shares 3dpass-BSC',
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

// Bridge direction helper functions
export const getBridgeDirections = () => {
  const directions = [];
  const processedPairs = new Set();
  
  // Get all bridges
  const allBridges = getBridgeInstances();
  
  // Find matching export/import pairs
  Object.entries(allBridges).forEach(([exportKey, exportBridge]) => {
    if (exportBridge.type !== 'export') return;
    
    // Find matching import bridge
    Object.entries(allBridges).forEach(([importKey, importBridge]) => {
      if (importBridge.type !== 'import' && importBridge.type !== 'import_wrapper') return;
      
      // Check if foreign token addresses match (indicating they're a pair)
      if (exportBridge.foreignTokenAddress === importBridge.foreignTokenAddress) {
        const pairKey = `${exportBridge.homeNetwork}-${exportBridge.foreignNetwork}`;
        
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);
          
          directions.push({
            id: pairKey,
            name: `${exportBridge.homeTokenSymbol} ${exportBridge.homeNetwork} ↔ ${importBridge.foreignTokenSymbol} ${importBridge.foreignNetwork}`,
            description: `${exportBridge.description} / ${importBridge.description}`,
            exportBridge: {
              key: exportKey,
              ...exportBridge
            },
            importBridge: {
              key: importKey,
              ...importBridge
            },
            homeNetwork: exportBridge.homeNetwork,
            foreignNetwork: exportBridge.foreignNetwork,
            homeTokenSymbol: exportBridge.homeTokenSymbol,
            foreignTokenSymbol: exportBridge.foreignTokenSymbol
          });
        }
      }
    });
  });
  
  return directions.sort((a, b) => a.name.localeCompare(b.name));
};

export const getBridgeDirectionById = (directionId) => {
  const directions = getBridgeDirections();
  return directions.find(direction => direction.id === directionId);
};

export const getBridgeAddressesForDirection = (directionId) => {
  const direction = getBridgeDirectionById(directionId);
  if (!direction) return [];
  
  return [
    direction.exportBridge.address,
    direction.importBridge.address
  ];
}; 