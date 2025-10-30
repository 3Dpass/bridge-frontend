import { useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useWeb3 } from '../contexts/Web3Context';
import toast from 'react-hot-toast';

export const useNetworkSwitcher = () => {
  const { getAllNetworksWithSettings } = useSettings();
  const { switchNetwork } = useWeb3();

  const getRequiredNetworkForBridge = useCallback((bridgeAddress) => {
    const networks = getAllNetworksWithSettings();

    for (const networkKey in networks) {
      const networkConfig = networks[networkKey];

      if (networkConfig && networkConfig.bridges) {
        for (const bridgeKey in networkConfig.bridges) {
          const bridge = networkConfig.bridges[bridgeKey];

          if (bridge.address === bridgeAddress) {
            return {
              ...networkConfig,
              chainId: networkConfig.id,
              bridgeAddress: bridge.address,
            };
          }
        }
      }
    }

    return null;
  }, [getAllNetworksWithSettings]);

  const getRequiredNetworkForAssistant = useCallback((assistant) => {
    const networks = getAllNetworksWithSettings();

    for (const networkKey in networks) {
      const networkConfig = networks[networkKey];

      if (networkConfig && networkConfig.bridges) {
        for (const bridgeKey in networkConfig.bridges) {
          const bridge = networkConfig.bridges[bridgeKey];

          if (bridge.address === assistant.bridgeAddress) {
            return {
              ...networkConfig,
              chainId: networkConfig.id,
              bridgeAddress: bridge.address,
              assistantType: assistant.type,
            };
          }
        }
      }
    }

    return null;
  }, [getAllNetworksWithSettings]);

  const getRequiredNetworkForTransfer = useCallback((transfer) => {
    const networks = getAllNetworksWithSettings();

    if (transfer.eventType === 'NewRepatriation' || transfer.eventType === 'NewExpatriation') {
      const network = Object.values(networks).find(network =>
        network.name === transfer.toNetwork
      );
      return network || null;
    }

    return null;
  }, [getAllNetworksWithSettings]);

  const getRequiredNetworkForClaim = useCallback((claim) => {
    const networks = getAllNetworksWithSettings();

    for (const networkKey in networks) {
      const networkConfig = networks[networkKey];

      if (networkConfig && networkConfig.bridges) {
        for (const bridgeKey in networkConfig.bridges) {
          const bridge = networkConfig.bridges[bridgeKey];

          if (bridge.address === claim.bridgeAddress) {
            return {
              ...networkConfig,
              chainId: networkConfig.id,
              bridgeAddress: bridge.address,
            };
          }
        }
      }
    }

    return null;
  }, [getAllNetworksWithSettings]);

  const checkNetwork = useCallback(async () => {
    try {
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainIdNumber = parseInt(currentChainId, 16);
      return currentChainIdNumber;
    } catch (error) {
      console.error('Error checking network:', error);
      return null;
    }
  }, []);

  const checkAndSwitchNetwork = useCallback(async (requiredNetwork, options = {}) => {
    const {
      errorMessage = 'Failed to switch to the required network',
      waitTime = 1000
    } = options;

    if (!requiredNetwork) {
      toast.error('Could not determine required network');
      return false;
    }

    try {
      const currentChainId = await checkNetwork();

      if (currentChainId === null) {
        toast.error(errorMessage);
        return false;
      }

      if (currentChainId !== requiredNetwork.chainId && currentChainId !== requiredNetwork.id) {
        toast(`Switching to ${requiredNetwork.name} network...`);
        const switchSuccess = await switchNetwork(requiredNetwork.id || requiredNetwork.chainId);

        if (!switchSuccess) {
          toast.error(errorMessage);
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      return true;
    } catch (error) {
      console.error('Error in checkAndSwitchNetwork:', error);
      toast.error(errorMessage);
      return false;
    }
  }, [checkNetwork, switchNetwork]);

  return {
    getRequiredNetworkForBridge,
    getRequiredNetworkForAssistant,
    getRequiredNetworkForTransfer,
    getRequiredNetworkForClaim,
    checkAndSwitchNetwork,
  };
};
