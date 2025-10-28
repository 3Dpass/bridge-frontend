import { parseTransactionError } from './error-parser';
import toast from 'react-hot-toast';

/**
 * Handles transaction errors with consistent UI feedback and logging
 *
 * @param {Error} error - The error object to handle
 * @param {Object} options - Configuration options
 * @param {Object} options.customMessages - Map of error types to custom messages { type: message }
 * @param {string} options.messagePrefix - Prefix to add to all error messages
 * @param {boolean} options.silent - If true, don't show toast or log to console
 * @param {Object} options.toastOptions - Custom options to pass to toast (duration, position, etc.)
 * @param {Function} options.onError - Callback function called with parsed error object
 * @returns {Object} Parsed error object from parseTransactionError
 */
export const handleTransactionError = (error, options = {}) => {
  const {
    customMessages = {},
    messagePrefix = '',
    silent = false,
    toastOptions = {},
    onError
  } = options;

  // Parse the error using existing error parser
  const parsedError = parseTransactionError(error);

  // Log to console unless silent
  if (!silent) {
    console.error('Transaction error:', error);
  }

  // Get the message to display
  let message = customMessages[parsedError.type] || parsedError.message;

  // Add prefix if provided
  if (messagePrefix) {
    message = messagePrefix + message;
  }

  // Show toast notification unless silent
  if (!silent && message) {
    if (parsedError.isSuccess) {
      // Success case (e.g., transaction replaced)
      const hasOptions = Object.keys(toastOptions).length > 0;
      if (hasOptions) {
        toast.success(message, toastOptions);
      } else {
        toast.success(message);
      }
    } else {
      // Error case - use longer duration for non-user errors unless custom options provided
      const defaultToastOptions = parsedError.isUserError
        ? {}
        : { duration: 6000 };

      const finalOptions = { ...defaultToastOptions, ...toastOptions };
      const hasOptions = Object.keys(finalOptions).length > 0;

      if (hasOptions) {
        toast.error(message, finalOptions);
      } else {
        toast.error(message);
      }
    }
  }

  // Call error callback if provided
  if (onError) {
    onError(parsedError);
  }

  return parsedError;
};
