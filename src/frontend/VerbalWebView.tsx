import { AuthError } from "../shared/api";
import { ChatClient } from "./ChatClient";
import ChatView from "./ChatView";
import LoadingIndicator from "./LoadingIndicator";
import LoginView from "./LoginView";
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
    const [configuring, setConfiguring] = useState(true);
    const [loginPending, setLoginPending] = useState(false);
    const [authPending, setAuthPending] = useState(false);
    const [authError, setAuthError] = useState<AuthError>();

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

    function onInit() {
        setConfiguring(!client.sharedConfig);
        setLoginPending(client.sharedConfig?.auth !== undefined && !client.authenticated);
        setAuthPending(client.authPending);
        setAuthError(client.authError);
    }

    // On mount and unmount
    useEffect(() => {
        client.addEventListener("init", onInit);
        onInit();
        return () => {
            client.close();
        };
    }, []);

    return (
        <Box className={VERBAL_WEB_CLASS_NAME} {...(fullHeight ? { sx: { height: "100%" } } : {})}>
            <VerbalWebConfigurationProvider conf={conf}>
                {configuring ? (
                    <LoadingIndicator conf={conf} />
                ) : loginPending ? (
                    <LoginView client={client} authPending={authPending} authError={authError} />
                ) : (
                    <ChatView client={client} fullHeight={fullHeight} scrollRef={scrollRef} />
                )}
            </VerbalWebConfigurationProvider>
        </Box>
    );
}
