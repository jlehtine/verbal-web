import { VerbalWebError } from "../shared/error";
import { isObject } from "../shared/util";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { useConfiguration } from "./context";
import load from "./load";
import { logThrownError } from "./log";
import { GlobalStyles, PaletteMode, useTheme } from "@mui/material";
import { PropsWithChildren, createContext, useContext, useEffect } from "react";
import React from "react";

let highlightStyle: HTMLStyleElement | undefined;
let highlightMode: PaletteMode | undefined;

let katexStyle: HTMLStyleElement | undefined;

interface CssModule {
    default: [[unknown, string]];
}

function isCssModule(v: unknown): v is CssModule {
    return (
        isObject(v) &&
        Array.isArray(v.default) &&
        v.default.length > 0 &&
        Array.isArray(v.default[0]) &&
        v.default[0].length > 1 &&
        typeof v.default[0][1] === "string"
    );
}

function getCssContent(module: unknown): string {
    if (isCssModule(module)) {
        return module.default[0][1];
    } else {
        throw new VerbalWebError("Not a CSS module");
    }
}

/**
 * Loads and sets the highlighting styles.
 *
 * @param mode palette mode
 */
function setHighlightPaletteMode(mode: PaletteMode, conf: VerbalWebConfiguration) {
    // Check if mode changed
    if (mode !== highlightMode) {
        // Set mode
        highlightMode = mode;

        // Load highlight styles, if necessary
        (mode === "light"
            ? load(
                  "highligh.js/styles/light",
                  conf,
                  "extra",
                  () => import("highlight.js/styles/stackoverflow-light.min.css"),
              )
            : load(
                  "highligh.js/styles/dark",
                  conf,
                  "extra",
                  () => import("highlight.js/styles/stackoverflow-dark.min.css"),
              )
        )
            .then((module) => {
                if (!highlightStyle) {
                    highlightStyle = document.createElement("style");
                    document.head.appendChild(highlightStyle);
                }
                if (mode === highlightMode) {
                    highlightStyle.innerHTML = getCssContent(module);
                }
            })
            .catch((err: unknown) => {
                logThrownError("Failed to load syntax highlighting styles", err);
            });
    }
}

/** Loads KaTeX styles. */
function loadKatexStyles(conf: VerbalWebConfiguration) {
    load("katex.css", conf, "extra", () => import("katex/dist/katex.min.css"))
        .then((module) => {
            if (!katexStyle) {
                katexStyle = document.createElement("style");
                document.head.appendChild(katexStyle);
                katexStyle.innerHTML = getCssContent(module);
            }
        })
        .catch((err: unknown) => {
            logThrownError("Failed to load KaTeX styles", err);
        });
}

export interface MarkdownContentFuncs {
    highlight: (elem: HTMLElement, completed: boolean) => void;
    mathMarkup: (content: string) => string | undefined;
}

const MarkdownContentContext = createContext<MarkdownContentFuncs | null>(null);

/** Use the markdown content functions */
export function useMarkdownContent(): MarkdownContentFuncs {
    const markdownContentFuncs = useContext(MarkdownContentContext);
    if (markdownContentFuncs === null) {
        throw new VerbalWebError("Markdown content context not provided");
    }
    return markdownContentFuncs;
}

/**
 * Provides styling for the contained {@link MarkdownContent} elements.
 * Should be included only once in the element tree.
 */
export default function MarkdownContentSupport({ children }: PropsWithChildren) {
    const conf = useConfiguration();
    const {
        palette: { mode },
    } = useTheme();

    /**
     * Highlights the specified HTML element.
     *
     * @param elem element to be highlighted
     * @param completed whether the content has been completed
     */
    function highlight(elem: HTMLElement, completed: boolean) {
        const selector = "pre code";
        const nodes = elem.querySelectorAll(selector);
        if (nodes.length > 0) {
            setHighlightPaletteMode(mode, conf);
            load("highlight.js", conf, "extra", () => import("highlight.js"))
                .then(({ default: hljs }) => {
                    for (const n of elem.querySelectorAll(selector + ':not([data-highlighted="yes"]')) {
                        if (n instanceof HTMLElement) {
                            if (
                                completed ||
                                n.nextElementSibling instanceof Element ||
                                n.parentElement?.nextElementSibling instanceof Element
                            ) {
                                hljs.highlightElement(n);
                            }
                        }
                    }
                })
                .catch((err: unknown) => {
                    logThrownError("Syntax highlighting failed", err);
                });
        }
    }

    /**
     * Converts math markup.
     *
     * @param content content
     * @returns returns converted content or undefined if content did not change
     */
    function mathMarkup(content: string): string | undefined {
        let c = content;
        c = c.replace(/\\\[(.*?)\\\]/gms, (_, formula: string) => "$$$" + formula + "$$$");
        c = c.replace(/\\\((.*?)\\\)/gm, (_, formula: string) => "$$" + formula + "$$");
        if (c !== content) {
            loadKatexStyles(conf);
            return c;
        }
    }

    // Switch highlight palette on light/dark mode changes
    useEffect(() => {
        if (highlightMode !== undefined) {
            setHighlightPaletteMode(mode, conf);
        }
    }, [mode]);

    return (
        <>
            <GlobalStyles
                styles={{
                    ".vw-markdown-message": {
                        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
                        fontSize: "16px",
                        fontWeight: 400,
                    },
                    ".vw-markdown-message p": {
                        whiteSpace: "pre-line",
                    },
                    ".vw-markdown-message table": {
                        color: "inherit",
                    },
                    ".vw-markdown-message > *:not(pre)": {
                        maxWidth: "50rem",
                    },
                }}
            />
            <MarkdownContentContext.Provider value={{ highlight: highlight, mathMarkup: mathMarkup }}>
                {children}
            </MarkdownContentContext.Provider>
        </>
    );
}
