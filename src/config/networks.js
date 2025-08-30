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
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    contracts: {
      // Official Counterstake Bridge contract addresses
      exportFactory: '0x74aF8A878317E0F6e72e302FbcDF5f3009186398', // ETHEREUM_BRIDGE_FACTORY
      importFactory: '0xf7742caF6Dae87AE6D6fbE70F8aD002a3f1952b9', // ETHEREUM_BRIDGE_FACTORY (same for import)
      assistantFactory: '0x0aD0Cce772ffcF8f9e70031cC8c1b7c20af5212F', // ETHEREUM_ASSISTANT_FACTORY
    },
    oracles: {
      default: {
        address: '0xAC4AA997A171A6CbbF5540D08537D5Cb1605E191', // ETHEREUM oracle
        name: 'Ethereum Oracle',
        description: 'Main oracle for Ethereum price feeds',
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
      USDC: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      // Dummy tokens for testing purposes
      wP3D: {
        address: '0x1234567890123456789012345678901234567890',
        symbol: 'wP3D',
        decimals: 18,
        name: 'Wrapped P3D (Test)',
        isTestToken: true,
        standard: 'ERC20',
      },
      wFIRE: {
        address: '0x2345678901234567890123456789012345678901',
        symbol: 'wFIRE',
        decimals: 18,
        name: 'Wrapped FIRE (Test)',
        isTestToken: true,
        standard: 'ERC20',
      },
      wWATER: {
        address: '0x3456789012345678901234567890123456789012',
        symbol: 'wWATER',
        decimals: 18,
        name: 'Wrapped WATER (Test)',
        isTestToken: true,
        standard: 'ERC20',
      },
      // Additional test token for WATER export bridge
      wWATER_ALT: {
        address: '0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B',
        symbol: 'wWATER',
        decimals: 18,
        name: 'Wrapped WATER (Test Alt)',
        isTestToken: true,
        standard: 'ERC20',
      },
      USDTIA: {
        address: '0xeA2F6788D252772a4DDaa376F4da5a3c54bc01f0',
        symbol: 'USDTIA',
        decimals: 18,
        name: 'USDT import assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      USDCIA: {
        address: '0x7bEB3f6940689A9A9C66C7A2C2D9A704b8c95B0E',
        symbol: 'USDCIA',
        decimals: 18,
        name: 'USDC import assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
    },
    // Bridge instances deployed on Ethereum
    bridges: {
      // Export bridges (External -> 3DPass)
      USDT_EXPORT: {
        address: '0x6359F737F32BFd1862FfAfd9C2F888DfAdC8B9RF',
        type: 'export',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDT',
        homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wUSDT',
        foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de',
        stakeTokenSymbol: 'USDT',
        stakeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        description: 'USDT Export Bridge (Ethereum → 3DPass)',
        isIssuerBurner: false
      },
      USDC_EXPORT: {
        address: '0x14982dc69e62508b3e4848129a55d6B1960b4Db0',
        type: 'export',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDC',
        homeTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wUSDC',
        foreignTokenAddress: '0xFbfbFBfA0000000000000000000000000000006f',
        stakeTokenSymbol: 'USDC',
        stakeTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        description: 'USDC Export Bridge (Ethereum → 3DPass)',
        isIssuerBurner: false
      },
      // Test Import bridges (Ethereum -> 3DPass)
      WP3D_IMPORT: {
        address: '0x9876543210987654321098765432109876543210',
        type: 'import',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wP3D',
        foreignTokenAddress: '0x1234567890123456789012345678901234567890',
        stakeTokenSymbol: 'ETH',
        stakeTokenAddress: ADDRESS_ZERO,
        oracleAddress: '0xAC4AA997A171A6CbbF5540D08537D5Cb1605E191',
        description: 'wP3D Import Bridge (Ethereum → 3DPass)',
        isIssuerBurner: true
      },
      WFIRE_IMPORT: {
        address: '0x8765432109876543210987654321098765432109',
        type: 'import',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'FIRE',
        homeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wFIRE',
        foreignTokenAddress: '0x2345678901234567890123456789012345678901',
        stakeTokenSymbol: 'ETH',
        stakeTokenAddress: ADDRESS_ZERO,
        oracleAddress: '0xAC4AA997A171A6CbbF5540D08537D5Cb1605E191',
        description: 'wFIRE Import Bridge (Ethereum → 3DPass)',
        isIssuerBurner: true
      },
      WWATER_IMPORT: {
        address: '0x7654321098765432109876543210987654321098',
        type: 'import',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'WATER',
        homeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wWATER',
        foreignTokenAddress: '0x3456789012345678901234567890123456789012',
        stakeTokenSymbol: 'ETH',
        stakeTokenAddress: ADDRESS_ZERO,
        oracleAddress: '0xAC4AA997A171A6CbbF5540D08537D5Cb1605E191',
        description: 'wWATER Import Bridge (Ethereum → 3DPass)',
        isIssuerBurner: true
      }
    },
    // Assistant contracts deployed on Ethereum
    assistants: {
      // Export Assistants
      USDT_EXPORT_ASSISTANT: {
        address: '0x0FAF9b7Cf0e62c6889486cE906d05A7a813a7cc5',
        type: 'export',
        bridgeAddress: '0x6359F737F32BFd1862FfAfd9C2F888DfAdC8B9RF',
        description: 'USDT Export Assistant',
        shareSymbol: 'USDTIA',
        shareName: 'USDT import assistant',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      },
      USDC_EXPORT_ASSISTANT: {
        address: '0xdf8D6962ADC7f29b6F9272376fE51D55B76B0fc5',
        type: 'export',
        bridgeAddress: '0x14982dc69e62508b3e4848129a55d6B1960b4Db0',
        description: 'USDC Import Wrapper Assistant',
        shareSymbol: 'USDCIA',
        shareName: 'USDC import assistant',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      }
    }
  },
  BSC: {
    id: 56,
    name: 'Binance Smart Chain',
    symbol: 'BSC',
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    explorer: 'https://bscscan.com',
    isHybrid: true,
    isEVM: true,
    erc20Precompile: false,
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    contracts: {
      // Official Counterstake Bridge contract addresses
      exportFactory: '0xa5893a1A1FF15031d8AB5aC24531D3B3418612EE', // BSC_BRIDGE_FACTORY
      importFactory: '0x0aD0Cce772ffcF8f9e70031cC8c1b7c20af5212F', // BSC_BRIDGE_FACTORY (same for import)
      assistantFactory: '0x9F60328982ab3e34020A9D43763db43d03Add7CF', // BSC_ASSISTANT_FACTORY
    },
    oracles: {
      default: {
        address: '0xdD52899A001a4260CDc43307413A5014642f37A2', // BSC oracle
        name: 'BSC Oracle',
        description: 'Main oracle for BSC price feeds',
      },
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
      BUSD: {
        address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        symbol: 'BUSD',
        decimals: 18,
        name: 'BUSD Token',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      USDT: {
        address: '0x55d398326f99059fF775485246999027B3197955',
        symbol: 'USDT',
        decimals: 18,
        name: 'Tether USD',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      BUSDIA: {
        address: '0xA32ea7688b2937eeaf3f74804fbAFB70D0fc4FE3',
        symbol: 'BUSDIA',
        decimals: 18,
        name: 'BUSD import assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
    },
    // Bridge instances deployed on BSC
    bridges: {
      // Export bridges (External -> 3DPass)
      BUSD_EXPORT: {
        address: '0xAd913348E7B63f44185D5f6BACBD18d7189B2F1B',
        type: 'export',
        homeNetwork: 'Binance Smart Chain',
        homeTokenSymbol: 'BUSD',
        homeTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wBUSD',
        foreignTokenAddress: '0xFbFBFBfA0000000000000000000000000000014D',
        stakeTokenSymbol: 'BUSD',
        stakeTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        description: 'BUSD Export Bridge (BSC → 3DPass)',
        isIssuerBurner: false
      }
    },
    // Assistant contracts deployed on BSC
    assistants: {
      BUSD_EXPORT_ASSISTANT: {
        address: '0xA32ea7688b2937eeaf3f74804fbAFB70D0fc4FE3',
        type: 'export',
        bridgeAddress: '0xAd913348E7B63f44185D5f6BACBD18d7189B2F1B',
        description: 'BUSD Export Assistant',
        shareSymbol: 'BUSDIA',
        shareName: 'BUSD import assistant',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      }
    }
  },
  THREEDPASS: {
    id: 1334,
    name: '3DPass',
    symbol: '3DPass',
    rpcUrl: 'https://rpc-test-http.3dpass.org',
    explorer: 'https://3dpscan.xyz',
    isHybrid: true,
    isEVM: true,
    erc20Precompile: true,
    nativeCurrency: {
      name: 'P3D',
      symbol: 'P3D',
      decimals: 18,
    },
    contracts: {
      // Updated contract addresses from bridge-setup-test.log and deploy-counterstake.log
      bridgesRegistry: '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0', // BridgesRegistry from deployment
      exportFactory: '0x1445f694117d847522b81A97881850DbB965db9A', // CounterstakeFactory from deployment
      importFactory: '0x1445f694117d847522b81A97881850DbB965db9A', // Same factory for both
      assistantFactory: '0x20bc80863d472aBafE45a6c6Fad87236960f6ac2', // AssistantFactory from deployment
    },
    oracles: {
      default: {
        address: '0xAc647d0caB27e912C844F27716154f54EDD519cE', // Oracle from deployment
        name: 'Default Oracle',
        description: 'Main oracle for price feeds',
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
      },
      wUSDT: {
        address: '0xfBFBfbFA000000000000000000000000000000de',
        symbol: 'wUSDT',
        decimals: 6,
        name: 'Wrapped USDT',
        isPrecompile: true,
        assetId: 222, // From the test script
        standard: 'ERC20',
      },
      wUSDC: {
        address: '0xFbfbFBfA0000000000000000000000000000006f',
        symbol: 'wUSDC',
        decimals: 6,
        name: 'Wrapped USDC',
        isPrecompile: true,
        assetId: 223, // From the test script
        standard: 'ERC20',
      },
      wBUSD: {
        address: '0xFbFBFBfA0000000000000000000000000000014D',
        symbol: 'wBUSD',
        decimals: 18,
        name: 'Wrapped BUSD',
        isPrecompile: true,
        assetId: 224, // From the test script
        standard: 'ERC20',
      },
      FIRE: {
        address: '0xFbfBFBfA000000000000000000000000000001bC',
        symbol: 'FIRE',
        decimals: 18,
        name: 'FIRE Token',
        isPrecompile: true,
        assetId: 444, // From the test script
        standard: 'ERC20',
      },
      WATER: {
        address: '0xfBFBFBfa0000000000000000000000000000022b',
        symbol: 'WATER',
        decimals: 18,
        name: 'WATER Token',
        isPrecompile: true,
        assetId: 555, // From the test script
        standard: 'ERC20',
      },
      USDTIA: {
        address: '0xeA2F6788D252772a4DDaa376F4da5a3c54bc01f0',
        symbol: 'USDTIA',
        decimals: 18,
        name: 'USDT import assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      USDCIA: {
        address: '0x7bEB3f6940689A9A9C66C7A2C2D9A704b8c95B0E',
        symbol: 'USDCIA',
        decimals: 18,
        name: 'USDC import assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      BUSDIA: {
        address: '0x49B602cE8794003e8CC62bf61CA5dA7f9F543233',
        symbol: 'BUSDIA',
        decimals: 18,
        name: 'BUSD import assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      P3DEA: {
        address: '0x373EB437066D13761926B4F20a4A93aBdECbCDbf',
        symbol: 'P3DEA',
        decimals: 18,
        name: 'P3D export assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      FIREA: {
        address: '0x4d6BE61c3040245A88B6e4Fb92DCFb5ae9077127',
        symbol: 'FIREA',
        decimals: 18,
        name: 'FIRE export assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
      WATEA: {
        address: '0x826bB653e078D65FaFea3978d3481eea0727B0F5',
        symbol: 'WATEA',
        decimals: 18,
        name: 'WATER export assistant share',
        isPrecompile: false,
        isNative: false,
        standard: 'ERC20',
      },
    },
    // Bridge instances deployed on 3DPass
    bridges: {
      // Export bridges (3DPass -> External)
      P3D_EXPORT: {
        address: '0x696CD5949EA4baBB3eB76D5231595C7e8eFa9206',
        type: 'export',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wP3D',
        foreignTokenAddress: '0x1234567890123456789012345678901234567890',
        stakeTokenSymbol: 'P3D',
        stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        description: 'P3D Export Bridge (3DPass → Ethereum)',
        isIssuerBurner: false
      },
      FIRE_EXPORT: {
        address: '0x418Fbe90f5fD7095Fd4cde851c8375Df085ed61A',
        type: 'export',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'FIRE',
        homeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wFIRE',
        foreignTokenAddress: '0x2345678901234567890123456789012345678901',
        stakeTokenSymbol: 'FIRE',
        stakeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        description: 'FIRE Export Bridge (3DPass → Ethereum)',
        isIssuerBurner: false
      },
      WATER_EXPORT: {
        address: '0xF79be90A608c26CA1f995a40BE57DB28de8e5DB4',
        type: 'export',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'WATER',
        homeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wWATER',
        foreignTokenAddress: '0x3456789012345678901234567890123456789012',
        stakeTokenSymbol: 'WATER',
        stakeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        description: 'WATER Export Bridge (3DPass → Ethereum)',
        isIssuerBurner: false
    },
    // Import Wrapper bridges (External -> 3DPass)
    USDT_IMPORT: {
      address: '0x8Ec164093319EAD78f6E289bb688Bef3c8ce9B0F',
      type: 'import_wrapper',
      homeNetwork: 'Ethereum',
      homeTokenSymbol: 'USDT',
      homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      foreignNetwork: '3DPass',
      foreignTokenSymbol: 'wUSDT',
      foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de',
      stakeTokenSymbol: 'P3D',
      stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
      oracleAddress: '0xAc647d0caB27e912C844F27716154f54EDD519cE',
      description: 'USDT Import Wrapper Bridge (Ethereum → 3DPass)',
      isIssuerBurner: true
    },
    USDC_IMPORT: {
      address: '0x1A85BD09E186b6EDc30D08Abb43c673A9636Cc4E',
      type: 'import_wrapper',
      homeNetwork: 'Ethereum',
      homeTokenSymbol: 'USDC',
      homeTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      foreignNetwork: '3DPass',
      foreignTokenSymbol: 'wUSDC',
      foreignTokenAddress: '0xFbfbFBfA0000000000000000000000000000006f',
      stakeTokenSymbol: 'P3D',
      stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
      oracleAddress: '0xAc647d0caB27e912C844F27716154f54EDD519cE',
      description: 'USDC Import Wrapper Bridge (Ethereum → 3DPass)',
      isIssuerBurner: true
    },
    BUSD_IMPORT: {
      address: '0xccDdB081d48D7F312846ea4ECF18A963455c3C71',
      type: 'import_wrapper',
      homeNetwork: 'Binance Smart Chain',
      homeTokenSymbol: 'BUSD',
      homeTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      foreignNetwork: '3DPass',
      foreignTokenSymbol: 'wBUSD',
      foreignTokenAddress: '0xFbFBFBfA0000000000000000000000000000014D',
      stakeTokenSymbol: 'P3D',
      stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
      oracleAddress: '0xAc647d0caB27e912C844F27716154f54EDD519cE',
      description: 'BUSD Import Wrapper Bridge (Binance Smart Chain → 3DPass)',
      isIssuerBurner: true
      }
    },
    // Assistant contracts deployed on 3DPass
    assistants: {
      // Import Wrapper Assistants
      USDT_IMPORT_ASSISTANT: {
        address: '0xeA2F6788D252772a4DDaa376F4da5a3c54bc01f0',
        type: 'import_wrapper',
        bridgeAddress: '0x8Ec164093319EAD78f6E289bb688Bef3c8ce9B0F',
        description: 'USDT Import Wrapper Assistant',
        shareSymbol: 'USDTIA',
        shareName: 'USDT import assistant share',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      },
      USDC_IMPORT_ASSISTANT: {
        address: '0x7bEB3f6940689A9A9C66C7A2C2D9A704b8c95B0E',
        type: 'import_wrapper',
        bridgeAddress: '0x1A85BD09E186b6EDc30D08Abb43c673A9636Cc4E',
        description: 'USDC Import Wrapper Assistant',
        shareSymbol: 'USDCIA',
        shareName: 'USDC import assistant share',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      },
      BUSD_IMPORT_ASSISTANT: {
        address: '0x49B602cE8794003e8CC62bf61CA5dA7f9F543233',
        type: 'import_wrapper',
        bridgeAddress: '0xccDdB081d48D7F312846ea4ECF18A963455c3C71',
        description: 'BUSD Import Wrapper Assistant',
        shareSymbol: 'BUSDIA',
        shareName: 'BUSD import assistant share',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      },
      // Export Assistants
      P3D_EXPORT_ASSISTANT: {
        address: '0x373EB437066D13761926B4F20a4A93aBdECbCDbf',
        type: 'export_wrapper',
        bridgeAddress: '0x696CD5949EA4baBB3eB76D5231595C7e8eFa9206',
        description: 'P3D Export Assistant',
        shareSymbol: 'P3DEA',
        shareName: 'P3D export assistant share',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      },
      FIRE_EXPORT_ASSISTANT: {
        address: '0x4d6BE61c3040245A88B6e4Fb92DCFb5ae9077127',
        type: 'export_wrapper',
        bridgeAddress: '0x418Fbe90f5fD7095Fd4cde851c8375Df085ed61A',
        description: 'FIRE Export Assistant',
        shareSymbol: 'FIREA',
        shareName: 'FIRE export assistant',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
      },
      WATER_EXPORT_ASSISTANT: {
        address: '0x826bB653e078D65FaFea3978d3481eea0727B0F5',
        type: 'export_wrapper',
        bridgeAddress: '0xF79be90A608c26CA1f995a40BE57DB28de8e5DB4',
        description: 'WATER Export Assistant',
        shareSymbol: 'WATEA',
        shareName: 'WATER export assistant share',
        managerAddress: '0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b'
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
  },
  BSC: {
    ...NETWORKS.BSC,
    id: 97, // BSC Testnet
    name: 'BSC Testnet',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    explorer: 'https://testnet.bscscan.com',
  },
  THREEDPASS: {
    ...NETWORKS.THREEDPASS,
    id: 1334, // 3DPass Testnet
    name: '3DPass Testnet',
    rpcUrl: 'https://test-rpc-http.3dpass.org',
    explorer: 'https://test-explorer.3dpass.org',
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