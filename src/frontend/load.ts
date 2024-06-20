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
    logDebug("Loading modules for %s phase", phase);
    let onLoadingIndicated = false;
    const onLoadingTimeout = setTimeout(() => {
        onLoadingIndicated = true;
        if (onLoadingCount === 0) {
            if (conf.onLoading) {
                conf.onLoading(true, phase);
            }
        }
        onLoadingCount++;
    }, conf.onLoadingDelayMillis ?? DEFAULT_ON_LOADING_DELAY_MILLIS);
    const promise = load()
        .catch((err: unknown) => {
            clearTimeout(onLoadingTimeout);
            logThrownError("Failed to load modules for %s phase", err, phase);
            if (conf.onLoading) {
                conf.onLoading(false, phase, err);
            }
            throw err;
        })
        .then((res) => {
            logDebug("Loaded modules for %s phase", phase);
            clearTimeout(onLoadingTimeout);
            if (onLoadingIndicated) {
                onLoadingCount--;
                if (onLoadingCount === 0) {
                    if (conf.onLoading) {
                        conf.onLoading(false, phase);
                    }
                }
            }
            return res;
        });
    cache[cacheKey] = promise;
    return promise;
}
