import { MarkdownContentContext } from "./MarkdownContentSupport";
import { useConfiguration } from "./context";
import { Box } from "@mui/material";
import React, { useContext, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/** Preprocesses math markup to format suitable for remark-math */
function preprocessMathMarkup(content: string): string {
    let c = content;
    c = c.replace(/\\\[(.*?)\\\]/gms, (_, formula: string) => "$$$" + formula + "$$$");
    c = c.replace(/\\\((.*?)\\\)/gms, (_, formula: string) => "$$" + formula + "$$");
    return c;
}

/**
 * Component for handling markdown and code snippet content.
 * All markdown content must be wrapped in {@link MarkdownContentSupport}.
 */
export default function MarkdownContent({ content, completed }: { content: string; completed: boolean }) {
    const conf = useConfiguration();
    const { highlight } = useContext(MarkdownContentContext);
    const selfRef = useRef<HTMLElement>();

    // Highlight, if highlighting not disabled
    useEffect(() => {
        if (conf.highlight !== false) {
            if (selfRef.current) {
                highlight(selfRef.current, completed);
            }
        }
    }, [content, completed]);

    return (
        <Box ref={selfRef}>
            <Markdown
                className="vw-markdown-message"
                remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
                rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
            >
                {preprocessMathMarkup(content)}
            </Markdown>
        </Box>
    );
}
