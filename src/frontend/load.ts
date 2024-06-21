import { retryWithBackoff } from "../shared/retry";
import VerbalWebConfiguration, {
    DEFAULT_ON_LOADING_DELAY_MILLIS,
    VerbalWebLoadingPhase,
} from "./VerbalWebConfiguration";
import { logDebug, logThrownError } from "./log";

let onLoadingCount = 0;

const cache = {} as Record<string, Promise<unknown> | undefined>;

export default function load<T>(
    cacheKey: string,
    conf: VerbalWebConfiguration,
    phase: VerbalWebLoadingPhase,
    load: () => Promise<T>,
): Promise<T> {
    if (cache[cacheKey] !== undefined) {
        return cache[cacheKey] as Promise<T>;
    }
    let onLoadingIndicated = false;
    const onLoadingTimeout = setTimeout(() => {
        onLoadingIndicated = true;
        if (onLoadingCount === 0) {
            logDebug("Loading modules for %s phase", phase);
            if (conf.onLoading) {
                conf.onLoading(true, phase);
            }
        }
        onLoadingCount++;
    }, conf.onLoadingDelayMillis ?? DEFAULT_ON_LOADING_DELAY_MILLIS);
    const promise = retryWithBackoff(
        () =>
            load().then((res) => {
                clearTimeout(onLoadingTimeout);
                if (onLoadingIndicated) {
                    onLoadingCount--;
                    if (onLoadingCount === 0) {
                        logDebug("Loaded modules for %s phase", phase);
                        if (conf.onLoading) {
                            conf.onLoading(false, phase);
                        }
                    }
                }
                return res;
            }),
        (err: unknown) => {
            logThrownError("Failed to load modules for %s phase, retrying...", err, phase);
        },
    ).catch((err: unknown) => {
        clearTimeout(onLoadingTimeout);
        logThrownError("Failed to load modules for %s phase", err, phase);
        if (conf.onLoading) {
            conf.onLoading(false, phase, err);
        }
        throw err;
    });
    cache[cacheKey] = promise;
    return promise;
}
