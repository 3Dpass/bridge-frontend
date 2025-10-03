import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { 
  EXPORT_ASSISTANT_ABI, 
  EXPORT_WRAPPER_ASSISTANT_ABI, 
  IMPORT_ASSISTANT_ABI, 
  IMPORT_WRAPPER_ASSISTANT_ABI,
  BATCH_ABI,
  IPRECOMPILE_ERC20_ABI
} from '../contracts/abi';

const Deposit = ({ assistant, onClose, onSuccess }) => {
  console.log('🎯 Deposit component rendered for assistant:', assistant.address);
  const { account, provider, signer, network } = useWeb3();
  const { getAllNetworksWithSettings, get3DPassTokenDecimals } = useSettings();
  const [amount, setAmount] = useState('');
  const [imageAmount, setImageAmount] = useState(''); // For ImportWrapper assistants
  const [loading, setLoading] = useState(false);
  const [userBalance, setUserBalance] = useState('0');
  const [userImageBalance, setUserImageBalance] = useState('0'); // For ImportWrapper assistants
  const [imageTokenDecimals, setImageTokenDecimals] = useState(18); // For ImportWrapper assistants
  const [step, setStep] = useState('approve'); // 'approve', 'approved', 'deposit', 'success'
  const [currentAllowance, setCurrentAllowance] = useState('0');
  const [requiredAmount, setRequiredAmount] = useState('0');
  const [isCheckingApproval, setIsCheckingApproval] = useState(true);
  const [requiredNetwork, setRequiredNetwork] = useState(null);

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

  // Get stake token address
  const getStakeTokenAddress = useCallback((assistant) => {
    const networks = getAllNetworksWithSettings();
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            return bridge.stakeTokenAddress;
          }
        }
      }
    }
    return null;
  }, [getAllNetworksWithSettings]);

  // Check if a token address represents a native token (ETH)
  const isNativeToken = useCallback((tokenAddress) => {
    if (!tokenAddress) return false;
    // Native tokens are typically represented as zero address or null
    return tokenAddress === '0x0000000000000000000000000000000000000000' || 
           tokenAddress === null || 
           tokenAddress === undefined;
  }, []);

  // Get image token address (for Import Wrapper assistants)
  const getImageTokenAddress = useCallback((assistant) => {
    if (assistant.type !== 'import_wrapper') {
      console.log('🔍 Not an Import Wrapper assistant, returning null for image token address');
      return null;
    }
    
    const networks = getAllNetworksWithSettings();
    console.log('🔍 Searching for image token address in networks:', {
      assistantBridgeAddress: assistant.bridgeAddress,
      assistantType: assistant.type,
      networksCount: Object.keys(networks).length,
      networkNames: Object.keys(networks)
    });
    
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        console.log('🔍 Checking network bridges:', {
          networkName: network.name,
          bridgesCount: Object.keys(network.bridges).length,
          bridgeAddresses: Object.values(network.bridges).map(b => b.address)
        });
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            console.log('🔍 Found matching bridge:', {
              bridgeAddress: bridge.address,
              bridgeKeys: Object.keys(bridge),
              foreignTokenAddress: bridge.foreignTokenAddress,
              assistantBridgeAddress: assistant.bridgeAddress
            });
            // For Import Wrapper assistants, the image token is the foreign token address
            const imageTokenAddress = bridge.foreignTokenAddress;
            console.log('✅ Returning image token address:', imageTokenAddress);
            return imageTokenAddress;
          }
        }
      }
    }
    console.log('❌ No matching bridge found for assistant bridge address:', assistant.bridgeAddress);
    return null;
  }, [getAllNetworksWithSettings]);

  // Get stake token symbol
  const getStakeTokenSymbol = useCallback((assistant) => {
    const networks = getAllNetworksWithSettings();
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            return bridge.stakeTokenSymbol;
          }
        }
      }
    }
    return 'Unknown';
  }, [getAllNetworksWithSettings]);

  // Get image token symbol (for Import Wrapper assistants)
  const getImageTokenSymbol = useCallback((assistant) => {
    if (assistant.type !== 'import_wrapper') {
      return null;
    }
    
    const networks = getAllNetworksWithSettings();
    for (const network of Object.values(networks)) {
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          if (bridge.address === assistant.bridgeAddress) {
            return bridge.foreignTokenSymbol || 'Unknown';
          }
        }
      }
    }
    return 'Unknown';
  }, [getAllNetworksWithSettings]);

  // Get stake token address and symbol
  const stakeTokenAddress = getStakeTokenAddress(assistant);
  const stakeTokenSymbol = getStakeTokenSymbol(assistant);
  const imageTokenSymbol = getImageTokenSymbol(assistant);
  
  // Debug logging for Import Wrapper assistants
  if (assistant.type === 'import_wrapper') {
    const imageTokenAddress = getImageTokenAddress(assistant);
    console.log('🔍 Import Wrapper assistant token info:', {
      assistantKey: assistant.key,
      bridgeAddress: assistant.bridgeAddress,
      stakeTokenAddress,
      stakeTokenSymbol,
      imageTokenAddress,
      imageTokenSymbol
    });
  }
  
  // Debug logging
  React.useEffect(() => {
    console.log('🔍 Stake token info:', {
      assistantKey: assistant.key,
      assistantType: assistant.type,
      bridgeAddress: assistant.bridgeAddress,
      stakeTokenAddress,
      stakeTokenSymbol
    });
  }, [assistant.key, assistant.type, assistant.bridgeAddress, stakeTokenAddress, stakeTokenSymbol]);

  // Use getImageTokenAddress consistently for ImportWrapper assistants
  const imageTokenAddress = getImageTokenAddress(assistant);
  
  // Debug logging for image token address
  React.useEffect(() => {
    if (assistant.type === 'import_wrapper') {
      console.log('🔍 Image token address resolved:', {
        assistantKey: assistant.key,
        assistantType: assistant.type,
        bridgeAddress: assistant.bridgeAddress,
        imageTokenAddress,
        hasImageTokenAddress: !!imageTokenAddress,
        imageTokenSymbol,
        userImageBalance,
        formattedImageBalance: formatBalance(userImageBalance)
      });
    }
  }, [assistant.key, assistant.type, assistant.bridgeAddress, imageTokenAddress, imageTokenSymbol, userImageBalance]);

  // Get the required network for this assistant
  const getRequiredNetwork = useCallback(() => {
    const networks = getAllNetworksWithSettings();
    
    console.log('🔍 getRequiredNetwork called for bridge address:', assistant.bridgeAddress);
    console.log('🔍 Available networks:', Object.keys(networks));
    
    for (const network of Object.values(networks)) {
      console.log('🔍 Checking network:', network.name, {
        hasBridges: !!network.bridges,
        bridgeCount: network.bridges ? Object.keys(network.bridges).length : 0,
        bridgeAddresses: network.bridges ? Object.values(network.bridges).map(bridge => bridge.address) : []
      });
      
      if (network.bridges) {
        for (const bridge of Object.values(network.bridges)) {
          console.log('🔍 Checking bridge:', {
            bridgeAddress: bridge.address,
            assistantBridgeAddress: assistant.bridgeAddress,
            networkName: network.name,
            networkId: network.id,
            matches: bridge.address === assistant.bridgeAddress
          });
          
          if (bridge.address === assistant.bridgeAddress) {
            // Map id to chainId for compatibility
            const networkWithChainId = {
              ...network,
              chainId: network.id || network.chainId
            };
            
            console.log('✅ Found required network:', {
              networkName: network.name,
              id: network.id,
              chainId: networkWithChainId.chainId,
              bridgeAddress: bridge.address,
              assistantType: assistant.type
            });
            return networkWithChainId;
          }
        }
      }
    }
    
    console.log('❌ Required network not found for bridge address:', assistant.bridgeAddress);
    return null;
  }, [assistant.bridgeAddress, assistant.type, getAllNetworksWithSettings]);


  // Check current network and detect if switching is needed
  const checkNetwork = useCallback(async () => {
    if (!provider) return false;
    
    try {
      // Use ethers provider for network checking
      const currentNetwork = await provider.getNetwork();
      const currentChainId = currentNetwork.chainId;
      
      const requiredNetwork = getRequiredNetwork();
      
      if (!requiredNetwork) {
        console.error('Required network not found for assistant:', assistant.bridgeAddress);
        return false;
      }
      
      const isCorrectNetwork = currentChainId === requiredNetwork.chainId;
      
      console.log('🔍 Network check:', {
        currentChainId: currentChainId,
        currentNetworkName: currentNetwork.name,
        requiredNetwork: requiredNetwork,
        isCorrectNetwork
      });
      
      return isCorrectNetwork;
    } catch (error) {
      console.error('Error checking network:', error);
      return false;
    }
  }, [provider, getRequiredNetwork, assistant.bridgeAddress]);

  // Switch to the required network using ethers
  const switchToRequiredNetwork = useCallback(async () => {
    const currentRequiredNetwork = getRequiredNetwork();
    if (!currentRequiredNetwork || !provider) {
      toast.error('Cannot switch network. Please switch manually in your wallet.');
      return false;
    }
    
    // Check if chainId exists
    if (!currentRequiredNetwork.chainId) {
      console.error('❌ currentRequiredNetwork.chainId is undefined:', currentRequiredNetwork);
      toast.error('Network configuration is missing chain ID. Please check your settings.');
      return false;
    }
    
    console.log('🔍 Attempting network switch:', {
      requiredNetwork: currentRequiredNetwork,
      chainId: currentRequiredNetwork.chainId,
      rpcUrl: currentRequiredNetwork.rpcUrl,
      blockExplorerUrl: currentRequiredNetwork.blockExplorerUrl
    });
    
    try {
      setLoading(true);
      
      // Use ethers to switch network
      const network = await provider.getNetwork();
      const currentChainId = network.chainId;
      
      if (currentChainId === currentRequiredNetwork.chainId) {
        console.log('✅ Already on correct network');
        toast.success(`Already on ${currentRequiredNetwork.name}`);
        return true;
      }
      
      // For network switching, we still need to use window.ethereum as ethers doesn't provide this functionality
      // But we'll use ethers for verification
      if (!window.ethereum) {
        toast.error('MetaMask not available for network switching');
        return false;
      }
      
      const chainIdHex = `0x${currentRequiredNetwork.chainId.toString(16)}`;
      
      try {
        // Try to switch to existing network
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        
        console.log('✅ Network switch request sent');
        
        // Wait for network change and verify with ethers
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify the switch using ethers
        const newNetwork = await provider.getNetwork();
        const isCorrectNetwork = newNetwork.chainId === currentRequiredNetwork.chainId;
          
          if (isCorrectNetwork) {
          toast.success(`Switched to ${currentRequiredNetwork.name}`);
            return true;
          } else {
          console.log('❌ Network switch verification failed');
            toast.error('Network switch failed. Please try again.');
            return false;
          }
        
      } catch (switchError) {
        if (switchError.code === 4902) {
          // Chain not added, try to add it
        console.log('🔍 Chain not added, attempting to add it');
        
          const addChainParams = {
            chainId: chainIdHex,
            chainName: currentRequiredNetwork.name,
            rpcUrls: [currentRequiredNetwork.rpcUrl],
            nativeCurrency: {
              name: currentRequiredNetwork.nativeCurrency?.name || 'ETH',
              symbol: currentRequiredNetwork.nativeCurrency?.symbol || 'ETH',
              decimals: currentRequiredNetwork.nativeCurrency?.decimals || 18,
            },
          };
          
          if (currentRequiredNetwork.blockExplorerUrl) {
            addChainParams.blockExplorerUrls = [currentRequiredNetwork.blockExplorerUrl];
          }
          
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [addChainParams],
          });
          
          console.log('✅ Chain added successfully');
          
          // Wait and verify with ethers
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const newNetwork = await provider.getNetwork();
          const isCorrectNetwork = newNetwork.chainId === currentRequiredNetwork.chainId;
              
              if (isCorrectNetwork) {
            toast.success(`Added and switched to ${currentRequiredNetwork.name}`);
                return true;
              } else {
                toast.error('Network was added but switch failed. Please try again.');
                return false;
              }
        } else if (switchError.code === 4001) {
          toast.error('Network switch was rejected by user');
              return false;
          } else {
          throw switchError;
        }
      }
      
    } catch (error) {
      console.error('Network switch error:', error);
        toast.error(`Network switch failed: ${error.message || 'Unknown error'}`);
        return false;
    } finally {
      setLoading(false);
    }
  }, [provider, getRequiredNetwork]);

  // Create token contract for approval
  const createTokenContract = useCallback((tokenAddress) => {
    const tokenABI = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function allowance(address owner, address spender) external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
      'function decimals() external view returns (uint8)',
      'function symbol() external view returns (string)'
    ];
    return new ethers.Contract(tokenAddress, tokenABI, signer);
  }, [signer]);

  // Create batch contract for Import Wrapper assistants
  const createBatchContract = useCallback(() => {
    // Batch precompile address on 3DPass
    const BATCH_ADDRESS = '0x0000000000000000000000000000000000000808';
    return new ethers.Contract(BATCH_ADDRESS, BATCH_ABI, signer);
  }, [signer]);

  // Check if batch approval is needed for ImportWrapper assistants (3DPass only)
  const checkBatchApprovalNeeded = useCallback(async () => {
    if (assistant.type !== 'import_wrapper') {
      return false;
    }

    console.log('🔍 checkBatchApprovalNeeded called for Import Wrapper assistant', {
      amount,
      imageAmount,
      hasAmount: !!amount && parseFloat(amount) > 0,
      hasImageAmount: !!imageAmount && parseFloat(imageAmount) > 0
    });
    
    try {
      setIsCheckingApproval(true);
      
      // Get both token addresses
      const stakeTokenAddress = getStakeTokenAddress(assistant);
      const imageTokenAddress = getImageTokenAddress(assistant);
      
      console.log('🔍 Token addresses:', { stakeTokenAddress, imageTokenAddress });
      
      if (!stakeTokenAddress || !imageTokenAddress) {
        console.log('🔍 Missing token addresses - returning false (no approval needed)');
        setIsCheckingApproval(false);
        return false;
      }

      // For Import Wrapper assistants, we need to check approval for both tokens
      // regardless of which amounts are currently entered
      console.log('🔍 Checking approval for both tokens (Import Wrapper)');

      // Create contracts for both tokens
      const stakeTokenContract = new ethers.Contract(stakeTokenAddress, IPRECOMPILE_ERC20_ABI, signer);
      const imageTokenContract = new ethers.Contract(imageTokenAddress, IPRECOMPILE_ERC20_ABI, signer);
      
      // Get decimals and amounts
      const stakeDecimals = await stakeTokenContract.decimals();
      const imageDecimals = await imageTokenContract.decimals();
      
      // For Import Wrapper assistants, we need to approve a large amount for both tokens
      // to avoid having to re-approve for each deposit
      const maxApprovalAmount = ethers.utils.parseUnits('1000000', stakeDecimals); // 1M tokens
      const maxImageApprovalAmount = ethers.utils.parseUnits('1000000', imageDecimals); // 1M tokens
      
      // Check current allowances
      const stakeAllowance = await stakeTokenContract.allowance(account, assistant.address);
      const imageAllowance = await imageTokenContract.allowance(account, assistant.address);
      
      // Store values for display
      const formattedStakeRequired = ethers.utils.formatUnits(maxApprovalAmount, stakeDecimals);
      const formattedImageRequired = ethers.utils.formatUnits(maxImageApprovalAmount, imageDecimals);
      const formattedStakeCurrent = ethers.utils.formatUnits(stakeAllowance, stakeDecimals);
      const formattedImageCurrent = ethers.utils.formatUnits(imageAllowance, imageDecimals);
      
      console.log('🔍 Setting approval display:', {
        stakeTokenSymbol,
        imageTokenSymbol,
        formattedStakeRequired,
        formattedImageRequired
      });
      
      // For display, show the actual amounts entered by the user
      // For approval, we still use the large amounts (1M tokens each)
      const actualStakeAmount = amount && parseFloat(amount) > 0 ? amount : '0';
      const actualImageAmount = imageAmount && parseFloat(imageAmount) > 0 ? imageAmount : '0';
      
      setRequiredAmount(`${actualStakeAmount} ${stakeTokenSymbol}\n${actualImageAmount} ${imageTokenSymbol}`);
      setCurrentAllowance(`${formattedStakeCurrent} ${stakeTokenSymbol}\n${formattedImageCurrent} ${imageTokenSymbol}`);
      
      // Check if approval is needed for both tokens (always check against large approval amounts)
      const needsStakeApproval = stakeAllowance.lt(maxApprovalAmount);
      const needsImageApproval = imageAllowance.lt(maxImageApprovalAmount);
      const needsApproval = needsStakeApproval || needsImageApproval;
      
      console.log('🔍 Batch approval check completed:', {
        maxApprovalAmount: maxApprovalAmount.toString(),
        maxImageApprovalAmount: maxImageApprovalAmount.toString(),
        stakeAllowance: stakeAllowance.toString(),
        imageAllowance: imageAllowance.toString(),
        needsStakeApproval,
        needsImageApproval,
        needsApproval,
        actualStakeAmount,
        actualImageAmount
      });
      
      return needsApproval;
    } catch (error) {
      console.error('Error checking batch approval:', error);
      return true; // Assume approval is needed if check fails
    } finally {
      setIsCheckingApproval(false);
    }
  }, [assistant, account, signer, amount, imageAmount, getStakeTokenAddress, getImageTokenAddress, stakeTokenSymbol, imageTokenSymbol]);

  // Handle batch approval for ImportWrapper assistants (3DPass only)
  const handleBatchApprove = async () => {
    if (assistant.type !== 'import_wrapper') {
      return;
    }

    console.log('🔐 Starting batch approval for ImportWrapper assistant...');
    
    setLoading(true);
    try {
      // Get both token addresses
      const stakeTokenAddress = getStakeTokenAddress(assistant);
      const imageTokenAddress = getImageTokenAddress(assistant);
      
      console.log('🔐 Batch approval token addresses:', {
        stakeTokenAddress,
        imageTokenAddress,
        assistantAddress: assistant.address,
        assistantType: assistant.type
      });
      
      if (!stakeTokenAddress || !imageTokenAddress) {
        console.error('❌ Missing token addresses:', {
          stakeTokenAddress,
          imageTokenAddress
        });
        throw new Error('Missing token addresses');
      }

      // Create contracts
      const stakeTokenContract = new ethers.Contract(stakeTokenAddress, IPRECOMPILE_ERC20_ABI, signer);
      const imageTokenContract = new ethers.Contract(imageTokenAddress, IPRECOMPILE_ERC20_ABI, signer);
      const batchContract = createBatchContract();
      
      // Get decimals and amounts from settings (not from contract)
      const stakeDecimals = get3DPassTokenDecimals(stakeTokenAddress) || 18;
      const imageDecimals = get3DPassTokenDecimals(imageTokenAddress) || 18;
      
      // Approve large amounts for both tokens to avoid re-approval
      const maxApprovalAmount = ethers.utils.parseUnits('1000000', stakeDecimals); // 1M tokens
      const maxImageApprovalAmount = ethers.utils.parseUnits('1000000', imageDecimals); // 1M tokens
      
      // Prepare batch call data for both tokens
      const stakeApproveData = stakeTokenContract.interface.encodeFunctionData('approve', [assistant.address, maxApprovalAmount]);
      const imageApproveData = imageTokenContract.interface.encodeFunctionData('approve', [assistant.address, maxImageApprovalAmount]);
      
      console.log('🔐 Batch call data prepared:', {
        stakeApproveData: stakeApproveData.slice(0, 10) + '...',
        imageApproveData: imageApproveData.slice(0, 10) + '...',
        maxApprovalAmount: maxApprovalAmount.toString(),
        maxImageApprovalAmount: maxImageApprovalAmount.toString()
      });
      
      // Batch parameters
      const to = [stakeTokenAddress, imageTokenAddress];
      const values = [0, 0]; // No ETH value for approvals
      const callData = [stakeApproveData, imageApproveData];
      const gasLimits = [100000, 100000]; // Gas limit for each approval
      
      console.log('🔐 Executing batch approval...', {
        to,
        callData: callData.map(data => data.slice(0, 10) + '...'), // Show only function selectors
        gasLimits
      });
      
      // Execute batch approval
      const batchTx = await batchContract.batchAll(to, values, callData, gasLimits, {
        gasLimit: 300000 // Higher gas limit for batch transaction
      });
      
      console.log('⏳ Waiting for batch approval transaction confirmation...');
      const receipt = await batchTx.wait();
      
      console.log('✅ Batch approval transaction confirmed:', receipt.transactionHash);
      
      // Verify the approval worked by checking allowances again
      console.log('🔍 Verifying approval after transaction...');
      
      // Wait a moment for the blockchain to update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check allowances directly instead of using checkBatchApprovalNeeded to avoid state issues
      const stakeAllowance = await stakeTokenContract.allowance(account, assistant.address);
      const imageAllowance = await imageTokenContract.allowance(account, assistant.address);
      
      console.log('🔍 Post-transaction allowances:', {
        stakeAllowance: stakeAllowance.toString(),
        imageAllowance: imageAllowance.toString(),
        maxApprovalAmount: maxApprovalAmount.toString(),
        maxImageApprovalAmount: maxImageApprovalAmount.toString()
      });
      
      const stakeApproved = stakeAllowance.gte(maxApprovalAmount);
      const imageApproved = imageAllowance.gte(maxImageApprovalAmount);
      
      console.log('🔍 Approval verification results:', {
        stakeApproved,
        imageApproved,
        bothApproved: stakeApproved && imageApproved
      });
      
      if (stakeApproved && imageApproved) {
        console.log('✅ Both tokens approved successfully!');
        toast.success('Both tokens approved successfully!');
        setStep('approved');
      } else {
        console.log('⚠️ Approval verification failed:', {
          stakeApproved,
          imageApproved,
          stakeAllowance: stakeAllowance.toString(),
          imageAllowance: imageAllowance.toString()
        });
        toast.error('Approval transaction completed but verification failed. Please try again.');
      }
      
    } catch (error) {
      console.error('Batch approval error:', error);
      
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction was rejected by user');
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error('Insufficient funds for gas');
      } else if (error.message?.includes('gas')) {
        toast.error('Gas estimation failed. Please try again.');
      } else if (error.message?.includes('revert')) {
        toast.error('Transaction failed. Please check your inputs.');
      } else if (error.code === 'NETWORK_ERROR') {
        toast.error('Network error. Please check your connection.');
      } else if (error.code === 'NONCE_EXPIRED') {
        toast.error('Transaction nonce expired. Please try again.');
      } else if (error.message?.includes('timeout')) {
        toast.error('Transaction timeout. Please try again.');
      } else {
        toast.error(`Batch approval failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Check if approval is needed
  const checkApprovalNeeded = useCallback(async () => {
    console.log('🔍 checkApprovalNeeded called with:', {
      stakeTokenAddress,
      account,
      hasSigner: !!signer,
      amount,
      assistantAddress: assistant.address,
      assistantType: assistant.type
    });
    
    // First check if we're on the correct network
    const isCorrectNetwork = await checkNetwork();
    if (!isCorrectNetwork) {
      console.log('🔍 Early return - wrong network');
      setIsCheckingApproval(false);
      return false;
    }
    
    if (!account || !signer) {
      console.log('🔍 Early return - missing dependencies');
      setIsCheckingApproval(false);
      return false;
    }
    
    // For Import and ImportWrapper assistants, check if either amount or imageAmount is entered
    // For other assistants, only check amount
    const hasValidAmount = (assistant.type === 'import_wrapper' || assistant.type === 'import')
      ? (amount && parseFloat(amount) > 0) || (imageAmount && parseFloat(imageAmount) > 0)
      : (amount && parseFloat(amount) > 0);
      
    if (!hasValidAmount) {
      console.log('🔍 Early return - no valid amount');
      setIsCheckingApproval(false);
      return false;
    }
    
    // For ImportWrapper assistants, use batch approval check (3DPass only)
    if (assistant.type === 'import_wrapper') {
      console.log('🔍 Calling checkBatchApprovalNeeded for ImportWrapper assistant');
      const result = await checkBatchApprovalNeeded();
      console.log('🔍 checkBatchApprovalNeeded returned:', result);
      return result;
    }
    
    // For other assistant types, use regular approval check
    if (!stakeTokenAddress) {
      console.log('🔍 Early return - missing stake token address');
      setIsCheckingApproval(false);
      return false;
    }
    
    try {
      setIsCheckingApproval(true);
      const tokenContract = createTokenContract(stakeTokenAddress);
      const actualDecimals = await tokenContract.decimals();
      const amountWei = ethers.utils.parseUnits(amount, actualDecimals);
      const allowance = await tokenContract.allowance(account, assistant.address);
      
      // Store the values for display
      const formattedRequired = ethers.utils.formatUnits(amountWei, actualDecimals);
      const formattedCurrent = ethers.utils.formatUnits(allowance, actualDecimals);
      
      setRequiredAmount(formattedRequired);
      setCurrentAllowance(formattedCurrent);
      
      const needsApproval = allowance.lt(amountWei);
      console.log('🔍 Approval check completed:', {
        amount,
        actualDecimals,
        amountWei: amountWei.toString(),
        allowance: allowance.toString(),
        required: formattedRequired,
        current: formattedCurrent,
        needsApproval
      });
      
      return needsApproval;
    } catch (error) {
      console.error('Error checking approval:', error);
      return true; // Assume approval is needed if check fails
    } finally {
      setIsCheckingApproval(false);
    }
  }, [stakeTokenAddress, amount, imageAmount, assistant.address, assistant.type, account, signer, createTokenContract, checkNetwork, checkBatchApprovalNeeded]);

  // Handle approval
  const handleApprove = async () => {
    console.log('🔐 handleApprove called for assistant type:', assistant.type);
    
    if (!account || !signer) {
      toast.error('Please connect your wallet');
      return;
    }

    // For ImportWrapper assistants, use batch approval (3DPass only)
    if (assistant.type === 'import_wrapper') {
      console.log('🔐 Calling handleBatchApprove for ImportWrapper assistant');
      return await handleBatchApprove();
    }

    // For other assistant types, use regular approval
    if (!stakeTokenAddress) {
      toast.error('Missing token address');
      return;
    }

    setLoading(true);
    try {
      const tokenContract = createTokenContract(stakeTokenAddress);
      const actualDecimals = await tokenContract.decimals();
      const amountWei = ethers.utils.parseUnits(amount, actualDecimals);
      
      console.log('🔐 Approving assistant to spend tokens...');
      const approveTx = await tokenContract.approve(assistant.address, amountWei, { 
        gasLimit: 100000 
      });
      
      console.log('⏳ Waiting for approval transaction confirmation...');
      const receipt = await approveTx.wait();
      
      console.log('✅ Approval transaction confirmed:', receipt.transactionHash);
      
      // Refresh allowance display
      const updatedAllowance = await tokenContract.allowance(account, assistant.address);
      setCurrentAllowance(ethers.utils.formatUnits(updatedAllowance, actualDecimals));
      setRequiredAmount(ethers.utils.formatUnits(amountWei, actualDecimals));
      
      setStep('approved');
      toast.success('Approval successful!');
      
    } catch (error) {
      console.error('❌ Approval failed:', error);
      
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
        const errorMessage = error.reason || error.message || 'Approval failed';
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Load user balances
  const loadUserBalances = useCallback(async () => {
    console.log('🔄 loadUserBalances called:', {
      hasAccount: !!account,
      hasProvider: !!provider,
      assistantType: assistant.type,
      imageTokenAddress,
      stakeTokenAddress
    });
    
    if (!account || !provider) {
      console.log('❌ Early return - missing account or provider');
      return;
    }

    try {
      console.log('🔍 Starting balance loading process...');
      
      // Load stake token balance
      if (stakeTokenAddress) {
        console.log('🔍 Loading stake token balance for:', stakeTokenAddress);
        const networks = getAllNetworksWithSettings();
        const isNativeToken = Object.values(networks).some(network => {
          if (network.tokens) {
            return Object.values(network.tokens).some(token => 
              token.isNative && token.address.toLowerCase() === stakeTokenAddress.toLowerCase()
            );
          }
          return false;
        });

        if (isNativeToken) {
          const balance = await provider.getBalance(account);
          setUserBalance(balance.toString());
        } else {
          const tokenABI = [
            'function balanceOf(address account) external view returns (uint256)',
            'function decimals() external view returns (uint8)',
            'function symbol() external view returns (string)'
          ];
          const tokenContract = new ethers.Contract(
            stakeTokenAddress,
            tokenABI,
            provider
          );
          const balance = await tokenContract.balanceOf(account);
          setUserBalance(balance.toString());
        }
      }

      // Load image token balance for ImportWrapper assistants
      console.log('🔍 Checking if should load image token balance:', {
        assistantType: assistant.type,
        hasImageTokenAddress: !!imageTokenAddress,
        imageTokenAddress
      });
      
      if (assistant.type === 'import_wrapper' && imageTokenAddress) {
        console.log('🔍 Loading image token balance:', {
          imageTokenAddress,
          account,
          assistantType: assistant.type,
          provider: !!provider,
          networkId: network?.id || network?.chainId
        });
        
        try {
          console.log('🔍 Creating token contract...');
          const tokenContract = new ethers.Contract(
            imageTokenAddress,
            IPRECOMPILE_ERC20_ABI,
            provider
          );
          console.log('🔍 Token contract created successfully');
          
          // Get decimals from settings context instead of contract
          const decimals = get3DPassTokenDecimals(imageTokenAddress) || 18;
          console.log('🔍 Token decimals from settings:', decimals);
          
          // Try to get token info (name and symbol) from contract
          console.log('🔍 Getting token info...');
          let name, symbol;
          
          try {
            name = await tokenContract.name();
            console.log('🔍 Token name:', name);
          } catch (nameError) {
            console.log('⚠️ Failed to get token name:', nameError.message);
            name = 'Unknown';
          }
          
          try {
            symbol = await tokenContract.symbol();
            console.log('🔍 Token symbol:', symbol);
          } catch (symbolError) {
            console.log('⚠️ Failed to get token symbol:', symbolError.message);
            symbol = 'Unknown';
          }
          
          console.log('🔍 Token info summary:', { name, symbol, decimals });
          
          console.log('🔍 Getting balance...');
          const balance = await tokenContract.balanceOf(account);
          console.log('🔍 Image token balance loaded successfully:', {
            balance: balance.toString(),
            formatted: ethers.utils.formatUnits(balance, decimals),
            isZero: balance.isZero(),
            tokenName: name,
            tokenSymbol: symbol,
            tokenDecimals: decimals
          });
          setUserImageBalance(balance.toString());
          setImageTokenDecimals(decimals);
        } catch (balanceError) {
          console.error('❌ Error loading image token balance:', balanceError);
          console.log('🔍 Balance loading error details:', {
            imageTokenAddress,
            account,
            errorMessage: balanceError.message,
            errorCode: balanceError.code,
            errorStack: balanceError.stack
          });
          
          // Try with a simpler ABI as fallback
          try {
            console.log('🔍 Trying fallback with simple ABI...');
            const fallbackContract = new ethers.Contract(
              imageTokenAddress,
              ['function balanceOf(address) view returns (uint256)'],
              provider
            );
            const fallbackBalance = await fallbackContract.balanceOf(account);
            const fallbackDecimals = get3DPassTokenDecimals(imageTokenAddress) || 18;
            console.log('🔍 Fallback balance loaded:', {
              balance: fallbackBalance.toString(),
              formatted: ethers.utils.formatUnits(fallbackBalance, fallbackDecimals),
              decimals: fallbackDecimals
            });
            setUserImageBalance(fallbackBalance.toString());
            setImageTokenDecimals(fallbackDecimals);
          } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError);
            setUserImageBalance('0');
            setImageTokenDecimals(18); // Default fallback
          }
        }
      } else if (assistant.type === 'import_wrapper') {
        console.log('⚠️ Import Wrapper assistant but no image token address found:', {
          assistantType: assistant.type,
          imageTokenAddress,
          bridgeAddress: assistant.bridgeAddress,
          hasImageTokenAddress: !!imageTokenAddress,
          networks: getAllNetworksWithSettings()
        });
        // Set to 0 if no token address found
        setUserImageBalance('0');
        setImageTokenDecimals(18); // Default fallback
      }
    } catch (error) {
      console.error('Error loading user balances:', error);
    } finally {
      console.log('🔍 loadUserBalances completed');
    }
  }, [account, provider, stakeTokenAddress, imageTokenAddress, assistant.type, assistant.bridgeAddress, getAllNetworksWithSettings, get3DPassTokenDecimals, network?.chainId, network?.id]);

  // Load balances when component mounts
  React.useEffect(() => {
    loadUserBalances();
  }, [loadUserBalances]);


  // Initialize required network when component mounts
  React.useEffect(() => {
    const requiredNetwork = getRequiredNetwork();
    setRequiredNetwork(requiredNetwork);
    console.log('🔍 Initialized required network:', requiredNetwork);
  }, [getRequiredNetwork]);

  // Check network when component mounts
  React.useEffect(() => {
    checkNetwork();
  }, [checkNetwork]);

  // Listen for network changes from Web3Context instead of directly
  React.useEffect(() => {
    // When the network changes in Web3Context, this will trigger
    // because the network dependency will change
    if (network && account) {
      console.log('🔄 Network changed, updating component state:', network);
      
      // Network state is no longer needed since we removed the warning UI
      
      // Also update requiredNetwork to ensure it's current
      const requiredNetwork = getRequiredNetwork();
      setRequiredNetwork(requiredNetwork);
      
      console.log('🔄 Updated component state:', {
        requiredNetwork: requiredNetwork
      });
      
      checkNetwork();
      loadUserBalances();
    }
  }, [network, account, checkNetwork, loadUserBalances, getRequiredNetwork]);

  // Check approval when component mounts and when amount changes
  React.useEffect(() => {
    const checkApproval = async () => {
      console.log('🔍 useEffect checkApproval called with:', {
        amount,
        imageAmount,
        hasSigner: !!signer,
        hasStakeTokenAddress: !!stakeTokenAddress,
        assistantType: assistant.type,
        stakeTokenAddress
      });
      
      // For Import Wrapper assistants, check if either amount or imageAmount is entered
      // For other assistants, only check amount
      const hasValidAmount = assistant.type === 'import_wrapper' 
        ? (amount && parseFloat(amount) > 0) || (imageAmount && parseFloat(imageAmount) > 0)
        : (amount && parseFloat(amount) > 0);
        
      if (hasValidAmount && signer) {
        try {
          const needsApproval = await checkApprovalNeeded();
          console.log('🔍 Approval check result:', needsApproval);
          if (!needsApproval) {
            setStep('approved');
          } else {
            setStep('approve');
          }
        } catch (error) {
          console.error('Error in approval check:', error);
          setStep('approve');
        }
      } else if (!amount || parseFloat(amount) <= 0) {
        // Reset to initial state when no amount is entered
        console.log('🔍 Resetting to initial state - no amount');
        setStep('approve');
        setIsCheckingApproval(false);
      }
    };
    
    checkApproval();
  }, [signer, stakeTokenAddress, amount, imageAmount, assistant.type, checkApprovalNeeded]);

  const formatBalance = (balance, decimals = 18) => {
    try {
      const formatted = ethers.utils.formatUnits(balance, decimals);
      return parseFloat(formatted).toFixed(6);
    } catch (error) {
      return '0.000000';
    }
  };

  const handleDeposit = async () => {
    console.log('🚀 handleDeposit called!');
    
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

    if ((assistant.type === 'import_wrapper' || assistant.type === 'import') && (!imageAmount || parseFloat(imageAmount) <= 0)) {
      console.log('❌ No image amount entered for', assistant.type, 'assistant');
      toast.error('Please enter a valid image asset amount');
      return;
    }

    // Check if we need to switch networks FIRST, before any balance checks
    console.log('🔍 Checking network before deposit...');
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
      toast(`Switching to ${requiredNetwork?.name || 'required'} network...`);
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
    if (amountWei.gt(userBalance)) {
      toast.error('Insufficient balance');
      return;
    }

    if (assistant.type === 'import_wrapper' || assistant.type === 'import') {
      // Use consistent decimals from settings for balance check
      const imageTokenDecimalsForBalance = get3DPassTokenDecimals(imageTokenAddress) || 18;
      const imageAmountWei = ethers.utils.parseUnits(imageAmount, imageTokenDecimalsForBalance);
      console.log('🔍 Balance check for', assistant.type, 'assistant:', {
        imageAmount,
        imageAmountWei: imageAmountWei.toString(),
        userImageBalance,
        userImageBalanceWei: userImageBalance,
        imageTokenAddress,
        imageTokenSymbol,
        imageTokenDecimalsForBalance,
        hasEnoughBalance: imageAmountWei.lte(userImageBalance)
      });
      
      if (imageAmountWei.gt(userImageBalance)) {
        console.log('❌ Insufficient image asset balance detected:', {
          requested: imageAmountWei.toString(),
          available: userImageBalance,
          difference: imageAmountWei.sub(userImageBalance).toString()
        });
        toast.error('Insufficient image asset balance');
        return;
      }
    }

    setLoading(true);
    try {
      console.log('🔍 Creating assistant contract...');
      const abi = getAssistantABI();
      console.log('🔍 Contract details:', {
        assistantAddress: assistant.address,
        assistantType: assistant.type,
        abiLength: abi.length,
        abiFunctions: abi.filter(item => item.type === 'function').length,
        hasSigner: !!signer,
        signerAddress: signer ? await signer.getAddress() : 'No signer'
      });

      const assistantContract = new ethers.Contract(
        assistant.address,
        abi,
        signer
      );
      console.log('✅ Assistant contract created successfully');
      
      // Verify the contract is properly connected
      console.log('🔍 Contract connection details:', {
        contractAddress: assistantContract.address,
        hasBuyShares: typeof assistantContract.buyShares === 'function',
        signerAddress: await assistantContract.signer.getAddress()
      });
      
      // Verify the contract has the buyShares method
      if (!assistantContract.buyShares) {
        throw new Error(`Contract at ${assistant.address} does not have buyShares method`);
      }
      console.log('✅ buyShares method found on contract');

      let tx;
      
      // Get the correct decimals for both tokens from settings (consistent with approval logic)
      const stakeTokenDecimals = get3DPassTokenDecimals(stakeTokenAddress) || 18;
      const imageTokenDecimalsFromSettings = get3DPassTokenDecimals(imageTokenAddress) || 18;
      
      const amountWei = ethers.utils.parseUnits(amount, stakeTokenDecimals);
      console.log('🔍 Amount details:', {
        amount,
        amountWei: amountWei.toString(),
        stakeTokenDecimals,
        stakeTokenAddress,
        isNativeToken: isNativeToken(stakeTokenAddress)
      });

    // Call buyShares with the correct signature based on assistant type
    if (assistant.type === 'import_wrapper') {
      // ImportWrapperAssistant: buyShares(uint stake_asset_amount, uint image_asset_amount)
      if (!imageAmount) {
        toast.error('Please enter image asset amount for ImportWrapper assistant');
        setLoading(false);
        return;
      }
      // Use consistent decimals from settings, not state variable
      const imageAmountWei = ethers.utils.parseUnits(imageAmount, imageTokenDecimalsFromSettings);
      console.log('🔍 ImportWrapperAssistant transaction details:', {
        amountWei: amountWei.toString(),
        imageAmountWei: imageAmountWei.toString(),
        value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0'
      });
      console.log('🔍 Calling buyShares with 2 parameters (stake, image)...');
      console.log('🔍 Contract method details:', {
        contractAddress: assistant.address,
        methodName: 'buyShares',
        params: [amountWei.toString(), imageAmountWei.toString()],
        value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0',
        hasSigner: !!signer,
        signerAddress: await signer.getAddress()
      });
      
      try {
        console.log('🚀 About to call buyShares on ImportWrapperAssistant...');
        console.log('🚀 Parameters:', {
          amountWei: amountWei.toString(),
          imageAmountWei: imageAmountWei.toString(),
          value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0'
        });
        
        // First, let's verify the contract is working by calling a simple view function
        console.log('🔍 Testing contract connectivity...');
        try {
          const bridgeAddress = await assistantContract.bridgeAddress();
          const tokenAddress = await assistantContract.tokenAddress();
          const precompileAddress = await assistantContract.precompileAddress();
          console.log('✅ Contract connectivity test passed:', {
            bridgeAddress,
            tokenAddress,
            precompileAddress
          });
        } catch (connectError) {
          console.error('❌ Contract connectivity test failed:', connectError);
          throw new Error(`Contract not responding: ${connectError.message}`);
        }
        
        // Check token approvals - User must approve Assistant to spend tokens
        console.log('🔍 Checking token approvals...');
        const userAddress = await signer.getAddress();
        
        // Check stake token approval (P3D precompile)
        if (!isNativeToken(stakeTokenAddress)) {
          console.log('🔍 Stake token is ERC20, checking allowance...');
          const stakeTokenContract = new ethers.Contract(stakeTokenAddress, IPRECOMPILE_ERC20_ABI, signer);
          const stakeAllowance = await stakeTokenContract.allowance(userAddress, assistant.address);
          console.log('🔍 Stake token allowance:', {
            allowance: stakeAllowance.toString(),
            required: amountWei.toString(),
            sufficient: stakeAllowance.gte(amountWei)
          });
          
          if (stakeAllowance.lt(amountWei)) {
            throw new Error(`Insufficient stake token allowance. Need to approve ${amountWei.toString()}, have ${stakeAllowance.toString()}`);
          }
    } else {
          console.log('🔍 Stake token is P3D (native), no approval needed');
        }
        
        // Check image token approval (IPrecompileERC20 interface)
        const imageTokenAddress = getImageTokenAddress(assistant);
        if (imageTokenAddress) {
          console.log('🔍 Image token is ERC20, checking allowance...');
          const imageTokenContract = new ethers.Contract(imageTokenAddress, IPRECOMPILE_ERC20_ABI, signer);
          const imageAllowance = await imageTokenContract.allowance(userAddress, assistant.address);
          console.log('🔍 Image token allowance:', {
            allowance: imageAllowance.toString(),
            required: imageAmountWei.toString(),
            sufficient: imageAllowance.gte(imageAmountWei)
          });
          
          if (imageAllowance.lt(imageAmountWei)) {
            throw new Error(`Insufficient image token allowance. Need to approve ${imageAmountWei.toString()}, have ${imageAllowance.toString()}`);
          }
        } else {
          console.log('🔍 No image token address found');
        }
        
        // Use exact gas strategy from test script
        console.log('🔍 Using exact test script gas strategy...');
        
        // Prepare transaction options matching test script exactly
        const txOptions = {
          gasLimit: 9000000,  // Exact same as test script
          value: 0 // No ETH value needed, tokens are transferred via transferFrom
        };
        
        console.log('🚀 Transaction options for ImportWrapper (test script strategy):', txOptions);
        
        // Debug: Log exact parameters being sent (like test script)
        console.log('🔍 Final transaction parameters:', {
          stakeAssetAmount: amountWei.toString(),
          imageAssetAmount: imageAmountWei.toString(),
          stakeTokenAddress,
          imageTokenAddress,
          assistantAddress: assistant.address,
          userAddress: await signer.getAddress(),
          gasLimit: txOptions.gasLimit,
          value: txOptions.value,
          stakeTokenDecimals,
          imageTokenDecimalsFromSettings,
          stakeTokenSymbol,
          imageTokenSymbol
        });
        
        // Debug: Check if we have the right token addresses
        console.log('🔍 Token address verification:', {
          stakeTokenAddress,
          imageTokenAddress,
          stakeTokenSymbol,
          imageTokenSymbol,
          assistantType: assistant.type,
          bridgeAddress: assistant.bridgeAddress
        });
        
        // Simulate the transaction first to catch revert reasons
        console.log('🔍 Simulating transaction to check for revert reasons...');
        try {
          await assistantContract.callStatic.buyShares(amountWei, imageAmountWei, txOptions);
          console.log('✅ Transaction simulation successful');
        } catch (simulationError) {
          console.error('❌ Transaction simulation failed:', simulationError);
          console.error('❌ Simulation error details:', {
            message: simulationError.message,
            reason: simulationError.reason,
            code: simulationError.code,
            data: simulationError.data
          });
          throw new Error(`Transaction would fail: ${simulationError.reason || simulationError.message}`);
        }
        
        tx = await assistantContract.buyShares(amountWei, imageAmountWei, txOptions);
        
        console.log('✅ ImportWrapperAssistant buyShares transaction created successfully');
        console.log('✅ Transaction object:', {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value?.toString(),
          gasLimit: tx.gasLimit?.toString(),
          gasPrice: tx.gasPrice?.toString()
        });
      } catch (contractError) {
        console.error('❌ ImportWrapperAssistant buyShares contract call failed:', contractError);
        console.error('❌ Error details:', {
          message: contractError.message,
          code: contractError.code,
          reason: contractError.reason,
          method: contractError.method,
          transaction: contractError.transaction
        });
        throw contractError;
      }
    } else if (assistant.type === 'import') {
      // ImportAssistant: buyShares(uint stake_asset_amount, uint image_asset_amount)
      // Note: Import assistants don't use batch precompile, they use regular ERC20 transfers
      if (!imageAmount) {
        toast.error('Please enter image asset amount for Import assistant');
        setLoading(false);
        return;
      }
      // Use consistent decimals from settings, not state variable
      const imageAmountWei = ethers.utils.parseUnits(imageAmount, imageTokenDecimalsFromSettings);
      console.log('🔍 ImportAssistant transaction details:', {
          amountWei: amountWei.toString(),
        imageAmountWei: imageAmountWei.toString(),
        value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0'
      });
      console.log('🔍 Calling buyShares with 2 parameters (stake, image)...');
      console.log('🔍 Contract method details:', {
        contractAddress: assistant.address,
        methodName: 'buyShares',
        params: [amountWei.toString(), imageAmountWei.toString()],
        value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0',
        hasSigner: !!signer,
        signerAddress: await signer.getAddress()
      });
      
      try {
        console.log('🚀 About to call buyShares on ImportAssistant...');
        console.log('🚀 Parameters:', {
          amountWei: amountWei.toString(),
          imageAmountWei: imageAmountWei.toString(),
          value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0'
        });
        
        // Use exact gas strategy from test script
        console.log('🔍 Using exact test script gas strategy...');
        
        // Prepare transaction options matching test script exactly
        const txOptions = {
          gasLimit: 9000000,  // Exact same as test script
          value: 0 // No ETH value needed, tokens are transferred via transferFrom
        };
        
        console.log('🚀 Transaction options for Import (test script strategy):', txOptions);
        
        // Simulate the transaction first to catch revert reasons
        console.log('🔍 Simulating Import transaction to check for revert reasons...');
        try {
          await assistantContract.callStatic.buyShares(amountWei, imageAmountWei, txOptions);
          console.log('✅ Import transaction simulation successful');
        } catch (simulationError) {
          console.error('❌ Import transaction simulation failed:', simulationError);
          console.error('❌ Simulation error details:', {
            message: simulationError.message,
            reason: simulationError.reason,
            code: simulationError.code,
            data: simulationError.data
          });
          throw new Error(`Import transaction would fail: ${simulationError.reason || simulationError.message}`);
        }
        
        tx = await assistantContract.buyShares(amountWei, imageAmountWei, txOptions);
        
        console.log('✅ ImportAssistant buyShares transaction created successfully');
        console.log('✅ Transaction object:', {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value?.toString(),
          gasLimit: tx.gasLimit?.toString(),
          gasPrice: tx.gasPrice?.toString()
        });
      } catch (contractError) {
        console.error('❌ ImportAssistant buyShares contract call failed:', contractError);
        console.error('❌ Error details:', {
          message: contractError.message,
          code: contractError.code,
          reason: contractError.reason,
          method: contractError.method,
          transaction: contractError.transaction
        });
        throw contractError;
      }
    } else if (assistant.type === 'export' || assistant.type === 'export_wrapper') {
      // ExportAssistant and ExportWrapperAssistant: buyShares(uint stake_asset_amount)
      console.log('🔍 ExportAssistant transaction details:', {
        amountWei: amountWei.toString(),
        value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0'
      });
      console.log('🔍 Calling buyShares with 1 parameter (stake only)...');
      console.log('🔍 Contract method details:', {
        contractAddress: assistant.address,
        methodName: 'buyShares',
        params: [amountWei.toString()],
        value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0',
        hasSigner: !!signer,
        signerAddress: await signer.getAddress()
      });
      
      try {
        console.log('🚀 About to call buyShares on ExportAssistant...');
        console.log('🚀 Parameters:', {
          amountWei: amountWei.toString(),
          value: isNativeToken(stakeTokenAddress) ? amountWei.toString() : '0'
        });
        
        // Use exact gas strategy from test script
        console.log('🔍 Using exact test script gas strategy...');
        
        // Prepare transaction options matching test script exactly
        const txOptions = {
          gasLimit: 9000000,  // Exact same as test script
          value: 0 // No ETH value needed, tokens are transferred via transferFrom
        };
        
        console.log('🚀 Transaction options for ExportWrapper (test script strategy):', txOptions);
        
        // Simulate the transaction first to catch revert reasons
        console.log('🔍 Simulating Export transaction to check for revert reasons...');
        try {
          await assistantContract.callStatic.buyShares(amountWei, txOptions);
          console.log('✅ Export transaction simulation successful');
        } catch (simulationError) {
          console.error('❌ Export transaction simulation failed:', simulationError);
          console.error('❌ Simulation error details:', {
            message: simulationError.message,
            reason: simulationError.reason,
            code: simulationError.code,
            data: simulationError.data
          });
          throw new Error(`Export transaction would fail: ${simulationError.reason || simulationError.message}`);
        }
        
        tx = await assistantContract.buyShares(amountWei, txOptions);
        
        console.log('✅ ExportAssistant buyShares transaction created successfully');
        console.log('✅ Transaction object:', {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value?.toString(),
          gasLimit: tx.gasLimit?.toString(),
          gasPrice: tx.gasPrice?.toString()
        });
      } catch (contractError) {
        console.error('❌ ExportAssistant buyShares contract call failed:', contractError);
        console.error('❌ Error details:', {
          message: contractError.message,
          code: contractError.code,
          reason: contractError.reason,
          method: contractError.method,
          transaction: contractError.transaction
        });
        throw contractError;
      }
    } else {
      throw new Error(`Unsupported assistant type: ${assistant.type}`);
      }

      console.log('✅ Transaction submitted successfully:', {
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value?.toString(),
        gasLimit: tx.gasLimit?.toString(),
        gasPrice: tx.gasPrice?.toString()
      });
      toast.success('Transaction submitted! Waiting for confirmation...');
    
    // Wait for transaction confirmation with extended timeout
    console.log('⏳ Waiting for transaction confirmation...');
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction timeout after 5 minutes')), 300000) // 5 minutes
      )
    ]);
    
    console.log('✅ Transaction confirmed!', receipt);
      toast.success('Deposit successful!');
      setStep('success');
      onSuccess();
    } catch (error) {
      console.error('Deposit error:', error);
      
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
        const errorMessage = error.reason || error.message || 'Deposit failed';
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMaxAmount = () => {
    setAmount(formatBalance(userBalance));
  };

  const handleMaxImageAmount = () => {
    setImageAmount(formatBalance(userImageBalance, imageTokenDecimals));
  };

  const renderStep = () => {
    // Check if wallet is not connected
    if (!account || !signer) {
      return (
        <div className="space-y-4">
          <div className="bg-warning-900/50 border border-warning-700 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-warning-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-warning-400 font-medium">Connect Your Wallet</h3>
                <p className="text-warning-300 text-sm mt-1">
                  Please connect your wallet to continue with the deposit.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Check if required network is not found
    if (!requiredNetwork) {
      return (
        <div className="space-y-4">
          <div className="bg-error-900/50 border border-error-700 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-error-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-error-400 font-medium">Network Configuration Error</h3>
                <p className="text-error-300 text-sm mt-1">
                  Could not find network configuration for this assistant's bridge address.
                </p>
                
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-error-300">Assistant Bridge Address:</span>
                    <span className="text-error-400 font-medium font-mono">{assistant.bridgeAddress}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-error-300">Assistant Type:</span>
                    <span className="text-error-400 font-medium">{assistant.type}</span>
                  </div>
                </div>
                
                <p className="text-error-300 text-xs mt-2">
                  Please check your network settings configuration. The bridge address may not be properly configured.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }


    switch (step) {
      case 'approve':
        return (
          <div className="space-y-4">
            <div className="bg-warning-900/50 border border-warning-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-warning-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-warning-400 font-medium">Approval Required</h3>
                  <p className="text-warning-300 text-sm mt-1">
                    You need to approve the assistant contract to spend your {stakeTokenSymbol} tokens before depositing.
                  </p>
                  
                  {!isCheckingApproval && (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-warning-300">Required amount:</span>
                          <span className="text-warning-400 font-medium whitespace-pre-line">{requiredAmount}</span>
                        </div>
                      </div>
                      <div className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-warning-300">Current allowance:</span>
                          <span className="text-warning-400 font-medium whitespace-pre-line">{currentAllowance}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  console.log('🔘 Approve button clicked!');
                  handleApprove();
                }}
                disabled={loading || isCheckingApproval || !amount}
                className="w-full bg-warning-600 hover:bg-warning-700 disabled:bg-dark-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-md text-sm font-medium transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Approving...</span>
                  </div>
                ) : isCheckingApproval ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Checking Approval Status...</span>
                  </div>
                ) : (
                  <span>
                    {assistant.type === 'import_wrapper' 
                      ? `Approve ${stakeTokenSymbol} and ${imageTokenSymbol}`
                      : `Approve ${stakeTokenSymbol}`
                    }
                  </span>
                )}
              </button>
            </div>
          </div>
        );

      case 'approved':
        return (
          <div className="space-y-4">
            <div className="bg-success-900/50 border border-success-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-success-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-success-400 font-medium">Approval Successful</h3>
                  <p className="text-success-300 text-sm mt-1">
                    Assistant contract is now approved to spend your {stakeTokenSymbol} tokens.
                  </p>
                  
                  <div className="mt-3 space-y-2">
                    <div className="text-sm">
                      <div className="flex justify-between">
                        <span className="text-success-300">Current allowance:</span>
                        <span className="text-success-400 font-medium whitespace-pre-line">{currentAllowance}</span>
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="flex justify-between">
                        <span className="text-success-300">Required for deposit:</span>
                        <span className="text-success-400 font-medium whitespace-pre-line">{requiredAmount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleDeposit}
              disabled={loading || !amount}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-md text-sm font-medium transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Processing Deposit...</span>
                </div>
              ) : (
                <span>Deposit {amount} {stakeTokenSymbol}</span>
              )}
            </button>
          </div>
        );

      case 'success':
        return (
          <div className="bg-success-900/50 border border-success-700 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-success-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-success-400 font-medium">Deposit Successful</h3>
                <p className="text-success-300 text-sm mt-1">
                  Your {amount} {stakeTokenSymbol} has been successfully deposited to the assistant.
                </p>
              </div>
            </div>
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
          <h3 className="text-lg font-semibold text-white">Deposit to {assistant.description || assistant.key}</h3>
          <button
            onClick={onClose}
            className="text-secondary-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Input Fields - Only show when not in success state */}
          {step !== 'success' && (
            <>
              {/* Stake Token Amount */}
              <div>
                <label className="block text-sm font-medium text-secondary-300 mb-2">
                  Stake Token Amount ({stakeTokenSymbol})
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
                  Balance: {formatBalance(userBalance)} {stakeTokenSymbol}
                </p>
              </div>

              {/* Image Token Amount (for Import and ImportWrapper assistants) */}
              {(assistant.type === 'import_wrapper' || assistant.type === 'import') && (
                <div>
                  <label className="block text-sm font-medium text-secondary-300 mb-2">
                    Foreign Token Amount ({imageTokenSymbol || 'wUSDT'})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={imageAmount}
                      onChange={(e) => setImageAmount(e.target.value)}
                      placeholder="0.0"
                      className="flex-1 bg-dark-700 border border-dark-600 rounded-md px-3 py-2 text-white placeholder-secondary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      onClick={handleMaxImageAmount}
                      className="px-3 py-2 bg-secondary-600 hover:bg-secondary-700 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      Max
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-secondary-500">
                      Balance: {formatBalance(userImageBalance, imageTokenDecimals)} {imageTokenSymbol || 'wUSDT'}
                    </p>
                    <button
                      onClick={() => {
                        console.log('🔄 Manual balance refresh triggered');
                        console.log('🔍 Current state before refresh:', {
                          imageTokenAddress,
                          imageTokenSymbol,
                          userImageBalance,
                          account,
                          assistantType: assistant.type,
                          bridgeAddress: assistant.bridgeAddress
                        });
                        loadUserBalances();
                      }}
                      className="text-xs text-primary-400 hover:text-primary-300 underline"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step Content */}
          {renderStep()}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
            >
              {step === 'success' ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Deposit;
