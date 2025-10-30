/**
 * Normalize amount values from various formats to string
 *
 * Handles BigNumber objects, plain numbers, strings, and objects with hex properties.
 * This is especially useful for handling event args from smart contracts which can be
 * in various formats depending on how they were serialized/deserialized.
 *
 * @param {*} amount - Amount to normalize (BigNumber, string, number, or object)
 * @returns {string} Normalized amount as string, or '0' if invalid
 */
export const normalizeAmount = (amount) => {
  // Handle BigNumber objects (including deserialized ones from cache)
  if (typeof amount?.toNumber === 'function') {
    return amount.toString();
  } else if (typeof amount === 'string') {
    return amount;
  } else if (typeof amount === 'number') {
    return amount.toString();
  } else if (typeof amount === 'object' && amount !== null) {
    // Handle deserialized BigNumber objects from cache
    // They might have properties like _hex, _isBigNumber, or be plain objects with hex values
    if (amount._hex) {
      return amount._hex;
    } else if (amount.hex) {
      return amount.hex;
    } else if (amount.toString && typeof amount.toString === 'function') {
      const stringValue = amount.toString();
      // Avoid default "[object Object]" from Object.prototype.toString
      if (stringValue === '[object Object]') {
        return '0';
      }
      return stringValue;
    } else {
      return '0';
    }
  } else if (!amount) {
    return '0';
  } else {
    return '0';
  }
};
