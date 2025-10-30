export const convertActualToDisplay = (actualAmount, decimals, tokenAddress, getTokenDecimalsDisplayMultiplier) => {
  try {
    if (!actualAmount || parseFloat(actualAmount) === 0) return '0';

    const num = parseFloat(actualAmount);

    if (tokenAddress) {
      const decimalsDisplayMultiplier = getTokenDecimalsDisplayMultiplier(tokenAddress);
      if (decimalsDisplayMultiplier) {
        const displayNumber = num * decimalsDisplayMultiplier;
        return displayNumber.toFixed(6).replace(/\.?0+$/, '') || '0';
      }
    }

    return actualAmount;
  } catch (error) {
    return '0';
  }
};

export const convertDisplayToActual = (displayAmount, decimals, tokenAddress, getTokenDecimalsDisplayMultiplier) => {
  try {
    if (!displayAmount || parseFloat(displayAmount) === 0) return '0';

    const num = parseFloat(displayAmount);

    if (tokenAddress) {
      const decimalsDisplayMultiplier = getTokenDecimalsDisplayMultiplier(tokenAddress);
      if (decimalsDisplayMultiplier) {
        const actualNumber = num / decimalsDisplayMultiplier;
        return actualNumber.toFixed(decimals);
      }
    }

    return displayAmount;
  } catch (error) {
    return '0';
  }
};
