import { ChatClient } from "./ChatClient";
import ChatView from "./ChatView";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { VerbalWebConfigurationProvider } from "./context";
import { VERBAL_WEB_CLASS_NAME, extract } from "./extract";
import { Box } from "@mui/material";
import React, { MutableRefObject, useEffect, useState } from "react";

export interface VerbalWebViewProps {
    /** Verbal Web configuration */
    conf: VerbalWebConfiguration;

    /** Whether to make the view full height */
    fullHeight?: boolean;

    /** Reference to the containing scrolling element, defaults to window scrolling */
    scrollRef?: MutableRefObject<HTMLElement | undefined>;
}

/**
 * The main Verbal Web view that can be used either as a standalone view or inside a dialog.
 */
export default function VerbalWebView({ conf, fullHeight, scrollRef }: VerbalWebViewProps) {
    // Chat client containing also state and model
    // This is not used directly for rendering but has the same lifecycle as the component
    const [client] = useState(
        () =>
            new ChatClient(conf.backendURL, {
                initialInstruction: conf.initialInstruction,
                pageContent: extract(conf.pageContentSelector),
                model: conf.useModel,
            }),
    );

    // Close chat client on unmount
    useEffect(() => () => {
        client.close();
    });

    return (
        <Box className={VERBAL_WEB_CLASS_NAME} {...(fullHeight ? { sx: { height: "100%" } } : {})}>
            <VerbalWebConfigurationProvider conf={conf}>
                <ChatView client={client} fullHeight={fullHeight} scrollRef={scrollRef} />
            </VerbalWebConfigurationProvider>
        </Box>
    );
}
