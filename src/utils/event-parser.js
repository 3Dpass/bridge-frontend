import { normalizeAmount } from './data-normalizer';

/**
 * Parse NewExpatriation event args into named fields
 *
 * @param {Object} event - Event object with args array
 * @returns {Object} Parsed event data with named fields
 */
export const parseExpatriationEvent = (event) => {
  return {
    senderAddress: event.args[0] || 'Unknown',
    amount: normalizeAmount(event.args[1]),
    reward: normalizeAmount(event.args[2]),
    foreignAddress: event.args[3] || 'Unknown',
    data: event.args[4] || ''
  };
};

/**
 * Parse NewRepatriation event args into named fields
 *
 * @param {Object} event - Event object with args array
 * @returns {Object} Parsed event data with named fields
 */
export const parseRepatriationEvent = (event) => {
  return {
    senderAddress: event.args[0] || 'Unknown',
    amount: normalizeAmount(event.args[1]),
    reward: normalizeAmount(event.args[2]),
    homeAddress: event.args[3] || 'Unknown',
    data: event.args[4] || ''
  };
};

/**
 * Parse NewClaim event args into named fields
 * 
 * Handles decoded event args from ethers.js parseLog, where args are accessed by name
 * NewClaim event signature: NewClaim(uint indexed claim_num, address author_address, 
 *   string sender_address, address recipient_address, string txid, uint32 txts, 
 *   uint amount, int reward, uint stake, string data, uint32 expiry_ts)
 *
 * @param {Object} decodedArgs - Decoded event args object from ethers.js parseLog
 * @returns {Object} Parsed event data with normalized fields
 */
export const parseClaimEvent = (decodedArgs) => {
  return {
    claimNum: decodedArgs.claim_num,
    actualClaimNum: decodedArgs.claim_num,
    authorAddress: decodedArgs.author_address || 'Unknown',
    senderAddress: decodedArgs.sender_address || 'Unknown',
    recipientAddress: decodedArgs.recipient_address || 'Unknown',
    txid: decodedArgs.txid || '',
    txts: decodedArgs.txts ? Number(decodedArgs.txts) : 0,
    amount: normalizeAmount(decodedArgs.amount),
    reward: normalizeAmount(decodedArgs.reward),
    stake: normalizeAmount(decodedArgs.stake),
    data: decodedArgs.data || '',
    expiryTs: decodedArgs.expiry_ts ? Number(decodedArgs.expiry_ts) : 0,
    // Alias for consistency with other code
    claimant_address: decodedArgs.author_address || 'Unknown'
  };
};
