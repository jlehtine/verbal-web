/**
 * Retry operation with exponential backoff.
 *
 * @param operation operation to perform
 * @param onError error listener
 * @param backoffBaseMillis backoff base milliseconds
 * @param maxAttempts maximum attempts, if limited
 * @returns promise for performing the operation with exponential backoff
 */
export function retryWithBackoff<T>(
    operation: () => Promise<T>,
    onError: (err: unknown) => void,
    backoffBaseMillis = 100,
    maxAttempts?: number,
): Promise<T> {
    return doRetryWithBackoff(0, operation, onError, backoffBaseMillis, maxAttempts);
}

function doRetryWithBackoff<T>(
    attempt: number,
    operation: () => Promise<T>,
    onError: (err: unknown) => void,
    backoffBaseMillis = 5,
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
                            reject(err instanceof Error ? err : new Error("Operation failed", { cause: err }));
                        });
                }, backoff);
            });
        } else {
            throw err;
        }
    });
}
