import VerbalWebConfiguration, {
    DEFAULT_ON_LOADING_DELAY_MILLIS,
    VerbalWebLoadingPhase,
} from "./VerbalWebConfiguration";
import { logDebug, logThrownError } from "./log";

let onLoadingCount = 0;

export default function load<T>(
    conf: VerbalWebConfiguration,
    phase: VerbalWebLoadingPhase,
    load: () => Promise<T>,
): Promise<T> {
    logDebug("Verbal Web loading modules for %s phase", phase);
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
    return load()
        .catch((err: unknown) => {
            clearTimeout(onLoadingTimeout);
            logThrownError("Verbal Web failed to load modules for %s phase", err, phase);
            if (conf.onLoading) {
                conf.onLoading(false, phase, err);
            }
            throw err;
        })
        .then((res) => {
            logDebug("Verbal Web loaded modules for %s phase", phase);
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
}
