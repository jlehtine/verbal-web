import LoadingIndicator from "./LoadingIndicator";
import { useMarkdownContent } from "./MarkdownContentSupport";
import { useConfiguration } from "./context";
import load from "./load";
import { Box } from "@mui/material";
import React, { Suspense, lazy, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Component for handling markdown and code snippet content.
 * All markdown content must be wrapped in {@link MarkdownContentSupport}.
 */
export default function MarkdownContent({ content, completed }: { content: string; completed: boolean }) {
    const conf = useConfiguration();
    const { highlight, mathMarkup } = useMarkdownContent();
    const selfRef = useRef<HTMLElement>();

    // Highlight, if highlighting not disabled
    useEffect(() => {
        if (conf.highlight !== false) {
            if (selfRef.current) {
                highlight(selfRef.current, completed);
            }
        }
    }, [content, completed]);

    // Handle math markup, if not disabled
    let MarkdownMathContent;
    if (conf.mathMarkup !== false) {
        const tc = mathMarkup(content);
        if (tc !== undefined) {
            content = tc;
            MarkdownMathContent = lazy(() =>
                load("MarkdownMathContent", conf, "extra", () => import("./MarkdownMathContent")),
            );
        }
    }
    const MarkdownComponent = MarkdownMathContent ?? Markdown;

    return (
        <Box ref={selfRef} className="vw-markdown-message">
            <Suspense fallback={<LoadingIndicator conf={conf} />}>
                <MarkdownComponent remarkPlugins={[remarkGfm]}>{content}</MarkdownComponent>
            </Suspense>
        </Box>
    );
}
