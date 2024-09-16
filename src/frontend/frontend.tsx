import { VerbalWebError } from "../shared/error";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import load from "./load";
import { FunctionComponent } from "react";

function initVerbalWebLauncher(elementId: string, conf: VerbalWebConfiguration) {
    initVerbalWebElement(
        elementId,
        conf,
        "VerbalWebLauncher",
        () => import(/* webpackPrefetch: true */ "./VerbalWebLauncher"),
        { conf: conf },
    );
}

function initVerbalWebView(
    elementId: string,
    conf: VerbalWebConfiguration,
    fullHeight?: boolean,
    scrollElemId?: string,
) {
    const scrollElem = scrollElemId !== undefined ? document.getElementById(scrollElemId) : undefined;
    const scrollRef = scrollElem ? { current: scrollElem } : undefined;
    initVerbalWebElement(
        elementId,
        conf,
        "VerbalWebView",
        () => import(/* webpackPrefetch: true */ "./VerbalWebView"),
        {
            conf: conf,
            fullHeight: fullHeight,
            scrollRef: scrollRef,
        },
    );
}

function initVerbalWebElement<P extends Record<string, unknown>>(
    elementId: string,
    conf: VerbalWebConfiguration,
    compName: string,
    compImport: () => Promise<{ default: FunctionComponent<P> }>,
    props: P,
) {
    const elem = document.getElementById(elementId);
    if (elem !== null) {
        Promise.all([
            load("react", conf, "initial", () => import(/* webpackPrefetch: true */ "react")),
            load("i18n", conf, "initial", () => import(/* webpackPrefetch: true */ "./i18n")),
            load("react-dom/client", conf, "initial", () => import(/* webpackPrefetch: true */ "react-dom/client")),
            load("defaultTheme", conf, "initial", () => import(/* webpackPrefetch: true */ "./defaultTheme")),
            load(compName, conf, "initial", compImport),
        ])
            .then(
                ([{ default: React }, { initI18n }, { createRoot }, { DefaultThemed }, { default: MainComponent }]) => {
                    initI18n(conf);
                    const root = createRoot(elem);
                    root.render(
                        <DefaultThemed conf={conf}>
                            <MainComponent {...props} />
                        </DefaultThemed>,
                    );
                },
            )
            .catch((err: unknown) => {
                throw new VerbalWebError("Verbal Web initialization failed", { cause: err });
            });
    } else {
        throw new VerbalWebError(`Verbal Web container element not found: #${elementId}`);
    }
}

globalThis.initVerbalWebLauncher = initVerbalWebLauncher;
globalThis.initVerbalWebView = initVerbalWebView;
