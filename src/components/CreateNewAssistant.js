import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { getNetworkWithSettings } from '../utils/settings';
import { NETWORKS } from '../config/networks';
import { ASSISTANT_FACTORY_ABI, EXPORT_ASSISTANT_ABI, IMPORT_ASSISTANT_ABI, IMPORT_WRAPPER_ASSISTANT_ABI, EXPORT_WRAPPER_ASSISTANT_ABI, IP3D_ABI, IPRECOMPILE_ERC20_ABI } from '../contracts/abi';
import { getProvider } from '../utils/provider-manager';
import { 
  Plus, 
  X, 
  AlertCircle, 
  CheckCircle, 
  Coins
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';

const CreateNewAssistant = ({ networkKey, onClose, onAssistantCreated }) => {
  const { signer, account } = useWeb3();
  const { settings, getBridgeInstancesWithSettings } = useSettings();
  const [isCreating, setIsCreating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [selectedBridge, setSelectedBridge] = useState('');
  const [assistantType, setAssistantType] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [assistantSymbol, setAssistantSymbol] = useState('');
  const [managementFee, setManagementFee] = useState('100'); // 1% default
  const [successFee, setSuccessFee] = useState('1000'); // 10% default
  const [swapFee, setSwapFee] = useState('10'); // 0.1% default
  const [exponent, setExponent] = useState('1');
  const [oracleAddress, setOracleAddress] = useState('');

  const [createdAssistantAddress, setCreatedAssistantAddress] = useState('');
  const [allowance, setAllowance] = useState('0');
  const [showApproveSection, setShowApproveSection] = useState(false);

  const networkConfig = NETWORKS[networkKey];
  const isHybridNetwork = networkConfig?.erc20Precompile;

  // Get factory address from settings or config
  const getFactoryAddress = () => {
    const settingsFactory = settings[networkKey]?.contracts?.assistantFactory;
    const configFactory = networkConfig?.contracts?.assistantFactory;
    return settingsFactory || configFactory;
  };


  // Get available oracles for this network
  const getAvailableOracles = useCallback(() => {
    const networkWithSettings = getNetworkWithSettings(networkKey);
    const oracles = networkWithSettings?.oracles || {};
    
    return Object.entries(oracles).map(([oracleKey, oracleConfig]) => ({
      key: oracleKey,
      address: oracleConfig.address,
      name: oracleConfig.name,
      description: oracleConfig.description
    }));
  }, [networkKey]);



  // Get available bridges for this network
  const getAvailableBridges = useCallback(() => {
    const allBridges = getBridgeInstancesWithSettings();
    const networkConfig = NETWORKS[networkKey];
    
    // Get default bridges from network config
    const defaultBridges = networkConfig.bridges ? Object.entries(networkConfig.bridges) : [];
    
    // Get custom bridges from settings
    const customBridges = Object.entries(allBridges).filter(([bridgeKey, bridgeConfig]) => {
      // For export bridges: show under home network
      if (bridgeConfig.type === 'export') {
        return bridgeConfig.homeNetwork === networkConfig.name;
      }
      // For import and import_wrapper bridges: show under foreign network
      if (bridgeConfig.type === 'import' || bridgeConfig.type === 'import_wrapper') {
        return bridgeConfig.foreignNetwork === networkConfig.name;
      }
      return false;
    });
    
    // Create a map to prioritize custom bridges over default bridges
    const bridgeMap = new Map();
    
    // Add default bridges first
    defaultBridges.forEach(([bridgeKey, bridgeConfig]) => {
      bridgeMap.set(bridgeKey, bridgeConfig);
    });
    
    // Override with custom bridges (settings have priority)
    customBridges.forEach(([bridgeKey, bridgeConfig]) => {
      bridgeMap.set(bridgeKey, bridgeConfig);
    });
    
    return Array.from(bridgeMap.entries()).map(([bridgeKey, bridgeConfig]) => ({
      key: bridgeKey,
      ...bridgeConfig
    }));
  }, [getBridgeInstancesWithSettings, networkKey]);

  // Get bridge details when selected
  const getSelectedBridgeDetails = useCallback(() => {
    if (!selectedBridge) return null;
    const bridges = getAvailableBridges();
    return bridges.find(bridge => bridge.address === selectedBridge);
  }, [selectedBridge, getAvailableBridges]);

  // Check if the selected bridge uses ERC20 precompile (not P3D)
  const isERC20PrecompileAssistant = useCallback(() => {
    if (!selectedBridge || !networkKey) return false;
    
    const networkWithSettings = getNetworkWithSettings(networkKey);
    
    // Get the bridge details to check its token address
    const bridgeDetails = getSelectedBridgeDetails();
    if (!bridgeDetails) return false;
    
    // For both import_wrapper and export_wrapper bridges, check the stakeTokenAddress
    // This is the token that the assistant will be staking with
    const stakeTokenAddress = bridgeDetails.stakeTokenAddress;
    
    if (!stakeTokenAddress) return false;
    
    // Get P3D precompile address - handle different network configurations
    let p3dPrecompileAddress;
    if (networkKey === 'THREEDPASS') {
      // For 3DPass network, use the P3D_PRECOMPILE_ADDRESS constant
      p3dPrecompileAddress = '0x0000000000000000000000000000000000000802';
    } else {
      // For other networks, try to get from network config
      p3dPrecompileAddress = networkWithSettings?.contracts?.nativeTokenPrecompile;
    }
    
    // Debug logging
    console.log('🔍 isERC20PrecompileAssistant check:');
    console.log('  - Network key:', networkKey);
    console.log('  - Bridge type:', bridgeDetails.type);
    console.log('  - Stake token address:', stakeTokenAddress);
    console.log('  - P3D precompile address:', p3dPrecompileAddress);
    console.log('  - Is ERC20 precompile (needs approval):', stakeTokenAddress.toLowerCase() !== p3dPrecompileAddress?.toLowerCase());
    
    // If the stake token address is NOT the P3D precompile, it's an ERC20 precompile that needs approval
    return stakeTokenAddress.toLowerCase() !== p3dPrecompileAddress?.toLowerCase();
  }, [selectedBridge, networkKey, getSelectedBridgeDetails]);

  // Get token symbols for the selected bridge
  const getTokenSymbols = useCallback(() => {
    const bridgeDetails = getSelectedBridgeDetails();
    const networkWithSettings = getNetworkWithSettings(networkKey);
    
    if (!bridgeDetails || !networkWithSettings) {
      return { nativeSymbol: 'Native', stakeSymbol: 'Stake' };
    }
    
    const nativeSymbol = networkWithSettings.nativeCurrency?.symbol || 'Native';
    const stakeSymbol = bridgeDetails.stakeTokenSymbol || 'Stake';
    
    return { nativeSymbol, stakeSymbol };
  }, [networkKey, getSelectedBridgeDetails]);

  // Generate assistant name and symbol based on bridge
  useEffect(() => {
    const bridgeDetails = getSelectedBridgeDetails();
    if (bridgeDetails && assistantType) {
      const tokenSymbol = bridgeDetails.homeTokenSymbol;
      
      if (assistantType === 'export' || assistantType === 'export_wrapper') {
        setAssistantName(`${tokenSymbol} export assistant`);
        setAssistantSymbol(`${tokenSymbol}EA`);
      } else if (assistantType === 'import' || assistantType === 'import_wrapper') {
        setAssistantName(`${tokenSymbol} import assistant`);
        setAssistantSymbol(`${tokenSymbol}IA`);
      }
    }
  }, [selectedBridge, assistantType, getSelectedBridgeDetails]);



  // Determine assistant type based on bridge type and network
  useEffect(() => {
    const bridgeDetails = getSelectedBridgeDetails();
    if (bridgeDetails) {
      if (isHybridNetwork) {
        // For hybrid networks (like 3DPass), use wrapper types
        if (bridgeDetails.type === 'export') {
          setAssistantType('export_wrapper');
        } else if (bridgeDetails.type === 'import_wrapper') {
          setAssistantType('import_wrapper');
        }
      } else {
        // For regular EVM networks, use regular types
        if (bridgeDetails.type === 'export') {
          setAssistantType('export');
        } else if (bridgeDetails.type === 'import') {
          setAssistantType('import');
        }
      }
    }
  }, [selectedBridge, isHybridNetwork, getSelectedBridgeDetails]);

  // Check allowance for wrapper assistants
  const checkAllowance = async () => {
    if (!createdAssistantAddress || !assistantType.includes('wrapper')) return;
    
    try {
      const provider = getProvider(networkKey);
      const bridgeDetails = getSelectedBridgeDetails();
      
      if (!bridgeDetails) {
        console.log('🔍 Bridge details not available yet, skipping allowance check');
        return;
      }
      
      // Get the stake token address from bridge details
      const stakeTokenAddress = bridgeDetails.stakeTokenAddress;
      
      if (!stakeTokenAddress) {
        console.log('🔍 No stake token address found, skipping allowance check');
        return;
      }
      
      // Get the appropriate ABI based on token type
      let precompileABI;
      if (stakeTokenAddress.toLowerCase() === getNetworkWithSettings(networkKey)?.contracts?.nativeTokenPrecompile?.toLowerCase()) {
        // P3D precompile
        precompileABI = IP3D_ABI;
      } else {
        // ERC20 precompile
        precompileABI = IPRECOMPILE_ERC20_ABI;
      }
      
      // Create precompile contract instance
      const precompileContract = new ethers.Contract(stakeTokenAddress, precompileABI, provider);
      
      // Check allowance from assistant to bridge
      const allowanceAmount = await precompileContract.allowance(createdAssistantAddress, bridgeDetails.address);
      setAllowance(ethers.utils.formatEther(allowanceAmount));
      
      console.log('🔍 Allowance check:');
      console.log('  - Stake token address:', stakeTokenAddress);
      console.log('  - Assistant address:', createdAssistantAddress);
      console.log('  - Bridge address:', bridgeDetails.address);
      console.log('  - Allowance amount:', allowanceAmount.toString());
      console.log('  - Formatted allowance:', ethers.utils.formatEther(allowanceAmount));
      
    } catch (error) {
      console.error('Error checking allowance:', error);
      // Don't show toast for allowance check errors as they're not critical
      // Just log them for debugging purposes
    }
  };

  // Create assistant contract
  const handleCreateAssistant = async () => {
    if (!signer || !account) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!selectedBridge || !assistantType || !assistantName || !assistantSymbol) {
      toast.error('Please fill in all required fields');
      return;
    }

    const factoryAddress = getFactoryAddress();
    if (!factoryAddress) {
      toast.error('Assistant factory address not found');
      return;
    }

    setIsCreating(true);
    try {
      const factoryContract = new ethers.Contract(factoryAddress, ASSISTANT_FACTORY_ABI, signer);
      const bridgeDetails = getSelectedBridgeDetails();
      
      let tx;
      
      if (assistantType === 'export' || assistantType === 'export_wrapper') {
        // Create export assistant
        tx = await factoryContract.createExportAssistant(
          bridgeDetails.address, // bridge address
          account, // manager address
          parseInt(managementFee), // management_fee10000
          parseInt(successFee), // success_fee10000
          oracleAddress, // oracle address (user provided)
          parseInt(exponent), // exponent
          assistantName, // name
          assistantSymbol, // symbol
          { gasLimit: 3000000 }
        );
      } else if (assistantType === 'import') {
        // Create regular import assistant
        tx = await factoryContract.createImportAssistant(
          bridgeDetails.address, // bridge address
          account, // manager address
          parseInt(managementFee), // management_fee10000
          parseInt(successFee), // success_fee10000
          parseInt(swapFee), // swap_fee10000
          parseInt(exponent), // exponent
          assistantName, // name
          assistantSymbol, // symbol
          { gasLimit: 3000000 }
        );
      } else if (assistantType === 'import_wrapper') {
        // Create import wrapper assistant
        tx = await factoryContract.createImportWrapperAssistant(
          bridgeDetails.address, // bridge address
          account, // manager address
          parseInt(managementFee), // management_fee10000
          parseInt(successFee), // success_fee10000
          parseInt(swapFee), // swap_fee10000
          parseInt(exponent), // exponent
          assistantName, // name
          assistantSymbol, // symbol
          { gasLimit: 3000000 }
        );
      }

      toast.loading('Creating assistant contract...');
      const receipt = await tx.wait();
      
      // Find the assistant address from events
      let assistantAddress;
      if (assistantType === 'export' || assistantType === 'export_wrapper') {
        const event = receipt.events.find(e => e.event === 'NewExportAssistant');
        assistantAddress = event.args.contractAddress;
      } else if (assistantType === 'import') {
        const event = receipt.events.find(e => e.event === 'NewImportAssistant');
        assistantAddress = event.args.contractAddress;
      } else if (assistantType === 'import_wrapper') {
        const event = receipt.events.find(e => e.event === 'NewImportWrapperAssistant');
        assistantAddress = event.args.contractAddress;
      }

      setCreatedAssistantAddress(assistantAddress);
      
      if (assistantType.includes('wrapper')) {
        setShowApproveSection(true);
        await checkAllowance();
      }
      
      toast.success(`Assistant created successfully: ${assistantAddress}`);
      
      if (onAssistantCreated) {
        onAssistantCreated(assistantAddress, {
          address: assistantAddress,
          type: assistantType,
          bridgeAddress: bridgeDetails.address,
          managerAddress: account,
          description: assistantName,
          shareSymbol: assistantSymbol,
          shareName: assistantName,
          upToDate: true
        });
      }
      
    } catch (error) {
      console.error('Error creating assistant:', error);
      
      // Handle different types of errors gracefully
      if (error.code === 'ACTION_REJECTED' || error.message?.includes('user rejected')) {
        toast.error('Transaction was cancelled by user');
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error('Insufficient funds to pay for gas fees');
      } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
        toast.error('Gas estimation failed. Please try again or increase gas limit');
      } else if (error.message?.includes('execution reverted')) {
        // Extract revert reason if available
        const revertReason = error.message.match(/execution reverted: (.+)/)?.[1] || 'Transaction failed';
        toast.error(`Transaction failed: ${revertReason}`);
      } else if (error.message?.includes('network')) {
        toast.error('Network error. Please check your connection and try again');
      } else {
        // Generic error message for other cases
        toast.error(`Failed to create assistant: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Approve precompile for wrapper assistants
  const handleApprovePrecompile = async () => {
    if (!signer || !createdAssistantAddress) {
      toast.error('No assistant created yet');
      return;
    }

    setIsApproving(true);
    try {
      let abi;
      if (assistantType === 'export_wrapper') {
        abi = EXPORT_WRAPPER_ASSISTANT_ABI;
      } else if (assistantType === 'import_wrapper') {
        abi = IMPORT_WRAPPER_ASSISTANT_ABI;
      } else {
        abi = assistantType === 'export' ? EXPORT_ASSISTANT_ABI : IMPORT_ASSISTANT_ABI;
      }
      
      const assistantContract = new ethers.Contract(createdAssistantAddress, abi, signer);
      
      // Check if this assistant needs precompile approval
      // Only ERC20 precompile assistants need approval (not P3D precompile)
      const tokenAddress = await assistantContract.tokenAddress();
      
      // Get P3D precompile address from network config
      const networkWithSettings = getNetworkWithSettings(networkKey);
      let p3dPrecompileAddress;
      if (networkKey === 'THREEDPASS') {
        p3dPrecompileAddress = '0x0000000000000000000000000000000000000802';
      } else {
        p3dPrecompileAddress = networkWithSettings?.contracts?.nativeTokenPrecompile;
      }
      
      console.log('🔍 handleApprovePrecompile check:');
      console.log('  - Assistant token address:', tokenAddress);
      console.log('  - P3D precompile address:', p3dPrecompileAddress);
      console.log('  - Is P3D precompile:', tokenAddress.toLowerCase() === p3dPrecompileAddress?.toLowerCase());
      console.log('  - Network key:', networkKey);
      
      if (tokenAddress.toLowerCase() === p3dPrecompileAddress?.toLowerCase()) {
        // This is a P3D precompile assistant - no approval needed
        toast.success('P3D precompile assistant - no approval needed');
        await checkAllowance();
        return;
      }
      
      // This is an ERC20 precompile assistant - approval needed
      // Use different gas limits based on assistant type (matching test scripts)
      const gasLimit = assistantType === 'export_wrapper' ? 2000000 : 2000000;
      
      // Debug: Check if we're the manager
      const managerAddress = await assistantContract.managerAddress();
      const currentAccount = await signer.getAddress();
      console.log('🔍 Approve precompile debug:');
      console.log('  - Assistant address:', createdAssistantAddress);
      console.log('  - Manager address:', managerAddress);
      console.log('  - Current account:', currentAccount);
      console.log('  - Is manager:', managerAddress.toLowerCase() === currentAccount.toLowerCase());
      console.log('  - Gas limit:', gasLimit);
      
      const tx = await assistantContract.approvePrecompile({ gasLimit });
      
      toast.loading('Approving precompile...');
      await tx.wait();
      
      await checkAllowance();
      toast.success('Precompile approved successfully');
      
    } catch (error) {
      console.error('Error approving precompile:', error);
      
      // Handle different types of errors gracefully
      if (error.code === 'ACTION_REJECTED' || error.message?.includes('user rejected')) {
        toast.error('Approval transaction was cancelled by user');
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error('Insufficient funds to pay for gas fees');
      } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
        toast.error('Gas estimation failed. Please try again or increase gas limit');
      } else if (error.message?.includes('execution reverted')) {
        // Extract revert reason if available
        const revertReason = error.message.match(/execution reverted: (.+)/)?.[1] || 'Transaction failed';
        toast.error(`Approval failed: ${revertReason}`);
      } else if (error.message?.includes('network')) {
        toast.error('Network error. Please check your connection and try again');
      } else {
        // Generic error message for other cases
        toast.error(`Failed to approve precompile: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsApproving(false);
    }
  };

  const availableBridges = getAvailableBridges();
  
  // Debug logging
  console.log('🔍 CreateNewAssistant - Network:', networkKey);
  console.log('🔍 CreateNewAssistant - All bridges:', getBridgeInstancesWithSettings());
  console.log('🔍 CreateNewAssistant - Available bridges:', availableBridges);
  console.log('🔍 CreateNewAssistant - Available oracles:', getAvailableOracles());

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-start justify-center p-2 sm:p-4 pt-4 sm:pt-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-dark-900 border border-secondary-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-secondary-800">
            <div className="flex items-center gap-3">
              <Plus className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-white">Create New Pool-Assistant</h2>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(96vh-8rem)] sm:max-h-[calc(96vh-10rem)]">
            <div className="space-y-6">
              {/* Network Info */}
              <div className="flex items-center gap-3 p-3 bg-dark-800 rounded border border-secondary-700">
                <Coins className="w-5 h-5 text-primary-500" />
                <div>
                  <h3 className="text-white font-medium">{networkConfig.name}</h3>
                  <p className="text-secondary-400 text-sm">
                    {isHybridNetwork ? 'Hybrid Network' : 'Regular EVM Network'}
                  </p>
                </div>
              </div>

              {/* Bridge Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-secondary-300">
                  Select Bridge *
                </label>
                <select
                  value={selectedBridge}
                  onChange={(e) => setSelectedBridge(e.target.value)}
                  className="w-full input-field"
                >
                  <option value="">Choose a bridge...</option>
                  {availableBridges.map((bridge) => (
                    <option key={bridge.address} value={bridge.address}>
                      {bridge.description || `${bridge.homeTokenSymbol} ${bridge.type} Bridge`}
                    </option>
                  ))}
                </select>
                {availableBridges.length === 0 && (
                  <p className="text-warning-500 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    No bridges available for this network
                  </p>
                )}
              </div>

              {/* Assistant Type (Auto-determined) */}
              {assistantType && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-secondary-300">
                    Assistant Type
                  </label>
                  <div className="p-3 bg-dark-800 rounded border border-secondary-700">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      assistantType.includes('import') 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-green-600 text-white'
                    }`}>
                      {assistantType.replace('_', ' ')}
                    </span>
                    <p className="text-secondary-400 text-xs mt-1">
                      {assistantType.includes('wrapper') 
                        ? 'Wrapper assistant to deal with cross-platform ERC20 precompile tokens'
                        : 'Regular assistant to deal with standard ERC20 tokens'
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Assistant Details */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Assistant Shares Name *
                    </label>
                    <input
                      type="text"
                      value={assistantName}
                      onChange={(e) => setAssistantName(e.target.value)}
                      placeholder="e.g., USDT import assistant"
                      className="w-full input-field text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Assistant Shares Symbol *
                    </label>
                    <input
                      type="text"
                      value={assistantSymbol}
                      onChange={(e) => setAssistantSymbol(e.target.value)}
                      placeholder="e.g., USDTIA"
                      className="w-full input-field text-sm"
                    />
                  </div>
                </div>

                {/* Fee Configuration */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Management Fee
                    </label>
                    <input
                      type="number"
                      value={managementFee}
                      onChange={(e) => setManagementFee(e.target.value)}
                      placeholder="100"
                      className="w-full input-field text-sm"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      {(parseInt(managementFee) / 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Success Fee
                    </label>
                    <input
                      type="number"
                      value={successFee}
                      onChange={(e) => setSuccessFee(e.target.value)}
                      placeholder="1000"
                      className="w-full input-field text-sm"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      {(parseInt(successFee) / 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Swap Fee
                    </label>
                    <input
                      type="number"
                      value={swapFee}
                      onChange={(e) => setSwapFee(e.target.value)}
                      placeholder="10"
                      className="w-full input-field text-sm"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      {(parseInt(swapFee) / 100).toFixed(2)}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Exponent
                    </label>
                    <input
                      type="number"
                      value={exponent}
                      onChange={(e) => setExponent(e.target.value)}
                      placeholder="1"
                      className="w-full input-field text-sm"
                    />
                  </div>
                </div>

                {/* Oracle Selection - Only for Export Assistants */}
                {(assistantType === 'export' || assistantType === 'export_wrapper') && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-secondary-300">
                      Select Oracle *
                    </label>
                    <select
                      value={oracleAddress}
                      onChange={(e) => setOracleAddress(e.target.value)}
                      className="w-full input-field text-sm"
                    >
                      <option value="">Choose an oracle...</option>
                      {getAvailableOracles().map((oracle) => (
                        <option key={oracle.key} value={oracle.address}>
                          {oracle.name} ({oracle.address.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                    {oracleAddress && (
                      <p className="text-secondary-400 text-xs mt-1">
                        Selected: {getAvailableOracles().find(o => o.address === oracleAddress)?.description || oracleAddress}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Create Button - Hide when assistant is created */}
              {!createdAssistantAddress && (
                <button
                  onClick={handleCreateAssistant}
                  disabled={
                    isCreating || 
                    !selectedBridge || 
                    !assistantType || 
                    !assistantName || 
                    !assistantSymbol ||
                    ((assistantType === 'export' || assistantType === 'export_wrapper') && !oracleAddress)
                  }
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating Assistant...
                    </>
                  ) : (
                    'Create Assistant'
                  )}
                </button>
              )}

              {/* Created Assistant Info */}
              {createdAssistantAddress && (
                <div className="p-3 bg-green-900/20 border border-green-700 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-400 font-medium">Assistant Created Successfully</span>
                  </div>
                  <div className="text-sm text-secondary-300">
                    <div>Address: {createdAssistantAddress}</div>
                    <div>Type: {assistantType}</div>
                    <div>Manager: {account}</div>
                  </div>
                </div>
              )}

              {/* Approve Section for Wrapper Assistants - Only for ERC20 Precompile */}
              {(() => {
                const shouldShow = showApproveSection && assistantType.includes('wrapper') && selectedBridge && isERC20PrecompileAssistant();
                console.log('🔍 Approval section visibility check:');
                console.log('  - showApproveSection:', showApproveSection);
                console.log('  - assistantType includes wrapper:', assistantType.includes('wrapper'));
                console.log('  - selectedBridge:', !!selectedBridge);
                console.log('  - isERC20PrecompileAssistant():', isERC20PrecompileAssistant());
                console.log('  - Should show approval section:', shouldShow);
                return shouldShow;
              })() && (
                parseFloat(allowance) > 0 ? (
                  <div className="p-3 bg-green-900/20 border border-green-700 rounded">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-400 font-medium">Approved Successfully</span>
                    </div>
                    <p className="text-sm text-secondary-300 mt-1">
                      The bridge can now spend {allowance} {getTokenSymbols().stakeSymbol} from the assistant.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-900/20 border border-blue-700 rounded">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-blue-500" />
                      <span className="text-blue-400 font-medium">Additional Step Required</span>
                    </div>
                    <p className="text-sm text-secondary-300 mb-3">
                      Fund the assistant with both {getTokenSymbols().nativeSymbol} and {getTokenSymbols().stakeSymbol} tokens. 
                      Then approve the bridge to spend tokens from the assistant.
                    </p>
                    
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-secondary-400">Current Allowance:</span>
                      <span className="text-sm text-white">{allowance} {getTokenSymbols().stakeSymbol}</span>
                    </div>
                    
                    <button
                      onClick={handleApprovePrecompile}
                      disabled={isApproving}
                      className="w-full btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isApproving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Approving...
                        </>
                      ) : (
                        'Approve'
                      )}
                    </button>
                  </div>
                )
              )}

            </div>
          </div>
          
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreateNewAssistant;
