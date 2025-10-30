import { switchNetwork } from '../network-switcher';

describe('network-switcher', () => {
  let mockEthereum;
  let originalWindow;

  beforeEach(() => {
    originalWindow = global.window;
    mockEthereum = {
      request: jest.fn(),
    };
    delete global.window;
    global.window = { ethereum: mockEthereum };
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.window = originalWindow;
  });

  describe('switchNetwork', () => {
    const mockNetworkConfig = {
      id: 1,
      name: 'Ethereum',
      chainId: 1,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrl: 'https://eth.llamarpc.com',
      explorer: 'https://etherscan.io',
    };

    describe('successful network switch', () => {
      it('should switch to network successfully', async () => {
        mockEthereum.request.mockResolvedValueOnce(null);

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(true);
        expect(mockEthereum.request).toHaveBeenCalledWith({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x1' }],
        });
        expect(mockEthereum.request).toHaveBeenCalledTimes(1);
      });

      it('should convert decimal chain ID to hex correctly', async () => {
        const bscNetwork = {
          ...mockNetworkConfig,
          id: 56,
          chainId: 56,
          name: 'BSC',
        };
        mockEthereum.request.mockResolvedValueOnce(null);

        await switchNetwork(bscNetwork);

        expect(mockEthereum.request).toHaveBeenCalledWith({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x38' }],
        });
      });

      it('should handle large chain IDs', async () => {
        const customNetwork = {
          ...mockNetworkConfig,
          id: 100000,
          chainId: 100000,
        };
        mockEthereum.request.mockResolvedValueOnce(null);

        await switchNetwork(customNetwork);

        expect(mockEthereum.request).toHaveBeenCalledWith({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x186a0' }],
        });
      });
    });

    describe('network not added (error code 4902)', () => {
      it('should add network when not found in MetaMask', async () => {
        const notAddedError = new Error('Network not added');
        notAddedError.code = 4902;

        mockEthereum.request
          .mockRejectedValueOnce(notAddedError)
          .mockResolvedValueOnce(null);

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(true);
        expect(mockEthereum.request).toHaveBeenCalledTimes(2);
        expect(mockEthereum.request).toHaveBeenNthCalledWith(1, {
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x1' }],
        });
        expect(mockEthereum.request).toHaveBeenNthCalledWith(2, {
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x1',
            chainName: 'Ethereum',
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://eth.llamarpc.com'],
            blockExplorerUrls: ['https://etherscan.io'],
          }],
        });
      });

      it('should return false when adding network fails', async () => {
        const notAddedError = new Error('Network not added');
        notAddedError.code = 4902;
        const addError = new Error('User rejected');

        mockEthereum.request
          .mockRejectedValueOnce(notAddedError)
          .mockRejectedValueOnce(addError);

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(false);
        expect(mockEthereum.request).toHaveBeenCalledTimes(2);
      });
    });

    describe('user rejection (error code 4001)', () => {
      it('should return false when user rejects network switch', async () => {
        const userRejectedError = new Error('User rejected');
        userRejectedError.code = 4001;

        mockEthereum.request.mockRejectedValueOnce(userRejectedError);

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(false);
        expect(mockEthereum.request).toHaveBeenCalledTimes(1);
      });
    });

    describe('other errors', () => {
      it('should return false for unknown errors', async () => {
        const unknownError = new Error('Unknown error');
        unknownError.code = 9999;

        mockEthereum.request.mockRejectedValueOnce(unknownError);

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(false);
        expect(mockEthereum.request).toHaveBeenCalledTimes(1);
      });

      it('should return false when request throws without error code', async () => {
        mockEthereum.request.mockRejectedValueOnce(new Error('Generic error'));

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(false);
      });
    });

    describe('MetaMask not available', () => {
      it('should return false when window.ethereum is not available', async () => {
        global.window = {};

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(false);
      });

      it('should return false when window is not defined', async () => {
        global.window = undefined;

        const result = await switchNetwork(mockNetworkConfig);

        expect(result).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle null network config', async () => {
        const result = await switchNetwork(null);

        expect(result).toBe(false);
        expect(mockEthereum.request).not.toHaveBeenCalled();
      });

      it('should handle undefined network config', async () => {
        const result = await switchNetwork(undefined);

        expect(result).toBe(false);
        expect(mockEthereum.request).not.toHaveBeenCalled();
      });

      it('should handle network config without chainId', async () => {
        const invalidNetwork = {
          name: 'Invalid Network',
        };

        const result = await switchNetwork(invalidNetwork);

        expect(result).toBe(false);
      });

      it('should handle network config with chainId 0', async () => {
        const zeroChainNetwork = {
          ...mockNetworkConfig,
          id: 0,
          chainId: 0,
        };
        mockEthereum.request.mockResolvedValueOnce(null);

        const result = await switchNetwork(zeroChainNetwork);

        expect(result).toBe(true);
        expect(mockEthereum.request).toHaveBeenCalledWith({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x0' }],
        });
      });
    });

    describe('return value consistency', () => {
      it('should always return a boolean', async () => {
        mockEthereum.request.mockResolvedValueOnce(null);

        const result = await switchNetwork(mockNetworkConfig);

        expect(typeof result).toBe('boolean');
      });

      it('should return boolean even on errors', async () => {
        mockEthereum.request.mockRejectedValueOnce(new Error('Test error'));

        const result = await switchNetwork(mockNetworkConfig);

        expect(typeof result).toBe('boolean');
        expect(result).toBe(false);
      });
    });
  });
});
