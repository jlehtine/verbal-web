import { describeError } from "../shared/error";
import VerbalWebConfiguration, {
    DEFAULT_ON_LOADING_DELAY_MILLIS,
    VerbalWebLoadingPhase,
} from "./VerbalWebConfiguration";

export default function load<T>(
    conf: VerbalWebConfiguration,
    phase: VerbalWebLoadingPhase,
    load: () => Promise<T>,
): Promise<T> {
    let onLoadingIndicated = false;
    const onLoadingTimeout = setTimeout(() => {
        onLoadingIndicated = true;
        console.debug(`Verbal Web loading modules for ${phase} phase`);
        if (conf.onLoading) {
            conf.onLoading(true, phase);
        }
    }, conf.onLoadingDelayMillis ?? DEFAULT_ON_LOADING_DELAY_MILLIS);
    return load()
        .catch((err: unknown) => {
            clearTimeout(onLoadingTimeout);
            console.error(describeError(err, false, `Verbal Web failed to load modules for ${phase} phase`));
            if (conf.onLoading) {
                conf.onLoading(false, phase, err);
            }
            throw err;
        })
        .then((res) => {
            clearTimeout(onLoadingTimeout);
            if (onLoadingIndicated) {
                console.debug(`Verbal Web loaded modules for ${phase} phase`);
                if (conf.onLoading) {
                    conf.onLoading(false, phase);
                }
            }
            return res;
        });
}
