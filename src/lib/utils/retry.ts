// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Retry utility with exponential backoff
 * Based on CineGen-AI geminiService.ts retryOperation
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  retryOn429?: boolean;
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

/**
 * Check if an error is retryable (rate limit, overload, or temporary service unavailability)
 * Covers: 429 rate limit, 503 service unavailable, 529 overloaded (Anthropic/some providers)
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;

  const err = error as any;

  // Check status code: 429 rate limit, 500 server error, 502 bad gateway, 503 service unavailable, 529 overloaded
  if (err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503 || err.status === 529) return true;
  if (err.code === 429 || err.code === 500 || err.code === 502 || err.code === 503 || err.code === 529) return true;

  const message = err.message?.toLowerCase() || "";
  if (
    message.includes("429") ||    message.includes("500") ||    message.includes("502") ||    message.includes("503") ||
    message.includes("529") ||
    message.includes("quota") ||
    message.includes("rate") ||
    message.includes("resource_exhausted") ||
    message.includes("too many requests") ||
    message.includes("overloaded") ||
    message.includes("service unavailable") ||
    message.includes("temporarily unavailable") ||
    message.includes("internal server error") ||
    message.includes("上游负载") ||
    message.includes("上游服务") ||
    message.includes("饱和") ||
    message.includes("负载已满") ||
    message.includes("暂时不可用") ||
    message.includes("服务暂时不可用") ||
    message.includes("无可用渠道") ||
    message.includes("no available channel") ||
    message.includes("server error")
  ) {
    return true;
  }

  return false;
}

/**
 * Retry an async operation with exponential backoff for rate limit errors
 * 
 * @param operation - The async operation to retry
 * @param options - Retry configuration
 * @returns The result of the operation
 * @throws The last error if all retries fail
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 2000, retryOn429 = true, onRetry } = options;
  
  let lastError: Error | undefined;

  // maxRetries represents "max number of retries after failure", first attempt doesn't count as retry
  // Total attempts = 1 + maxRetries
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Only retry on rate limit errors (when enabled)
      if (!retryOn429 || !isRateLimitError(error)) {
        throw error;
      }

      // Check if we have more retries left
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);

        if (onRetry) {
          onRetry(attempt + 1, delay, lastError);
        } else {
          console.warn(
            `[Retry] Rate limit hit, retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Wrap an async function with retry logic
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return ((...args: Parameters<T>) => retryOperation(() => fn(...args), options)) as T;
}
