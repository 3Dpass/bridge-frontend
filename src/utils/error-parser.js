export const parseTransactionError = (error) => {
  if (!error) {
    return {
      type: 'unknown',
      title: 'Operation Failed',
      message: '',
      canRetry: true,
      isUserError: false
    };
  }

  const errorMessage = error.message || error.toString();

  if (errorMessage.includes('user rejected') ||
      errorMessage.includes('ACTION_REJECTED') ||
      errorMessage.includes('User denied') ||
      errorMessage.includes('cancelled') ||
      error.code === 'ACTION_REJECTED') {
    return {
      type: 'user_rejection',
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction. No changes were made.',
      canRetry: true,
      isUserError: true
    };
  }

  if (errorMessage.includes('transaction was replaced') ||
      error.code === 'TRANSACTION_REPLACED') {
    return {
      type: 'transaction_replaced',
      title: 'Transaction Repriced',
      message: 'Your wallet automatically adjusted the gas price for faster confirmation. The transaction was successful.',
      canRetry: false,
      isUserError: false,
      isSuccess: true
    };
  }

  if (errorMessage.includes('Transaction does not have a transaction hash') ||
      errorMessage.includes('there was a problem') ||
      error.code === -32603) {
    return {
      type: 'transaction_hash_error',
      title: 'Transaction Submission Failed',
      message: 'The transaction could not be submitted properly. This often happens with allowance increases.',
      canRetry: true,
      isUserError: false
    };
  }

  if (errorMessage.includes('insufficient funds') ||
      errorMessage.includes('insufficient balance')) {
    return {
      type: 'insufficient_funds',
      title: 'Insufficient Funds',
      message: 'You don\'t have enough tokens or ETH to complete this transaction.',
      canRetry: false,
      isUserError: true
    };
  }

  if (errorMessage.includes('gas required exceeds allowance') ||
      errorMessage.includes('gas estimation failed')) {
    return {
      type: 'gas_error',
      title: 'Gas Estimation Failed',
      message: 'The transaction requires more gas than available. Try increasing gas limit.',
      canRetry: true,
      isUserError: false
    };
  }

  if (errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection')) {
    return {
      type: 'network_error',
      title: 'Network Error',
      message: 'There was a network issue. Please check your connection and try again.',
      canRetry: true,
      isUserError: false
    };
  }

  if (errorMessage.includes('execution reverted') ||
      errorMessage.includes('revert')) {
    return {
      type: 'contract_error',
      title: 'Transaction Failed',
      message: 'The transaction was rejected by the smart contract. Please check your inputs.',
      canRetry: true,
      isUserError: false
    };
  }

  return {
    type: 'unknown',
    title: 'Operation Failed',
    message: errorMessage,
    canRetry: true,
    isUserError: false
  };
};
