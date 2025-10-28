import { handleTransactionError } from '../error-handler';
import { parseTransactionError } from '../error-parser';
import toast from 'react-hot-toast';

// Mock toast
jest.mock('react-hot-toast', () => ({
  error: jest.fn(),
  success: jest.fn(),
}));

// Mock error-parser
jest.mock('../error-parser');

describe('handleTransactionError', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error output during tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore console.error after each test
    consoleErrorSpy.mockRestore();
  });

  describe('Basic error handling', () => {
    it('should handle user rejection errors', () => {
      const error = {
        code: 'ACTION_REJECTED',
        message: 'user rejected transaction'
      };

      parseTransactionError.mockReturnValue({
        type: 'user_rejection',
        title: 'Transaction Cancelled',
        message: 'You cancelled the transaction. No changes were made.',
        canRetry: true,
        isUserError: true
      });

      const result = handleTransactionError(error);

      expect(parseTransactionError).toHaveBeenCalledWith(error);
      expect(toast.error).toHaveBeenCalledWith('You cancelled the transaction. No changes were made.');
      expect(result.type).toBe('user_rejection');
    });

    it('should handle insufficient funds errors', () => {
      const error = {
        code: 'INSUFFICIENT_FUNDS',
        message: 'insufficient funds for gas'
      };

      parseTransactionError.mockReturnValue({
        type: 'insufficient_funds',
        title: 'Insufficient Funds',
        message: "You don't have enough tokens or ETH to complete this transaction.",
        canRetry: false,
        isUserError: true
      });

      const result = handleTransactionError(error);

      expect(toast.error).toHaveBeenCalledWith(
        "You don't have enough tokens or ETH to complete this transaction."
      );
      expect(result.type).toBe('insufficient_funds');
    });

    it('should handle gas estimation errors', () => {
      const error = {
        code: 'UNPREDICTABLE_GAS_LIMIT',
        message: 'gas estimation failed'
      };

      parseTransactionError.mockReturnValue({
        type: 'gas_error',
        title: 'Gas Estimation Failed',
        message: 'The transaction requires more gas than available. Try increasing gas limit.',
        canRetry: true,
        isUserError: false
      });

      const result = handleTransactionError(error);

      expect(toast.error).toHaveBeenCalledWith(
        'The transaction requires more gas than available. Try increasing gas limit.',
        { duration: 6000 }
      );
    });

    it('should handle contract revert errors', () => {
      const error = {
        message: 'execution reverted: Not enough liquidity'
      };

      parseTransactionError.mockReturnValue({
        type: 'contract_error',
        title: 'Transaction Failed',
        message: 'The transaction was rejected by the smart contract. Please check your inputs.',
        canRetry: true,
        isUserError: false
      });

      const result = handleTransactionError(error);

      expect(toast.error).toHaveBeenCalled();
    });

    it('should handle network errors', () => {
      const error = {
        message: 'network error: timeout'
      };

      parseTransactionError.mockReturnValue({
        type: 'network_error',
        title: 'Network Error',
        message: 'There was a network issue. Please check your connection and try again.',
        canRetry: true,
        isUserError: false
      });

      const result = handleTransactionError(error);

      expect(toast.error).toHaveBeenCalledWith(
        'There was a network issue. Please check your connection and try again.',
        { duration: 6000 }
      );
    });

    it('should handle transaction replaced (success case)', () => {
      const error = {
        code: 'TRANSACTION_REPLACED',
        message: 'transaction was replaced'
      };

      parseTransactionError.mockReturnValue({
        type: 'transaction_replaced',
        title: 'Transaction Repriced',
        message: 'Your wallet automatically adjusted the gas price for faster confirmation. The transaction was successful.',
        canRetry: false,
        isUserError: false,
        isSuccess: true
      });

      const result = handleTransactionError(error);

      // Success case should show success toast, not error
      expect(toast.success).toHaveBeenCalledWith(
        'Your wallet automatically adjusted the gas price for faster confirmation. The transaction was successful.'
      );
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('should handle unknown errors', () => {
      const error = {
        message: 'Something weird happened'
      };

      parseTransactionError.mockReturnValue({
        type: 'unknown',
        title: 'Operation Failed',
        message: 'Something weird happened',
        canRetry: true,
        isUserError: false
      });

      const result = handleTransactionError(error);

      expect(toast.error).toHaveBeenCalledWith('Something weird happened', { duration: 6000 });
    });
  });

  describe('Custom messages', () => {
    it('should use custom message when provided', () => {
      const error = {
        code: 'ACTION_REJECTED',
        message: 'user rejected'
      };

      parseTransactionError.mockReturnValue({
        type: 'user_rejection',
        title: 'Transaction Cancelled',
        message: 'You cancelled the transaction. No changes were made.',
        canRetry: true,
        isUserError: true
      });

      handleTransactionError(error, {
        customMessages: {
          user_rejection: 'Deposit was cancelled by user'
        }
      });

      expect(toast.error).toHaveBeenCalledWith('Deposit was cancelled by user');
    });

    it('should fall back to parsed message when custom message not provided for error type', () => {
      const error = {
        code: 'INSUFFICIENT_FUNDS'
      };

      parseTransactionError.mockReturnValue({
        type: 'insufficient_funds',
        title: 'Insufficient Funds',
        message: "You don't have enough tokens or ETH to complete this transaction.",
        canRetry: false,
        isUserError: true
      });

      handleTransactionError(error, {
        customMessages: {
          user_rejection: 'Some other message'
        }
      });

      expect(toast.error).toHaveBeenCalledWith(
        "You don't have enough tokens or ETH to complete this transaction."
      );
    });

    it('should support custom prefix for all messages', () => {
      const error = {
        code: 'INSUFFICIENT_FUNDS'
      };

      parseTransactionError.mockReturnValue({
        type: 'insufficient_funds',
        title: 'Insufficient Funds',
        message: "You don't have enough tokens or ETH to complete this transaction.",
        canRetry: false,
        isUserError: true
      });

      handleTransactionError(error, {
        messagePrefix: 'Deposit failed: '
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Deposit failed: You don't have enough tokens or ETH to complete this transaction."
      );
    });
  });

  describe('Toast options', () => {
    it('should use longer duration for non-user errors', () => {
      const error = {
        message: 'network timeout'
      };

      parseTransactionError.mockReturnValue({
        type: 'network_error',
        title: 'Network Error',
        message: 'There was a network issue. Please check your connection and try again.',
        canRetry: true,
        isUserError: false
      });

      handleTransactionError(error);

      expect(toast.error).toHaveBeenCalledWith(
        'There was a network issue. Please check your connection and try again.',
        { duration: 6000 }
      );
    });

    it('should use default duration for user errors', () => {
      const error = {
        code: 'ACTION_REJECTED'
      };

      parseTransactionError.mockReturnValue({
        type: 'user_rejection',
        title: 'Transaction Cancelled',
        message: 'You cancelled the transaction. No changes were made.',
        canRetry: true,
        isUserError: true
      });

      handleTransactionError(error);

      expect(toast.error).toHaveBeenCalledWith(
        'You cancelled the transaction. No changes were made.'
      );
      // Check that no duration option was passed (default behavior)
      expect(toast.error.mock.calls[0][1]).toBeUndefined();
    });

    it('should allow custom toast options', () => {
      const error = {
        message: 'some error'
      };

      parseTransactionError.mockReturnValue({
        type: 'unknown',
        title: 'Operation Failed',
        message: 'some error',
        canRetry: true,
        isUserError: false
      });

      handleTransactionError(error, {
        toastOptions: {
          duration: 10000,
          position: 'top-right'
        }
      });

      expect(toast.error).toHaveBeenCalledWith('some error', {
        duration: 10000,
        position: 'top-right'
      });
    });
  });

  describe('Silent mode', () => {
    it('should not show toast when silent option is true', () => {
      const error = {
        code: 'INSUFFICIENT_FUNDS'
      };

      parseTransactionError.mockReturnValue({
        type: 'insufficient_funds',
        title: 'Insufficient Funds',
        message: "You don't have enough tokens or ETH to complete this transaction.",
        canRetry: false,
        isUserError: true
      });

      const result = handleTransactionError(error, { silent: true });

      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(result.type).toBe('insufficient_funds');
    });
  });

  describe('Callback support', () => {
    it('should call onError callback when provided', () => {
      const error = {
        code: 'INSUFFICIENT_FUNDS'
      };

      parseTransactionError.mockReturnValue({
        type: 'insufficient_funds',
        title: 'Insufficient Funds',
        message: "You don't have enough tokens or ETH to complete this transaction.",
        canRetry: false,
        isUserError: true
      });

      const onError = jest.fn();
      handleTransactionError(error, { onError });

      expect(onError).toHaveBeenCalledWith({
        type: 'insufficient_funds',
        title: 'Insufficient Funds',
        message: "You don't have enough tokens or ETH to complete this transaction.",
        canRetry: false,
        isUserError: true
      });
    });
  });

  describe('Return value', () => {
    it('should return parsed error object', () => {
      const error = {
        code: 'ACTION_REJECTED'
      };

      const parsedError = {
        type: 'user_rejection',
        title: 'Transaction Cancelled',
        message: 'You cancelled the transaction. No changes were made.',
        canRetry: true,
        isUserError: true
      };

      parseTransactionError.mockReturnValue(parsedError);

      const result = handleTransactionError(error);

      expect(result).toEqual(parsedError);
    });
  });

  describe('Edge cases', () => {
    it('should handle null error', () => {
      parseTransactionError.mockReturnValue({
        type: 'unknown',
        title: 'Operation Failed',
        message: '',
        canRetry: true,
        isUserError: false
      });

      const result = handleTransactionError(null);

      expect(parseTransactionError).toHaveBeenCalledWith(null);
      expect(result.type).toBe('unknown');
    });

    it('should handle undefined error', () => {
      parseTransactionError.mockReturnValue({
        type: 'unknown',
        title: 'Operation Failed',
        message: '',
        canRetry: true,
        isUserError: false
      });

      const result = handleTransactionError(undefined);

      expect(parseTransactionError).toHaveBeenCalledWith(undefined);
      expect(result.type).toBe('unknown');
    });

    it('should log error to console when not silent', () => {
      const error = { message: 'test error' };

      parseTransactionError.mockReturnValue({
        type: 'unknown',
        title: 'Operation Failed',
        message: 'test error',
        canRetry: true,
        isUserError: false
      });

      handleTransactionError(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Transaction error:', error);
    });

    it('should not log error to console when silent', () => {
      const error = { message: 'test error' };

      parseTransactionError.mockReturnValue({
        type: 'unknown',
        title: 'Operation Failed',
        message: 'test error',
        canRetry: true,
        isUserError: false
      });

      handleTransactionError(error, { silent: true });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
