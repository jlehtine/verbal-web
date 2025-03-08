import LoadingIndicator from "./LoadingIndicator";
import { useMarkdownContent } from "./MarkdownContentSupport";
import { useConfiguration } from "./context";
import load from "./load";
import { Box } from "@mui/material";
import React, { Suspense, lazy, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
    /** Text content checked for Markdown and code snippets */
    content: string;

    /** Whether the content is completed */
    completed: boolean;

    /** Callback when the view has been updated */
    onViewUpdated?: () => void;
}

/**
 * Component for handling markdown and code snippet content.
 * All markdown content must be wrapped in {@link MarkdownContentSupport}.
 */
export default function MarkdownContent({ content, completed, onViewUpdated }: Readonly<MarkdownContentProps>) {
    const conf = useConfiguration();
    const { highlight, mathMarkup, mathMarkupStyling } = useMarkdownContent();
    const selfRef = useRef<HTMLElement>();

    // Highlight, if highlighting not disabled
    useEffect(() => {
        const src = selfRef.current;
        if (conf.highlight !== false && src) {
            void (async () => {
                if (await highlight(src, completed)) {
                    onViewUpdated?.();
                }
            })();
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
        void (async () => {
            if (await mathMarkupStyling()) {
                onViewUpdated?.();
            }
        })();
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
