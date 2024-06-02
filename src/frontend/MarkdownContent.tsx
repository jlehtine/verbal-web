import { MarkdownContentContext } from "./MarkdownContentSupport";
import { useConfiguration } from "./context";
import { Box } from "@mui/material";
import React, { useContext, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
            <Markdown className="vw-markdown-message" remarkPlugins={[remarkGfm]}>
                {content}
            </Markdown>
        </Box>
    );
}
