import { describeError } from "../shared/error";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import load from "./load";
import { FunctionComponent } from "react";

function initVerbalWebLauncher(elementId: string, conf: VerbalWebConfiguration) {
    initVerbalWebElement(elementId, conf, import(/* webpackPrefetch: true */ "./VerbalWebLauncher"), { conf: conf });
}

function initVerbalWebView(elementId: string, conf: VerbalWebConfiguration, scrollElemId?: string) {
    const scrollElem = scrollElemId !== undefined ? document.getElementById(scrollElemId) : undefined;
    const scrollRef = scrollElem ? { current: scrollElem } : undefined;
    initVerbalWebElement(elementId, conf, import(/* webpackPrefetch: true */ "./VerbalWebView"), {
        conf: conf,
        scrollRef: scrollRef,
    });
}

function initVerbalWebElement<P extends Record<string, unknown>>(
    elementId: string,
    conf: VerbalWebConfiguration,
    compImport: Promise<{ default: FunctionComponent<P> }>,
    props: P,
) {
    const elem = document.getElementById(elementId);
    if (elem !== null) {
        load("initial", conf, "initial", () =>
            Promise.all([
                import(/* webpackPrefetch: true */ "react"),
                import(/* webpackPrefetch: true */ "./i18n"),
                import(/* webpackPrefetch: true */ "react-dom/client"),
                import(/* webpackPrefetch: true */ "./defaultTheme"),
                compImport,
            ]),
        )
            .then(
                ([
                    { default: React },
                    { initI18n },
                    { createRoot },
                    { DefaultThemed: DefaultThemed },
                    { default: MainComponent },
                ]) => {
                    initI18n(conf);
                    const root = createRoot(elem);
                    root.render(
                        <DefaultThemed>
                            <MainComponent {...props} />
                        </DefaultThemed>,
                    );
                },
            )
            .catch((err: unknown) => {
                console.error(describeError(err, false, "Verbal Web initialization failed"));
                throw err;
            });
    } else {
        console.error("Verbal Web container element not fount: #%s", elementId);
    }
}

globalThis.initVerbalWebLauncher = initVerbalWebLauncher;
globalThis.initVerbalWebView = initVerbalWebView;
