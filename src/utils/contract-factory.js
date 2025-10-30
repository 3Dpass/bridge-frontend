import { ethers } from 'ethers';
import {
  EXPORT_ABI,
  IMPORT_ABI,
  IMPORT_WRAPPER_ABI,
  COUNTERSTAKE_ABI,
  ERC20_ABI,
  FACTORY_ABI,
  COUNTERSTAKE_FACTORY_ABI,
  ASSISTANT_FACTORY_ABI
} from '../contracts/abi';

/**
 * Get the Counterstake ABI
 * @returns {Array} COUNTERSTAKE_ABI
 */
export const getCounterstakeABI = () => {
  return COUNTERSTAKE_ABI;
};

/**
 * Get the appropriate ABI for a bridge type
 * @param {string} type - Bridge type (export, import, import_wrapper, counterstake)
 * @returns {Array} Contract ABI
 */
export const getBridgeABI = (type) => {
  switch (type) {
    case 'export':
      return EXPORT_ABI;
    case 'import':
      return IMPORT_ABI;
    case 'import_wrapper':
      return IMPORT_WRAPPER_ABI;
    case 'counterstake':
      return COUNTERSTAKE_ABI;
    default:
      throw new Error(`Unknown bridge type: ${type}`);
  }
};

/**
 * Create a contract instance with address validation
 * @param {string} address - Contract address
 * @param {Array} abi - Contract ABI
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Contract instance
 */
export const createContract = (address, abi, providerOrSigner) => {
  if (!address || !ethers.utils.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }

  return new ethers.Contract(address, abi, providerOrSigner);
};

/**
 * Create a bridge contract instance
 * @param {string} address - Bridge contract address
 * @param {string} type - Bridge type (export, import, import_wrapper)
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Bridge contract instance
 */
export const createBridgeContract = (address, type, providerOrSigner) => {
  const abi = getBridgeABI(type);
  return createContract(address, abi, providerOrSigner);
};

/**
 * Create a Counterstake contract instance
 * @param {string} address - Counterstake contract address
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Counterstake contract instance
 */
export const createCounterstakeContract = (address, providerOrSigner) => {
  return createContract(address, COUNTERSTAKE_ABI, providerOrSigner);
};

/**
 * Create an ERC20 token contract instance
 * @param {string} address - Token contract address
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Token contract instance
 */
export const createTokenContract = (address, providerOrSigner) => {
  return createContract(address, ERC20_ABI, providerOrSigner);
};

/**
 * Get the Factory ABI based on network type
 * @param {boolean} isHybridNetwork - Whether the network is hybrid (e.g., 3DPass)
 * @returns {Array} Factory ABI
 */
export const getFactoryABI = (isHybridNetwork) => {
  return isHybridNetwork ? COUNTERSTAKE_FACTORY_ABI : FACTORY_ABI;
};

/**
 * Get the Counterstake Factory ABI
 * @returns {Array} COUNTERSTAKE_FACTORY_ABI
 */
export const getCounterstakeFactoryABI = () => {
  return COUNTERSTAKE_FACTORY_ABI;
};

/**
 * Get the Assistant Factory ABI
 * @returns {Array} ASSISTANT_FACTORY_ABI
 */
export const getAssistantFactoryABI = () => {
  return ASSISTANT_FACTORY_ABI;
};

/**
 * Create a factory contract instance
 * @param {string} address - Factory contract address
 * @param {boolean} isHybridNetwork - Whether the network is hybrid (e.g., 3DPass)
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Factory contract instance
 */
export const createFactoryContract = (address, isHybridNetwork, providerOrSigner) => {
  const abi = getFactoryABI(isHybridNetwork);
  return createContract(address, abi, providerOrSigner);
};

/**
 * Create a counterstake factory contract instance
 * @param {string} address - Counterstake factory contract address
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Counterstake factory contract instance
 */
export const createCounterstakeFactoryContract = (address, providerOrSigner) => {
  return createContract(address, COUNTERSTAKE_FACTORY_ABI, providerOrSigner);
};

/**
 * Create an assistant factory contract instance
 * @param {string} address - Assistant factory contract address
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Assistant factory contract instance
 */
export const createAssistantFactoryContract = (address, providerOrSigner) => {
  return createContract(address, ASSISTANT_FACTORY_ABI, providerOrSigner);
};
