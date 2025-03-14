/**
 * Configuration options for the retry function
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff factor to multiply delay by after each attempt (default: 2) */
  backoffFactor?: number;
  /** Optional function to determine if an error is retryable */
  retryableError?: (error: unknown) => boolean;
  /** Optional callback function that runs before each retry attempt */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
}

/**
 * Creates a delay using setTimeout wrapped in a Promise
 * @param ms Milliseconds to delay
 */
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Executes a function with retry logic using exponential backoff
 * 
 * @param fn The async function to execute and potentially retry
 * @param options Configuration options for retry behavior
 * @returns Promise resolving to the return value of the function
 * @throws The last error encountered if all retries fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    retryableError = () => true,
    onRetry = () => {},
  } = options;

  let attempt = 0;
  let currentDelay = initialDelay;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // If we've reached max retries or the error isn't retryable, throw
      if (attempt >= maxRetries || !retryableError(error)) {
        throw error;
      }

      // Calculate next delay with exponential backoff
      currentDelay = Math.min(currentDelay * backoffFactor, maxDelay);
      
      // Add some jitter to prevent synchronized retries
      const jitteredDelay = currentDelay * (0.8 + Math.random() * 0.4);
      
      // Call the onRetry callback if provided
      onRetry(attempt + 1, jitteredDelay, error);
      
      // Wait before next attempt
      await delay(jitteredDelay);
      
      attempt++;
    }
  }

  // This should never be reached due to the throw in the loop,
  // but TypeScript needs it for type safety
  throw lastError;
}
