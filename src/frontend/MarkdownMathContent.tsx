import React from "react";
import Markdown, { Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkMath from "remark-math";

export default function MarkdownMathContent({
    remarkPlugins,
    rehypePlugins,
    ...options
}: Readonly<Options>): JSX.Element {
    return (
        <Markdown
            {...options}
            remarkPlugins={[...(remarkPlugins ?? []), [remarkMath, { singleDollarTextMath: false }]]}
            rehypePlugins={[
                ...(rehypePlugins ?? []),
                rehypeRaw,
                rehypeSanitize,
                [rehypeKatex, { output: "html", strict: false }],
            ]}
        />
    );
}
