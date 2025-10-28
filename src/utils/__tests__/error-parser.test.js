import { parseTransactionError } from '../error-parser';

describe('error-parser', () => {
  describe('parseTransactionError', () => {
    describe('user rejection errors', () => {
      it('should parse user rejected transaction error', () => {
        const error = new Error('user rejected transaction');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'user_rejection',
          title: 'Transaction Cancelled',
          message: 'You cancelled the transaction. No changes were made.',
          canRetry: true,
          isUserError: true
        });
      });

      it('should parse ACTION_REJECTED in message', () => {
        const error = new Error('ACTION_REJECTED');
        const result = parseTransactionError(error);

        expect(result.type).toBe('user_rejection');
      });

      it('should parse ACTION_REJECTED error code', () => {
        const error = new Error('Some error');
        error.code = 'ACTION_REJECTED';
        const result = parseTransactionError(error);

        expect(result.type).toBe('user_rejection');
      });

      it('should parse User denied message', () => {
        const error = new Error('User denied transaction signature');
        const result = parseTransactionError(error);

        expect(result.type).toBe('user_rejection');
      });

      it('should parse cancelled in message', () => {
        const error = new Error('Transaction cancelled by user');
        const result = parseTransactionError(error);

        expect(result.type).toBe('user_rejection');
      });
    });

    describe('transaction replaced errors', () => {
      it('should parse transaction replaced message', () => {
        const error = new Error('transaction was replaced');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'transaction_replaced',
          title: 'Transaction Repriced',
          message: 'Your wallet automatically adjusted the gas price for faster confirmation. The transaction was successful.',
          canRetry: false,
          isUserError: false,
          isSuccess: true
        });
      });

      it('should parse TRANSACTION_REPLACED error code', () => {
        const error = new Error('Some error');
        error.code = 'TRANSACTION_REPLACED';
        const result = parseTransactionError(error);

        expect(result.type).toBe('transaction_replaced');
        expect(result.isSuccess).toBe(true);
      });
    });

    describe('transaction hash errors', () => {
      it('should parse transaction hash missing error', () => {
        const error = new Error('Transaction does not have a transaction hash');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'transaction_hash_error',
          title: 'Transaction Submission Failed',
          message: 'The transaction could not be submitted properly. This often happens with allowance increases.',
          canRetry: true,
          isUserError: false
        });
      });

      it('should parse generic problem message', () => {
        const error = new Error('there was a problem');
        const result = parseTransactionError(error);

        expect(result.type).toBe('transaction_hash_error');
      });

      it('should parse -32603 error code', () => {
        const error = new Error('Some error');
        error.code = -32603;
        const result = parseTransactionError(error);

        expect(result.type).toBe('transaction_hash_error');
      });
    });

    describe('insufficient funds errors', () => {
      it('should parse insufficient funds message', () => {
        const error = new Error('insufficient funds for gas * price + value');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'insufficient_funds',
          title: 'Insufficient Funds',
          message: 'You don\'t have enough tokens or ETH to complete this transaction.',
          canRetry: false,
          isUserError: true
        });
      });

      it('should parse insufficient balance message', () => {
        const error = new Error('insufficient balance');
        const result = parseTransactionError(error);

        expect(result.type).toBe('insufficient_funds');
        expect(result.canRetry).toBe(false);
      });
    });

    describe('gas estimation errors', () => {
      it('should parse gas required exceeds allowance', () => {
        const error = new Error('gas required exceeds allowance or always failing transaction');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'gas_error',
          title: 'Gas Estimation Failed',
          message: 'The transaction requires more gas than available. Try increasing gas limit.',
          canRetry: true,
          isUserError: false
        });
      });

      it('should parse gas estimation failed message', () => {
        const error = new Error('gas estimation failed');
        const result = parseTransactionError(error);

        expect(result.type).toBe('gas_error');
      });
    });

    describe('network errors', () => {
      it('should parse network error', () => {
        const error = new Error('network request failed');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'network_error',
          title: 'Network Error',
          message: 'There was a network issue. Please check your connection and try again.',
          canRetry: true,
          isUserError: false
        });
      });

      it('should parse timeout error', () => {
        const error = new Error('timeout waiting for response');
        const result = parseTransactionError(error);

        expect(result.type).toBe('network_error');
      });

      it('should parse connection error', () => {
        const error = new Error('connection refused');
        const result = parseTransactionError(error);

        expect(result.type).toBe('network_error');
      });
    });

    describe('contract errors', () => {
      it('should parse execution reverted error', () => {
        const error = new Error('execution reverted: ERC20: insufficient allowance');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'contract_error',
          title: 'Transaction Failed',
          message: 'The transaction was rejected by the smart contract. Please check your inputs.',
          canRetry: true,
          isUserError: false
        });
      });

      it('should parse revert error', () => {
        const error = new Error('Transaction reverted without a reason string');
        const result = parseTransactionError(error);

        expect(result.type).toBe('contract_error');
      });
    });

    describe('unknown errors', () => {
      it('should parse unknown error with message', () => {
        const error = new Error('Unexpected error occurred');
        const result = parseTransactionError(error);

        expect(result).toEqual({
          type: 'unknown',
          title: 'Operation Failed',
          message: 'Unexpected error occurred',
          canRetry: true,
          isUserError: false
        });
      });

      it('should handle error without message property', () => {
        const error = { toString: () => 'Custom error string' };
        const result = parseTransactionError(error);

        expect(result.type).toBe('unknown');
        expect(result.message).toBe('Custom error string');
      });

      it('should handle empty error message', () => {
        const error = new Error('');
        const result = parseTransactionError(error);

        expect(result.type).toBe('unknown');
        expect(result.message).toBe('Error');
      });
    });

    describe('error priority', () => {
      it('should prioritize user rejection over network error', () => {
        const error = new Error('user rejected network transaction');
        const result = parseTransactionError(error);

        expect(result.type).toBe('user_rejection');
      });

      it('should prioritize transaction replaced over contract error', () => {
        const error = new Error('transaction was replaced and reverted');
        const result = parseTransactionError(error);

        expect(result.type).toBe('transaction_replaced');
      });

      it('should prioritize insufficient funds over gas error', () => {
        const error = new Error('insufficient funds - gas estimation failed');
        const result = parseTransactionError(error);

        expect(result.type).toBe('insufficient_funds');
      });
    });

    describe('edge cases', () => {
      it('should handle null error', () => {
        const result = parseTransactionError(null);

        expect(result.type).toBe('unknown');
      });

      it('should handle undefined error', () => {
        const result = parseTransactionError(undefined);

        expect(result.type).toBe('unknown');
      });

      it('should be case-sensitive for error matching', () => {
        const error = new Error('USER REJECTED transaction');
        const result = parseTransactionError(error);

        expect(result.type).toBe('unknown');
      });
    });

    describe('return value structure', () => {
      it('should always return required fields', () => {
        const error = new Error('test');
        const result = parseTransactionError(error);

        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('canRetry');
        expect(result).toHaveProperty('isUserError');
      });

      it('should have boolean canRetry field', () => {
        const error = new Error('user rejected transaction');
        const result = parseTransactionError(error);

        expect(typeof result.canRetry).toBe('boolean');
      });

      it('should have boolean isUserError field', () => {
        const error = new Error('user rejected transaction');
        const result = parseTransactionError(error);

        expect(typeof result.isUserError).toBe('boolean');
      });

      it('should have string type field', () => {
        const error = new Error('user rejected transaction');
        const result = parseTransactionError(error);

        expect(typeof result.type).toBe('string');
      });
    });
  });
});
