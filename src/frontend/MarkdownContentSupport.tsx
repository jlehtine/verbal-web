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
 * @param conf configuration
 * @returns whether view was updated
 */
async function setHighlightPaletteMode(mode: PaletteMode, conf: VerbalWebConfiguration): Promise<boolean> {
    // Check if mode changed
    if (mode !== highlightMode) {
        // Set mode
        highlightMode = mode;

        // Load highlight styles, if necessary
        try {
            const module: unknown =
                mode === "light"
                    ? await load(
                          "highligh.js/styles/light",
                          conf,
                          "extra",
                          () => import("highlight.js/styles/stackoverflow-light.min.css"),
                      )
                    : await load(
                          "highligh.js/styles/dark",
                          conf,
                          "extra",
                          () => import("highlight.js/styles/stackoverflow-dark.min.css"),
                      );
            if (!highlightStyle) {
                const hs = document.createElement("style");
                document.head.appendChild(hs);
                highlightStyle = hs;
            }
            if (mode === highlightMode) {
                highlightStyle.innerHTML = getCssContent(module);
            }
        } catch (err: unknown) {
            logThrownError("Failed to load syntax highlighting styles", err);
        }
        return true;
    } else {
        return false;
    }
}

/** Loads KaTeX styles.
 *
 * @param conf configuration
 * @returns whether view was updated
 */
async function loadKatexStyles(conf: VerbalWebConfiguration): Promise<boolean> {
    if (!katexStyle) {
        try {
            const module: unknown = await load("katex.css", conf, "extra", () => import("katex/dist/katex.min.css"));
            const ks = document.createElement("style");
            document.head.appendChild(ks);
            ks.innerHTML = getCssContent(module);
            katexStyle = ks;
        } catch (err: unknown) {
            logThrownError("Failed to load KaTeX styles", err);
        }
        return true;
    } else {
        return false;
    }
}

/**
 * Context for markdown content processing.
 */
export interface MarkdownContentFuncs {
    /**
     * Asynchronously highlights the specified HTML element.
     *
     * @param elem element
     * @param completed whether element content has been completed
     * @returns whether view was updated
     */
    highlight: (elem: HTMLElement, completed: boolean) => Promise<boolean>;

    /**
     * Detects and converts math markup.
     *
     * @param content content with potential math markup
     * @returns converted content or undefined if content did not change
     */
    mathMarkup: (content: string) => string | undefined;

    /**
     * Asynchronously loads the math markup styling.
     *
     * @returns whether view was updated
     */
    mathMarkupStyling: () => Promise<boolean>;
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

    /** @see {@link MarkdownContentFuncs#highlight} */
    async function highlight(elem: HTMLElement, completed: boolean): Promise<boolean> {
        const selector = "pre code";
        const nodes = elem.querySelectorAll(selector + ':not([data-highlighted="yes"]');
        if (nodes.length > 0) {
            let updated = false;
            try {
                updated = await setHighlightPaletteMode(mode, conf);
                const { default: hljs } = await load("highlight.js", conf, "extra", () => import("highlight.js"));
                if (elem.isConnected) {
                    for (const n of nodes) {
                        if (n instanceof HTMLElement) {
                            if (
                                completed ||
                                n.nextElementSibling instanceof Element ||
                                n.parentElement?.nextElementSibling instanceof Element
                            ) {
                                hljs.highlightElement(n);
                                updated = true;
                            }
                        }
                    }
                }
            } catch (err: unknown) {
                logThrownError("Syntax highlighting failed", err);
            }
            return updated;
        } else {
            return false;
        }
    }

    /** @see {@link MarkdownContentFuncs#mathMarkup} */
    function mathMarkup(content: string): string | undefined {
        let c = content;
        c = c.replace(/\\\[(.*?)\\\]/gms, (_, formula: string) => "$$$" + formula + "$$$");
        c = c.replace(/\\\((.*?)\\\)/gm, (_, formula: string) => "$$" + formula + "$$");
        if (c !== content) {
            return c;
        } else {
            return undefined;
        }
    }

    /** @see {@link MarkdownContentFuncs#mathMarkupStyling} */
    async function mathMarkupStyling(): Promise<boolean> {
        return await loadKatexStyles(conf);
    }

    // Switch highlight palette on light/dark mode changes
    useEffect(() => {
        if (highlightMode !== undefined) {
            void setHighlightPaletteMode(mode, conf);
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
            <MarkdownContentContext.Provider value={{ highlight, mathMarkup, mathMarkupStyling }}>
                {children}
            </MarkdownContentContext.Provider>
        </>
    );
}
