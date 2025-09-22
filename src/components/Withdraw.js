import React, { useState, useCallback, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { 
  EXPORT_ASSISTANT_ABI, 
  EXPORT_WRAPPER_ASSISTANT_ABI, 
  IMPORT_ASSISTANT_ABI, 
  IMPORT_WRAPPER_ASSISTANT_ABI 
} from '../contracts/abi';
import { NETWORKS } from '../config/networks';

const Withdraw = ({ assistant, onClose, onSuccess }) => {
  const { account, provider, signer, network } = useWeb3();
  const { getAllNetworksWithSettings } = useSettings();
  
  // Debug Web3Context state
  console.log('🔍 Withdraw component Web3Context state:', {
    account,
    hasAccount: !!account,
    hasProvider: !!provider,
    hasSigner: !!signer
  });
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [userShareBalance, setUserShareBalance] = useState('0');
  const [step, setStep] = useState('connect'); // 'connect', 'network', 'withdraw', 'success'

  // Get the appropriate ABI based on assistant type
  const getAssistantABI = useCallback(() => {
    switch (assistant.type) {
      case 'export':
        return EXPORT_ASSISTANT_ABI;
      case 'export_wrapper':
        return EXPORT_WRAPPER_ASSISTANT_ABI;
      case 'import':
        return IMPORT_ASSISTANT_ABI;
      case 'import_wrapper':
        return IMPORT_WRAPPER_ASSISTANT_ABI;
      default:
        return EXPORT_ASSISTANT_ABI;
    }
  }, [assistant.type]);

  // Get required network for the assistant
  const getRequiredNetwork = useCallback(() => {
    const networksWithSettings = getAllNetworksWithSettings();
    
    console.log('🔍 getRequiredNetwork called for assistant:', assistant.address);
    console.log('🔍 Available networks:', Object.keys(networksWithSettings));
    
    for (const networkKey in networksWithSettings) {
      const networkConfig = networksWithSettings[networkKey];
      console.log('🔍 Checking network:', networkKey, {
        hasAssistants: !!networkConfig.assistants,
        assistantCount: networkConfig.assistants ? Object.keys(networkConfig.assistants).length : 0
      });
      
      if (networkConfig && networkConfig.assistants) {
        for (const assistantKey in networkConfig.assistants) {
          const assistantConfig = networkConfig.assistants[assistantKey];
          console.log('🔍 Checking assistant:', assistantKey, {
            address: assistantConfig.address,
            matches: assistantConfig.address === assistant.address
          });
          
          if (assistantConfig.address === assistant.address) {
            const result = {
              ...networkConfig,
              chainId: networkConfig.id,
              bridgeAddress: assistantConfig.bridgeAddress,
              assistantType: assistantConfig.type
            };
            console.log('✅ Found required network:', result);
            return result;
          }
        }
      }
    }
    console.log('❌ No required network found for assistant:', assistant.address);
    return null;
  }, [assistant.address, getAllNetworksWithSettings]);

  // Check current network
  const checkNetwork = useCallback(async () => {
    if (!window.ethereum) return false;
    
    try {
      // Use window.ethereum directly for more reliable network checking
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainIdNumber = parseInt(currentChainId, 16);
      
      const requiredNetworkForCheck = getRequiredNetwork();
      
      if (!requiredNetworkForCheck) {
        console.error('Required network not found for assistant:', assistant.address);
        return false;
      }
      
      const isCorrectNetwork = currentChainIdNumber === requiredNetworkForCheck.chainId;
      
      console.log('🔍 Network check:', {
        currentChainId: currentChainIdNumber,
        currentChainIdHex: currentChainId,
        requiredNetwork: requiredNetworkForCheck,
        isCorrectNetwork
      });
      
      return isCorrectNetwork;
    } catch (error) {
      console.error('Error checking network:', error);
      return false;
    }
  }, [getRequiredNetwork, assistant.address]);

  // Switch to required network
  const switchToRequiredNetwork = useCallback(async () => {
    const requiredNetworkForSwitch = getRequiredNetwork();
    if (!requiredNetworkForSwitch || !window.ethereum) {
      toast.error('Cannot switch network. Please switch manually in your wallet.');
      return false;
    }
    
    // Check if chainId exists
    if (!requiredNetworkForSwitch.chainId) {
      console.error('❌ requiredNetwork.chainId is undefined:', requiredNetworkForSwitch);
      toast.error('Network configuration is missing chain ID. Please check your settings.');
      return false;
    }
    
    // Format chain ID properly
    const chainIdHex = `0x${requiredNetworkForSwitch.chainId.toString(16)}`;
    
    console.log('🔍 Attempting network switch:', {
      requiredNetwork: requiredNetworkForSwitch,
      chainId: requiredNetworkForSwitch.chainId,
      chainIdHex,
      rpcUrl: requiredNetworkForSwitch.rpcUrl,
      blockExplorerUrl: requiredNetworkForSwitch.blockExplorerUrl
    });
    
    try {
      // First try to switch to existing network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
      
      console.log('✅ Network switch request sent');
      
      // Wait for network change event instead of fixed timeout
      console.log('⏳ Waiting for network change event...');
      
      // Set up a promise that resolves when network changes
      const networkChangePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Network switch timeout'));
        }, 10000); // 10 second timeout
        
        const handleChange = (chainId) => {
          clearTimeout(timeout);
          window.ethereum.removeListener('chainChanged', handleChange);
          console.log('✅ Network change event received:', chainId);
          resolve(chainId);
        };
        
        window.ethereum.on('chainChanged', handleChange);
      });
      
      try {
        await networkChangePromise;
        
        // Wait a moment for the network to settle and Web3Context to update
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Recheck the network using the updated provider from context
        console.log('🔍 Verifying network switch...');
        
        // Get the most current network directly from window.ethereum to avoid stale provider
        let currentNetworkFromEthereum;
        try {
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          const chainIdNumber = parseInt(chainId, 16);
          
          // Get network name from our config
          const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].id === chainIdNumber);
          const networkName = networkKey ? NETWORKS[networkKey].name : 'Unknown';
          
          currentNetworkFromEthereum = {
            chainId: chainIdNumber,
            name: networkName
          };
          console.log('🔍 Network from window.ethereum at verification time:', currentNetworkFromEthereum);
        } catch (error) {
          console.log('🔍 Error getting network from window.ethereum:', error);
          // If window.ethereum fails, fall back to context
          const currentNetworkFromContext = network;
          currentNetworkFromEthereum = {
            chainId: currentNetworkFromContext?.chainId || currentNetworkFromContext?.id,
            name: currentNetworkFromContext?.name || 'Unknown'
          };
          console.log('🔍 Using fallback network from context:', currentNetworkFromEthereum);
        }
        
        const requiredNetworkForVerification = getRequiredNetwork();
        
        console.log('🔍 Verification details:', {
          currentNetworkFromEthereum,
          requiredNetworkForVerification,
          currentChainId: currentNetworkFromEthereum?.chainId,
          requiredChainId: requiredNetworkForVerification?.chainId
        });
        
        if (currentNetworkFromEthereum && requiredNetworkForVerification) {
          const currentChainId = currentNetworkFromEthereum.chainId;
          const isCorrectNetwork = currentChainId === requiredNetworkForVerification.chainId;
          
          console.log('🔍 Network verification result:', isCorrectNetwork);
          console.log('🔍 Current network from window.ethereum:', currentNetworkFromEthereum);
          console.log('🔍 Required network:', requiredNetworkForVerification);
          
          if (isCorrectNetwork) {
            toast.success(`Switched to ${requiredNetworkForVerification.name}`);
            return true;
          } else {
            console.log('❌ Network switch verification failed - chain IDs do not match');
            console.log('❌ Current chain ID:', currentChainId, 'Required chain ID:', requiredNetworkForVerification.chainId);
            toast.error('Network switch failed. Please try again.');
            return false;
          }
        } else {
          console.log('❌ Network verification failed - missing network data');
          console.log('❌ Current network:', currentNetworkFromEthereum);
          console.log('❌ Required network:', requiredNetworkForVerification);
          toast.error('Network switch verification failed. Please try again.');
          return false;
        }
      } catch (error) {
        console.log('❌ Network switch timeout or error:', error);
        toast.error('Network switch timeout. Please check your wallet.');
        return false;
      }
    } catch (error) {
      console.error('Network switch error:', error);
      
      if (error.code === 4902) {
        // Chain not added to wallet, try to add it
        console.log('🔍 Chain not added, attempting to add it');
        
        try {
          const addChainParams = {
            chainId: chainIdHex,
            chainName: requiredNetworkForSwitch.name,
            rpcUrls: [requiredNetworkForSwitch.rpcUrl],
            nativeCurrency: {
              name: requiredNetworkForSwitch.nativeCurrency?.name || 'ETH',
              symbol: requiredNetworkForSwitch.nativeCurrency?.symbol || 'ETH',
              decimals: requiredNetworkForSwitch.nativeCurrency?.decimals || 18,
            },
          };
          
          // Only add blockExplorerUrls if it exists
          if (requiredNetworkForSwitch.blockExplorerUrl) {
            addChainParams.blockExplorerUrls = [requiredNetworkForSwitch.blockExplorerUrl];
          }
          
          console.log('🔍 Adding chain with params:', addChainParams);
          
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [addChainParams],
          });
          
          console.log('✅ Chain added successfully');
          
          // Wait for network change event
          console.log('⏳ Waiting for network change event after chain addition...');
          
          const networkChangePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Network switch timeout after chain addition'));
            }, 10000);
            
            const handleChange = (chainId) => {
              clearTimeout(timeout);
              window.ethereum.removeListener('chainChanged', handleChange);
              console.log('✅ Network change event received after chain addition:', chainId);
              resolve(chainId);
            };
            
            window.ethereum.on('chainChanged', handleChange);
          });
          
          try {
            await networkChangePromise;
            
            // Wait a moment for the network to settle and Web3Context to update
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Recheck the network using the updated provider from context
            console.log('🔍 Verifying network switch after chain addition...');
            
            // Get the most current network directly from window.ethereum to avoid stale provider
            let currentNetworkFromEthereum;
            try {
              const chainId = await window.ethereum.request({ method: 'eth_chainId' });
              const chainIdNumber = parseInt(chainId, 16);
              
              // Get network name from our config
              const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].id === chainIdNumber);
              const networkName = networkKey ? NETWORKS[networkKey].name : 'Unknown';
              
              currentNetworkFromEthereum = {
                chainId: chainIdNumber,
                name: networkName
              };
              console.log('🔍 Network from window.ethereum at chain addition verification time:', currentNetworkFromEthereum);
            } catch (error) {
              console.log('🔍 Error getting network from window.ethereum:', error);
              // If window.ethereum fails, fall back to context
              const currentNetworkFromContext = network;
              currentNetworkFromEthereum = {
                chainId: currentNetworkFromContext?.chainId || currentNetworkFromContext?.id,
                name: currentNetworkFromContext?.name || 'Unknown'
              };
              console.log('🔍 Using fallback network from context:', currentNetworkFromEthereum);
            }
            
            const requiredNetworkForVerification = getRequiredNetwork();
            
            console.log('🔍 Chain addition verification details:', {
              currentNetworkFromEthereum,
              requiredNetworkForVerification,
              currentChainId: currentNetworkFromEthereum?.chainId,
              requiredChainId: requiredNetworkForVerification?.chainId
            });
            
            if (currentNetworkFromEthereum && requiredNetworkForVerification) {
              const currentChainId = currentNetworkFromEthereum.chainId;
              const isCorrectNetwork = currentChainId === requiredNetworkForVerification.chainId;
              
              console.log('🔍 Network verification result after addition:', isCorrectNetwork);
              console.log('🔍 Current network after addition:', currentNetworkFromEthereum);
              console.log('🔍 Required network after addition:', requiredNetworkForVerification);
              
              if (isCorrectNetwork) {
                toast.success(`Added and switched to ${requiredNetworkForVerification.name}`);
                return true;
              } else {
                console.log('❌ Chain add verification failed - chain IDs do not match');
                console.log('❌ Current chain ID:', currentChainId, 'Required chain ID:', requiredNetworkForVerification.chainId);
                toast.error('Network was added but switch failed. Please try again.');
                return false;
              }
            } else {
              console.log('❌ Chain add verification failed - missing network data');
              console.log('❌ Current network:', currentNetworkFromEthereum);
              console.log('❌ Required network:', requiredNetworkForVerification);
              toast.error('Network was added but verification failed. Please try again.');
              return false;
            }
          } catch (error) {
            console.log('❌ Network switch timeout after chain addition:', error);
            toast.error('Network was added but switch timeout. Please check your wallet.');
            return false;
          }
        } catch (addError) {
          console.error('Add chain error:', addError);
          
          if (addError.code === 4001) {
            toast.error('Network addition was rejected by user');
          } else {
            toast.error(`Failed to add network: ${addError.message || 'Unknown error'}`);
          }
          return false;
        }
      } else if (error.code === 4001) {
        toast.error('Network switch was rejected by user');
        return false;
      } else {
        console.error('Unexpected network switch error:', error);
        toast.error(`Network switch failed: ${error.message || 'Unknown error'}`);
        return false;
      }
    }
  }, [getRequiredNetwork, network]);

  // Load user share token balance
  const loadUserShareBalance = useCallback(async () => {
    if (!account || !provider) return;

    try {
      const shareTokenContract = new ethers.Contract(
        assistant.address, // Share tokens are typically the assistant contract itself
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await shareTokenContract.balanceOf(account);
      setUserShareBalance(balance.toString());
    } catch (error) {
      console.error('Error loading user share balance:', error);
    }
  }, [account, provider, assistant.address]);

  // Initialize network detection and step management
  useEffect(() => {
    const initializeWithdraw = async () => {
      console.log('🔍 Withdraw initialization:', {
        account,
        hasAccount: !!account,
        assistantAddress: assistant.address
      });

      if (!account) {
        console.log('🔍 No account found, setting step to connect');
        setStep('connect');
        return;
      }

      const requiredNetworkForInit = getRequiredNetwork();
      if (!requiredNetworkForInit) {
        console.error('Required network not found for assistant:', assistant.address);
        setStep('connect'); // Fallback to connect step if network not found
        return;
      }

      // Required network state is no longer needed since we removed the warning UI
      
      // Check current network but don't block the flow
      const isCorrectNetwork = await checkNetwork();
      if (!isCorrectNetwork) {
        console.log('🔍 Wrong network detected, but continuing to withdraw step');
      }

      console.log('🔍 All checks passed, setting step to withdraw');
      setStep('withdraw');
    };

    initializeWithdraw();
  }, [account, getRequiredNetwork, checkNetwork, assistant.address]);


  // Load balance when component mounts and network is correct
  useEffect(() => {
    if (step === 'withdraw' && account && provider) {
      loadUserShareBalance();
    }
  }, [step, account, provider, loadUserShareBalance]);

  // Re-check wallet connection when account changes
  useEffect(() => {
    if (account && step === 'connect') {
      console.log('🔍 Account became available, re-initializing withdraw');
      // Re-run the initialization logic
      const initializeWithdraw = async () => {
        const requiredNetworkForInit = getRequiredNetwork();
        if (!requiredNetworkForInit) {
          console.error('Required network not found for assistant:', assistant.address);
          return;
        }

        // Required network state is no longer needed since we removed the warning UI
        
        // Check current network but don't block the flow
        const isCorrectNetwork = await checkNetwork();
        if (!isCorrectNetwork) {
          console.log('🔍 Wrong network detected, but continuing to withdraw step');
        }

        setStep('withdraw');
      };

      initializeWithdraw();
    }
  }, [account, step, getRequiredNetwork, checkNetwork, assistant.address]);

  const formatBalance = (balance, decimals = 18) => {
    try {
      const formatted = ethers.utils.formatUnits(balance, decimals);
      return parseFloat(formatted).toFixed(6);
    } catch (error) {
      return '0.000000';
    }
  };

  const handleWithdraw = async () => {
    console.log('🚀 handleWithdraw called!');
    
    if (!account || !signer) {
      console.log('❌ No account or signer');
      toast.error('Please connect your wallet');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      console.log('❌ No amount entered');
      toast.error('Please enter a valid amount');
      return;
    }

    // Check if we need to switch networks FIRST, before any balance checks
    console.log('🔍 Checking network before withdraw...');
    console.log('🔍 Assistant info:', {
      address: assistant.address,
      type: assistant.type,
      bridgeAddress: assistant.bridgeAddress
    });
    const requiredNetwork = getRequiredNetwork();
    const isCorrectNetwork = await checkNetwork();
    console.log('🔍 Network check result:', isCorrectNetwork);
    
    if (!isCorrectNetwork) {
      console.log('🚨 NETWORK SWITCHING WILL BE TRIGGERED NOW!');
      console.log('🔄 Wrong network detected, switching automatically...');
      toast(`Switching to ${requiredNetwork.name} network...`);
      const switchSuccess = await switchToRequiredNetwork();
      console.log('🔍 Network switch result:', switchSuccess);
      if (!switchSuccess) {
        toast.error('Failed to switch to the required network');
        return;
      }
      // Wait a moment for the network to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Now check balances after ensuring we're on the correct network
    const amountWei = ethers.utils.parseUnits(amount, 18);
    if (amountWei.gt(userShareBalance)) {
      toast.error('Insufficient share token balance');
      return;
    }

    setLoading(true);
    try {

      const assistantContract = new ethers.Contract(
        assistant.address,
        getAssistantABI(),
        signer
      );

      const amountWei = ethers.utils.parseUnits(amount, 18);
      const tx = await assistantContract.redeemShares(amountWei);

      toast.success('Transaction submitted! Waiting for confirmation...');
      await tx.wait();
      toast.success('Withdraw successful!');
      setStep('success');
      onSuccess();
    } catch (error) {
      console.error('Withdraw error:', error);
      
      // Handle different types of errors gracefully
      if (error.code === 'ACTION_REJECTED' || error.message?.includes('User denied')) {
        toast.error('Transaction was cancelled by user');
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error('Insufficient funds for transaction');
      } else if (error.message?.includes('gas')) {
        toast.error('Transaction failed due to gas issues. Please try again.');
      } else if (error.message?.includes('revert')) {
        toast.error('Transaction failed. Please check your inputs and try again.');
      } else if (error.message?.includes('network')) {
        toast.error('Network error. Please check your connection and try again.');
      } else if (error.message?.includes('execution reverted')) {
        toast.error('Transaction reverted. Please check your inputs and try again.');
      } else if (error.message?.includes('nonce')) {
        toast.error('Transaction nonce error. Please try again.');
      } else if (error.message?.includes('timeout')) {
        toast.error('Transaction timeout. Please try again.');
      } else {
        // Extract meaningful error message if available
        const errorMessage = error.reason || error.message || 'Withdraw failed';
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };


  const handleMaxAmount = () => {
    setAmount(formatBalance(userShareBalance));
  };

  const renderStep = () => {
    switch (step) {
      case 'connect':
        return (
          <div className="text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto text-secondary-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
            <p className="text-secondary-300 mb-6">
              Please connect your wallet to withdraw from this liquidity pool.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-dark-700 hover:bg-dark-600 text-white py-3 px-4 rounded-md text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        );


      case 'withdraw':
        return (
          <div className="space-y-4">
            {/* Share Token Amount */}
            <div>
              <label className="block text-sm font-medium text-secondary-300 mb-2">
                Share Token Amount ({assistant.shareSymbol || 'Shares'})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 bg-dark-700 border border-dark-600 rounded-md px-3 py-2 text-white placeholder-secondary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={handleMaxAmount}
                  className="px-3 py-2 bg-secondary-600 hover:bg-secondary-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                  Max
                </button>
              </div>
              <p className="text-xs text-secondary-500 mt-1">
                Balance: {formatBalance(userShareBalance)} {assistant.shareSymbol || 'Shares'}
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-dark-700 rounded-md p-3">
              <p className="text-sm text-secondary-300">
                Redeeming shares will return the proportional amount of stake tokens and any accumulated rewards.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={loading || !amount}
                className="flex-1 bg-secondary-600 hover:bg-secondary-700 disabled:bg-dark-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
              >
                {loading ? 'Processing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto text-green-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Withdraw Successful!</h3>
            <p className="text-secondary-300 mb-6">
              Your shares have been redeemed successfully. You should receive your stake tokens and rewards shortly.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-md text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {step === 'connect' && 'Connect Wallet'}
            {step === 'network' && 'Network Required'}
            {step === 'withdraw' && `Withdraw from ${assistant.description || assistant.key}`}
            {step === 'success' && 'Withdraw Complete'}
          </h3>
          <button
            onClick={onClose}
            className="text-secondary-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {renderStep()}
      </div>
    </div>
  );
};

export default Withdraw;
