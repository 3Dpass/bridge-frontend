import { ethers } from 'ethers';
import {
  EXPORT_ABI,
  IMPORT_ABI,
  IMPORT_WRAPPER_ABI,
  ERC20_ABI
} from '../contracts/abi';

/**
 * Get the appropriate ABI for a bridge type
 * @param {string} type - Bridge type (export, import, import_wrapper)
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
 * Create an ERC20 token contract instance
 * @param {string} address - Token contract address
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @returns {ethers.Contract} Token contract instance
 */
export const createTokenContract = (address, providerOrSigner) => {
  return createContract(address, ERC20_ABI, providerOrSigner);
};
