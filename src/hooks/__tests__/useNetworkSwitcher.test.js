import { renderHook, act } from '@testing-library/react';
import { useNetworkSwitcher } from '../useNetworkSwitcher';
import { useSettings } from '../../contexts/SettingsContext';
import { useWeb3 } from '../../contexts/Web3Context';
import toast from 'react-hot-toast';

jest.mock('../../contexts/SettingsContext');
jest.mock('../../contexts/Web3Context');
jest.mock('react-hot-toast');

describe('useNetworkSwitcher', () => {
  const mockGetAllNetworksWithSettings = jest.fn();
  const mockSwitchNetwork = jest.fn();
  const mockEthereumRequest = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    useSettings.mockReturnValue({
      getAllNetworksWithSettings: mockGetAllNetworksWithSettings,
    });

    useWeb3.mockReturnValue({
      switchNetwork: mockSwitchNetwork,
    });

    global.window.ethereum = {
      request: mockEthereumRequest,
    };

    mockGetAllNetworksWithSettings.mockReturnValue({
      ETHEREUM: {
        name: 'Ethereum',
        id: 1,
        symbol: 'ETH',
        bridges: {
          bridge1: { address: '0xBridge1' },
          bridge2: { address: '0xBridge2' },
        },
      },
      THREEDPASS: {
        name: '3DPass',
        id: 132,
        symbol: 'P3D',
        bridges: {
          bridge3: { address: '0xBridge3' },
        },
      },
    });
  });

  afterEach(() => {
    delete global.window.ethereum;
  });

  describe('getRequiredNetworkForBridge', () => {
    it('should return null if bridge address not found', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const network = result.current.getRequiredNetworkForBridge('0xNonExistent');

      expect(network).toBeNull();
    });

    it('should find network by bridge address', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const network = result.current.getRequiredNetworkForBridge('0xBridge1');

      expect(network).toEqual({
        name: 'Ethereum',
        id: 1,
        symbol: 'ETH',
        chainId: 1,
        bridgeAddress: '0xBridge1',
        bridges: {
          bridge1: { address: '0xBridge1' },
          bridge2: { address: '0xBridge2' },
        },
      });
    });

    it('should find network by bridge address across multiple networks', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const network = result.current.getRequiredNetworkForBridge('0xBridge3');

      expect(network).toEqual({
        name: '3DPass',
        id: 132,
        symbol: 'P3D',
        chainId: 132,
        bridgeAddress: '0xBridge3',
        bridges: {
          bridge3: { address: '0xBridge3' },
        },
      });
    });
  });

  describe('getRequiredNetworkForAssistant', () => {
    it('should return null if assistant bridge address not found', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const assistant = { bridgeAddress: '0xNonExistent' };
      const network = result.current.getRequiredNetworkForAssistant(assistant);

      expect(network).toBeNull();
    });

    it('should find network by assistant bridge address', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const assistant = { address: '0xAssistant1', bridgeAddress: '0xBridge1', type: 'export' };
      const network = result.current.getRequiredNetworkForAssistant(assistant);

      expect(network).toEqual({
        name: 'Ethereum',
        id: 1,
        symbol: 'ETH',
        chainId: 1,
        bridgeAddress: '0xBridge1',
        assistantType: 'export',
        bridges: {
          bridge1: { address: '0xBridge1' },
          bridge2: { address: '0xBridge2' },
        },
      });
    });
  });

  describe('getRequiredNetworkForTransfer', () => {
    it('should return network by toNetwork name for NewRepatriation', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const transfer = {
        eventType: 'NewRepatriation',
        fromNetwork: '3DPass',
        toNetwork: 'Ethereum',
      };

      const network = result.current.getRequiredNetworkForTransfer(transfer);

      expect(network.name).toBe('Ethereum');
      expect(network.id).toBe(1);
    });

    it('should return network by toNetwork name for NewExpatriation', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const transfer = {
        eventType: 'NewExpatriation',
        fromNetwork: 'Ethereum',
        toNetwork: '3DPass',
      };

      const network = result.current.getRequiredNetworkForTransfer(transfer);

      expect(network.name).toBe('3DPass');
      expect(network.id).toBe(132);
    });

    it('should return null for unknown event type', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const transfer = {
        eventType: 'UnknownEvent',
        fromNetwork: 'Ethereum',
        toNetwork: '3DPass',
      };

      const network = result.current.getRequiredNetworkForTransfer(transfer);

      expect(network).toBeNull();
    });
  });

  describe('getRequiredNetworkForClaim', () => {
    it('should find network by claim bridge address', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const claim = {
        bridgeAddress: '0xBridge2',
        networkName: 'Ethereum',
      };

      const network = result.current.getRequiredNetworkForClaim(claim);

      expect(network).toEqual({
        name: 'Ethereum',
        id: 1,
        symbol: 'ETH',
        chainId: 1,
        bridgeAddress: '0xBridge2',
        bridges: {
          bridge1: { address: '0xBridge1' },
          bridge2: { address: '0xBridge2' },
        },
      });
    });

    it('should return null if claim bridge address not found', () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      const claim = {
        bridgeAddress: '0xNonExistent',
        networkName: 'Unknown',
      };

      const network = result.current.getRequiredNetworkForClaim(claim);

      expect(network).toBeNull();
    });
  });

  describe('checkAndSwitchNetwork', () => {
    it('should return true if already on correct network', async () => {
      mockEthereumRequest.mockResolvedValue('0x1'); // Chain ID 1 in hex

      const { result } = renderHook(() => useNetworkSwitcher());

      const requiredNetwork = { name: 'Ethereum', id: 1, chainId: 1 };

      let switchResult;
      await act(async () => {
        switchResult = await result.current.checkAndSwitchNetwork(requiredNetwork);
      });

      expect(switchResult).toBe(true);
      expect(mockSwitchNetwork).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    });

    it('should switch network if on wrong network', async () => {
      mockEthereumRequest.mockResolvedValue('0x84'); // Chain ID 132 in hex
      mockSwitchNetwork.mockResolvedValue(true);

      const { result } = renderHook(() => useNetworkSwitcher());

      const requiredNetwork = { name: 'Ethereum', id: 1, chainId: 1 };

      let switchResult;
      await act(async () => {
        switchResult = await result.current.checkAndSwitchNetwork(requiredNetwork);
      });

      expect(mockEthereumRequest).toHaveBeenCalledWith({ method: 'eth_chainId' });
      expect(toast).toHaveBeenCalledWith('Switching to Ethereum network...');
      expect(mockSwitchNetwork).toHaveBeenCalledWith(1);
      expect(switchResult).toBe(true);
    });

    it('should return false if network switch fails', async () => {
      mockEthereumRequest.mockResolvedValue('0x84'); // Chain ID 132 in hex
      mockSwitchNetwork.mockResolvedValue(false);

      const { result } = renderHook(() => useNetworkSwitcher());

      const requiredNetwork = { name: 'Ethereum', id: 1, chainId: 1 };

      let switchResult;
      await act(async () => {
        switchResult = await result.current.checkAndSwitchNetwork(requiredNetwork);
      });

      expect(mockSwitchNetwork).toHaveBeenCalledWith(1);
      expect(toast.error).toHaveBeenCalledWith('Failed to switch to the required network');
      expect(switchResult).toBe(false);
    });

    it('should show custom error message when provided', async () => {
      mockEthereumRequest.mockResolvedValue('0x84'); // Chain ID 132 in hex
      mockSwitchNetwork.mockResolvedValue(false);

      const { result } = renderHook(() => useNetworkSwitcher());

      const requiredNetwork = { name: 'Ethereum', id: 1, chainId: 1 };
      const options = { errorMessage: 'Custom error message' };

      await act(async () => {
        await result.current.checkAndSwitchNetwork(requiredNetwork, options);
      });

      expect(toast.error).toHaveBeenCalledWith('Custom error message');
    });

    it('should wait for network to settle after successful switch', async () => {
      mockEthereumRequest.mockResolvedValue('0x84'); // Chain ID 132 in hex
      mockSwitchNetwork.mockResolvedValue(true);

      const { result } = renderHook(() => useNetworkSwitcher());

      const requiredNetwork = { name: 'Ethereum', id: 1, chainId: 1 };
      const options = { waitTime: 100 };

      let switchResult;
      await act(async () => {
        switchResult = await result.current.checkAndSwitchNetwork(requiredNetwork, options);
      });

      expect(switchResult).toBe(true);
    });

    it('should return false and show error toast if network detection fails', async () => {
      mockEthereumRequest.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useNetworkSwitcher());

      const requiredNetwork = { name: 'Ethereum', id: 1, chainId: 1 };

      let switchResult;
      await act(async () => {
        switchResult = await result.current.checkAndSwitchNetwork(requiredNetwork);
      });

      expect(switchResult).toBe(false);
      expect(toast.error).toHaveBeenCalled();
    });

    it('should return false if required network is null', async () => {
      const { result } = renderHook(() => useNetworkSwitcher());

      let switchResult;
      await act(async () => {
        switchResult = await result.current.checkAndSwitchNetwork(null);
      });

      expect(switchResult).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Could not determine required network');
    });
  });
});
