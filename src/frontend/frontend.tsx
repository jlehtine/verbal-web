import { describeError } from "../shared/error";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import load from "./load";

declare global {
    var initVerbalWeb: (elementId: string, conf: VerbalWebConfiguration) => void; // eslint-disable-line
}

function initVerbalWeb(elementId: string, conf: VerbalWebConfiguration) {
    const elem = document.getElementById(elementId);
    if (elem !== null) {
        load(conf, "initial", () =>
            Promise.all([
                import(/* webpackPrefetch: true */ "react"),
                import(/* webpackPrefetch: true */ "react-dom/client"),
                import(/* webpackPrefetch: true */ "./VerbalWebUI"),
            ]),
        )
            .then(([{ default: React }, { createRoot: createRoot }, { default: VerbalWebUI }]) => {
                const root = createRoot(elem);
                root.render(<VerbalWebUI conf={conf} />);
            })
            .catch((err: unknown) => {
                console.error(describeError(err, false, "Verbal Web initialization failed"));
                throw err;
            });
    } else {
        console.error("Verbal Web container element not fount: #%s", elementId);
    }
}

globalThis.initVerbalWeb = initVerbalWeb;
