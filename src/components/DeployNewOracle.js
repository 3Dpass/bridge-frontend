import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useWeb3 } from '../contexts/Web3Context';
import { NETWORKS } from '../config/networks';
import { 
  X, 
  CheckCircle, 
  Coins,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';
import { handleTransactionError } from '../utils/error-handler';

// Oracle contract ABI (complete ABI for deployment and interaction)
const ORACLE_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "name": "prices",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "num",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "den",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "base",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "quote",
        "type": "string"
      }
    ],
    "name": "getPrice",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "num",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "den",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "base",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "quote",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "num",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "den",
        "type": "uint256"
      }
    ],
    "name": "setPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Oracle contract bytecode (from the compiled contract)
const ORACLE_BYTECODE = "0x6080806040523461005b5760008054336001600160a01b0319821681178355916001600160a01b03909116907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09084a361062e90816100618239f35b600080fdfe60806040526004361015610013575b600080fd5b6000803560e01c9081633d0f34da146101885781633edcd46c1461008557508063402b44301461007c578063715018a6146100735780638da5cb5b1461006a5763f2fde38b1461006257600080fd5b61000e610405565b5061000e6103db565b5061000e61038e565b5061000e610341565b34610185576080366003190112610185576001600160401b03600435818111610181576100b6903690600401610222565b90602435908111610181576100cf903690600401610222565b60443590606435926100df610497565b6101006040516020816100f281876102cc565b600181520301902082610324565b80541590811591610173575b5061014e57906101326101389261014995610125610213565b9586526020860152610307565b90610324565b906020600191805184550151910155565b604051f35b61013261013892610149959460405195610167876101c8565b86526020860152610307565b60019150015415158661010c565b8280fd5b80fd5b346101855761019f61019936610286565b90610529565b60408051928352602083019190915290f35b50634e487b7160e01b600052604160045260246000fd5b604081019081106001600160401b038211176101e357604052565b6101eb6101b1565b604052565b601f909101601f19168101906001600160401b038211908210176101e357604052565b60405190610220826101c8565b565b81601f8201121561000e578035906001600160401b038211610279575b60405192610257601f8401601f1916602001856101f0565b8284526020838301011161000e57816000926020809301838601378301015290565b6102816101b1565b61023f565b90604060031983011261000e576001600160401b0360043581811161000e57836102b291600401610222565b9260243591821161000e576102c991600401610222565b90565b90815180926000905b8282106102f05750116102e6570190565b6000828201520190565b9150806020809284010151818501520183916102d5565b602061031991604051928380926102cc565b600181520301902090565b60209061033792604051938480936102cc565b9081520301902090565b503461000e57610374602061036661035836610286565b9290604051928380926102cc565b600181520301902090610324565b805460019091015460408051928352602083019190915290f35b503461000e57600080600319360112610185576103a9610497565b80546001600160a01b0319811682556040519082906001600160a01b03166000805160206105d98339815191528284a3f35b503461000e57600036600319011261000e576000546040516001600160a01b039091168152602090f35b503461000e57602036600319011261000e576004356001600160a01b03811680820361000e57610433610497565b1561044357610441906104ef565b005b60405162461bcd60e51b815260206004820152602660248201527f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160448201526564647265737360d01b6064820152608490fd5b6000546001600160a01b031633036104ab57565b606460405162461bcd60e51b815260206004820152602060248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e65726044820152fd5b600080546001600160a01b039283166001600160a01b03198216811783556040519093909116916000805160206105d983398151915291a3565b919091604051602081018161053e82856102cc565b0391610552601f19938481018352826101f0565b5190209060405161057860208201928261056c858a6102cc565b039081018352826101f0565b519020146105cf5761059261058c82610307565b84610324565b805490816105c35750506101326105a99293610307565b90815491826105bb5750600091508190565b600101549190565b90935060019150015490565b5060019150819056fe8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0a264697066735822122084ec2d7c373070993b8cc584cd56a7f0fcd88ab90eaa43c018788e1ed2753e3e64736f6c634300080d0033";

const DeployNewOracle = ({ networkKey, onClose, onOracleCreated }) => {
  const { signer, account } = useWeb3();
  const [isDeploying, setIsDeploying] = useState(false);
  const [oracleName, setOracleName] = useState('');
  const [oracleKey, setOracleKey] = useState('');
  const [oracleDescription, setOracleDescription] = useState('');
  const [deployedOracleAddress, setDeployedOracleAddress] = useState('');

  const networkConfig = NETWORKS[networkKey];

  // Auto-generate oracle key based on name
  useEffect(() => {
    if (oracleName && !oracleKey) {
      const generatedKey = oracleName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      setOracleKey(generatedKey);
    }
  }, [oracleName, oracleKey]);

  // Deploy oracle contract
  const handleDeployOracle = async () => {
    if (!signer || !account) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!oracleName.trim() || !oracleKey.trim()) {
      toast.error('Please fill in oracle name and key');
      return;
    }

    setIsDeploying(true);
    try {
      console.log('=== Oracle Deployment Parameters ===');
      console.log('Network:', networkKey);
      console.log('Account:', account);
      console.log('Oracle Name:', oracleName);
      console.log('Oracle Key:', oracleKey);
      
      // Create contract factory
      const OracleFactory = new ethers.ContractFactory(ORACLE_ABI, ORACLE_BYTECODE, signer);
      
      toast.loading('Deploying oracle contract...');
      
      // Deploy the contract (no constructor parameters needed)
      const oracleContract = await OracleFactory.deploy();
      
      console.log('Oracle deployment transaction sent:', oracleContract.deployTransaction.hash);
      
      // Wait for deployment confirmation
      const receipt = await oracleContract.deployTransaction.wait();
      console.log('Oracle deployment confirmed:', receipt.transactionHash);
      
      // Check if deployment failed
      if (receipt.status === 0) {
        throw new Error('Oracle deployment failed during execution');
      }
      
      const oracleAddress = oracleContract.address;
      setDeployedOracleAddress(oracleAddress);
      
      toast.success(`Oracle deployed successfully: ${oracleAddress}`);
      
      if (onOracleCreated) {
        const oracleConfig = {
          address: oracleAddress,
          name: oracleName.trim(),
          description: oracleDescription.trim() || `Deployed oracle for ${networkConfig.name}`,
          deployedBy: account,
          deployedAt: Date.now()
        };

        onOracleCreated(oracleKey.trim(), oracleConfig);
      }
      
    } catch (error) {
      toast.dismiss();
      handleTransactionError(error, {
        messagePrefix: 'Failed to deploy oracle: '
      });
    } finally {
      setIsDeploying(false);
    }
  };

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
              <Database className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-white">Deploy New Oracle</h2>
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
                    Deploying oracle contract on this network
                  </p>
                </div>
              </div>

              {/* Oracle Configuration */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Oracle Configuration</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Oracle Name *
                    </label>
                    <input
                      type="text"
                      value={oracleName}
                      onChange={(e) => setOracleName(e.target.value)}
                      placeholder="e.g., Main Oracle, Backup Oracle"
                      className="w-full input-field"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      A descriptive name for your oracle
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Oracle Key *
                    </label>
                    <input
                      type="text"
                      value={oracleKey}
                      onChange={(e) => setOracleKey(e.target.value)}
                      placeholder="e.g., main_oracle, backup_oracle"
                      className="w-full input-field"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      Unique identifier for this oracle (auto-generated from name)
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-secondary-300">
                      Description
                    </label>
                    <textarea
                      value={oracleDescription}
                      onChange={(e) => setOracleDescription(e.target.value)}
                      placeholder="Optional description of this oracle's purpose..."
                      rows={3}
                      className="w-full input-field resize-none"
                    />
                    <p className="text-secondary-400 text-xs mt-1">
                      Optional description for documentation purposes
                    </p>
                  </div>
                </div>
              </div>

              {/* Oracle Features */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Oracle Features</h3>
                
                <div className="p-4 bg-dark-800 rounded border border-secondary-700">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">Price Feed Management</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">Owner-Controlled Updates</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">Bidirectional Price Queries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">OpenZeppelin Ownable</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deploy Button */}
              {!deployedOracleAddress && (
                <button
                  onClick={handleDeployOracle}
                  disabled={
                    isDeploying || 
                    !oracleName.trim() || 
                    !oracleKey.trim()
                  }
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeploying ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Deploying Oracle...
                    </>
                  ) : (
                    'Deploy Oracle'
                  )}
                </button>
              )}

              {/* Deployed Oracle Info */}
              {deployedOracleAddress && (
                <div className="p-3 bg-green-900/20 border border-green-700 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-400 font-medium">Oracle Deployed Successfully</span>
                  </div>
                  <div className="text-sm text-secondary-300 space-y-1">
                    <div>Address: {deployedOracleAddress}</div>
                    <div>Name: {oracleName}</div>
                    <div>Key: {oracleKey}</div>
                    <div>Network: {networkConfig.name}</div>
                    <div>Owner: {account}</div>
                  </div>
                </div>
              )}

              {/* Help Text */}
              <div className="p-3 bg-blue-900/20 border border-blue-700 rounded">
                <h4 className="text-blue-400 font-medium mb-2">💡 Oracle Usage</h4>
                <div className="text-sm text-secondary-300 space-y-1">
                  <p>• After deployment, you'll be the owner and can set price feeds</p>
                  <p>• Use the <code className="bg-dark-700 px-1 rounded">setPrice(base, quote, num, den)</code> function to update prices</p>
                  <p>• Bridges will query prices using <code className="bg-dark-700 px-1 rounded">getPrice(base, quote)</code></p>
                  <p>• Prices are stored as fractions (numerator/denominator) for precision</p>
                  <p>• You can transfer ownership to another address if needed</p>
                </div>
              </div>

            </div>
          </div>
          
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

DeployNewOracle.propTypes = {
  networkKey: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onOracleCreated: PropTypes.func
};

export default DeployNewOracle;
