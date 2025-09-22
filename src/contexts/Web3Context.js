import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  connectWallet,
} from '../utils/web3';
import { getNetworkById, NETWORKS } from '../config/networks';

const Web3Context = createContext();

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [network, setNetwork] = useState(null);
  const [detectedNetwork, setDetectedNetwork] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState({});

  // Load settings from localStorage
  const loadSettings = useCallback(() => {
    try {
      const savedSettings = localStorage.getItem('bridgeSettings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        setSettings(parsedSettings);
        return parsedSettings;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    return {};
  }, []);

  // Get network configuration with custom settings applied
  const getNetworkWithSettings = useCallback((networkKey) => {
    const defaultNetwork = NETWORKS[networkKey];
    
    if (!defaultNetwork) {
      return null;
    }

    if (!settings[networkKey]) {
      return defaultNetwork;
    }

    const networkSettings = settings[networkKey];
    const customNetwork = { ...defaultNetwork };

    // Apply custom RPC URL if enabled
    if (networkSettings.customRpc && networkSettings.rpcUrl) {
      customNetwork.rpcUrl = networkSettings.rpcUrl;
    }

    // Apply custom contract addresses if enabled
    if (networkSettings.customContracts && networkSettings.contracts) {
      customNetwork.contracts = {
        ...customNetwork.contracts,
        ...networkSettings.contracts,
      };
    }

    // Apply custom tokens if enabled
    if (networkSettings.customTokens && networkSettings.tokens) {
      customNetwork.tokens = {
        ...customNetwork.tokens,
        ...networkSettings.tokens,
      };
    }

    return customNetwork;
  }, [settings]);

  // Centralized network detection with settings integration
  const getCurrentNetworkFromProvider = useCallback(async (currentProvider) => {
    if (!currentProvider) return null;
    
    try {
      const providerNetwork = await currentProvider.getNetwork();
      console.log('🔍 Provider network detected:', providerNetwork);
      
      // Find network key by chain ID
      const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].id === providerNetwork.chainId);
      
      if (networkKey) {
        // Get network with custom settings applied
        const networkWithSettings = getNetworkWithSettings(networkKey);
        if (networkWithSettings) {
          return networkWithSettings;
        }
        
        // Fallback to default network config
        return NETWORKS[networkKey];
      }
      
      // If not found in config, return provider network with basic info
      return {
        id: providerNetwork.chainId,
        name: providerNetwork.name || 'Unknown',
        symbol: `Chain ${providerNetwork.chainId}`,
        chainId: providerNetwork.chainId
      };
    } catch (error) {
      console.error('Error getting network from provider:', error);
      return null;
    }
  }, [getNetworkWithSettings]);

  // Get current network (prioritizes context network, falls back to provider detection)
  const getCurrentNetwork = useCallback(() => {
    return network || detectedNetwork;
  }, [network, detectedNetwork]);

  // Initialize Web3 connection
  const connect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      // Check if MetaMask is available
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed. Please install MetaMask to use this app.');
      }
      
      if (!window.ethereum.isMetaMask) {
        throw new Error('Please use MetaMask to connect to this app.');
      }
      
      // Load settings first
      loadSettings();
      
      const { account: connectedAccount, provider: connectedProvider } = await connectWallet();
      const connectedSigner = connectedProvider.getSigner();
      
      // Get network from context first, then provider
      let currentNetwork = await getCurrentNetwork();
      if (!currentNetwork) {
        currentNetwork = await getCurrentNetworkFromProvider(connectedProvider);
      }
      
      setAccount(connectedAccount);
      setProvider(connectedProvider);
      setSigner(connectedSigner);
      setNetwork(currentNetwork);
      setDetectedNetwork(currentNetwork);
      setIsConnected(true);
      
      // Don't store connection state - connection should be manual only
      // localStorage.setItem('web3Connected', 'true');
      
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message);
      setIsConnected(false);
      // Don't clear connection state - connection should be manual only
      // localStorage.removeItem('web3Connected');
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet - define this first to avoid circular dependency
  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setNetwork(null);
    setDetectedNetwork(null);
    setIsConnected(false);
    setError(null);
    
    // Don't clear connection state - connection should be manual only
    // localStorage.removeItem('web3Connected');
  }, []);

  // Handle account changes - define this before the useEffect that uses it
  const handleAccountsChanged = useCallback(async (accounts) => {
    // Only handle account changes if we're actually connected
    if (!isConnected) return;
    
    if (accounts.length === 0) {
      // MetaMask is locked or the user has not connected any accounts
      disconnect();
    } else if (accounts[0] !== account) {
      // Update the account
      setAccount(accounts[0]);
    }
  }, [account, disconnect, isConnected]);

  // Monitor network changes only when connected
  useEffect(() => {
    if (!provider || !isConnected || !window.ethereum || !window.ethereum.isMetaMask) return;

    const handleChainChangedFromProvider = async (chainId) => {
      console.log('🔍 Chain changed:', chainId);
      try {
        // Recreate provider and signer when network changes to avoid NETWORK_ERROR
        const newProvider = new ethers.providers.Web3Provider(window.ethereum);
        const newSigner = newProvider.getSigner();
        
        // Update provider and signer first
        setProvider(newProvider);
        setSigner(newSigner);
        
        // Now get the network from the new provider
        const newNetwork = await getCurrentNetworkFromProvider(newProvider);
        console.log('🔄 Setting new network:', newNetwork);
        setNetwork(newNetwork);
        setDetectedNetwork(newNetwork);
        
        // Don't reload the page - let components handle the network change
        console.log('✅ Network updated without page reload');
      } catch (error) {
        console.error('Error handling chain change:', error);
      }
    };

    window.ethereum.on('chainChanged', handleChainChangedFromProvider);
    window.ethereum.on('accountsChanged', handleAccountsChanged);

    return () => {
      window.ethereum.removeListener('chainChanged', handleChainChangedFromProvider);
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [provider, isConnected, getCurrentNetworkFromProvider, handleAccountsChanged]);

  // Handle network changes - consolidated in the network monitoring useEffect above
  // const handleChainChanged = useCallback(async (chainId) => {
  //   // Only handle chain changes if we're actually connected
  //   if (!isConnected) return;
  //   
  //   const networkId = parseInt(chainId, 16);
  //   const newNetwork = getNetworkById(networkId);
  //   setNetwork(newNetwork);
  //   
  //   // Reload the page to ensure everything is in sync
  //   window.location.reload();
  // }, [isConnected]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Switch network
  const switchNetwork = async (networkId) => {
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      setError('MetaMask is not installed or not available');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${networkId.toString(16)}` }],
      });
      
      // Update network state
      const newNetwork = getNetworkById(networkId);
      setNetwork(newNetwork);
      
    } catch (switchError) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        const targetNetwork = getNetworkById(networkId);
        if (!targetNetwork) {
          setError('Unsupported network');
          return;
        }

        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${networkId.toString(16)}`,
              chainName: targetNetwork.name,
              nativeCurrency: targetNetwork.nativeCurrency,
              rpcUrls: [targetNetwork.rpcUrl],
              blockExplorerUrls: [targetNetwork.explorer],
            }],
          });
          
          // Update network state
          setNetwork(targetNetwork);
          
        } catch (addError) {
          setError('Failed to add network to MetaMask');
        }
      } else {
        setError('Failed to switch network');
      }
    }
  };

  // Remove automatic connection check on mount - connection should be manual only
  // useEffect(() => {
  //   const checkConnection = async () => {
  //     if (window.ethereum && window.ethereum.isMetaMask) {
  //       try {
  //         const currentAccount = await getCurrentAccount();
  //         const currentNetwork = await getCurrentNetwork();
  //           
  //         if (currentAccount && currentNetwork) {
  //           const connectedProvider = new ethers.providers.Web3Provider(window.ethereum);
  //           const connectedSigner = connectedProvider.getSigner();
  //             
  //           setAccount(currentAccount);
  //           setProvider(connectedProvider);
  //           setSigner(connectedSigner);
  //           setNetwork(currentNetwork);
  //           setIsConnected(true);
  //         }
  //       } catch (error) {
  //         console.error('Error checking connection on mount:', error);
  //         // Don't set error state here as this is just a check
  //       }
  //     }
  //   };
  //
  //   checkConnection();
  // }, [getCurrentNetworkFromProvider]);

  // Remove duplicate event listener setup - consolidated in the network monitoring useEffect above
  // useEffect(() => {
  //   if (window.ethereum && window.ethereum.isMetaMask && isConnected) {
  //     onAccountsChanged(handleAccountsChanged);
  //     onChainChanged(handleChainChanged);
  //   }
  //
  //   return () => {
  //     removeListeners();
  //   };
  // }, [handleAccountsChanged, isConnected]);

  // Remove auto-connect functionality - connection should be manual only
  // useEffect(() => {
  //   const wasConnected = localStorage.getItem('web3Connected');
  //   if (wasConnected && !isConnected && !isConnecting && window.ethereum && window.ethereum.isMetaMask) {
  //     connect();
  //   }
  // }, [isConnected, isConnecting]);

  const value = {
    // State
    account,
    provider,
    signer,
    network: network || detectedNetwork, // Use state directly for reactivity
    isConnecting,
    isConnected,
    error,
    settings,
    
    // Actions
    connect,
    disconnect,
    switchNetwork,
    
    // Utilities
    formatAddress: (address) => {
      if (!address) return '';
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    },
    
    isSupportedNetwork: (networkId) => {
      return getNetworkById(networkId) !== undefined;
    },
    
    // Network detection with settings integration
    getCurrentNetwork,
    getCurrentNetworkFromProvider,
    getNetworkWithSettings,
    loadSettings,
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}; 