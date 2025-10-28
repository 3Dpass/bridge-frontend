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
