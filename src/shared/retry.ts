/** Signals that the maximum number of retries had been */
export class MaxRetriesExceededError extends Error {
    constructor(msg: string, options: ErrorOptions & { cause: unknown }) {
        super(msg, options);
        this.name = "RetryExhaustedError";
    }
}

/**
 * Retry operation with exponential backoff.
 *
 * @param operation operation to perform
 * @param onError error listener
 * @param maxAttempts maximum attempts, if limited
 * @param backoffBaseMillis backoff base milliseconds
 * @returns promise for performing the operation with exponential backoff
 */
export function retryWithBackoff<T>(
    operation: () => Promise<T>,
    onError: (err: unknown) => void,
    maxAttempts?: number,
    backoffBaseMillis = 100,
): Promise<T> {
    return doRetryWithBackoff(0, operation, onError, backoffBaseMillis, maxAttempts);
}

function doRetryWithBackoff<T>(
    attempt: number,
    operation: () => Promise<T>,
    onError: (err: unknown) => void,
    backoffBaseMillis: number,
    maxAttempts?: number,
): Promise<T> {
    return operation().catch((err: unknown) => {
        if (maxAttempts === undefined || attempt < maxAttempts) {
            onError(err);
            const backoffBase = backoffBaseMillis + Math.pow(2, attempt);
            const backoff = backoffBase + Math.random() * backoffBase;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    doRetryWithBackoff(attempt + 1, operation, onError, backoffBaseMillis, maxAttempts)
                        .then((res) => {
                            resolve(res);
                        })
                        .catch((err: unknown) => {
                            reject(new MaxRetriesExceededError("Maximum number of retries exceeded", { cause: err }));
                        });
                }, backoff);
            });
        } else {
            throw err;
        }
    });
}
