import { ChatClient } from "./ChatClient";
import ChatView from "./ChatView";
import LoadingIndicator from "./LoadingIndicator";
import LoginView from "./LoginView";
import MarkdownContentSupport from "./MarkdownContentSupport";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { VerbalWebConfigurationProvider } from "./context";
import { VERBAL_WEB_CLASS_NAME, extract } from "./extract";
import load from "./load";
import { Box } from "@mui/material";
import React, { MutableRefObject, PropsWithChildren, Suspense, lazy, useEffect, useState } from "react";

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

    const [initializing, setInitializing] = useState(client.initializing);
    const [expectLogin, setExpectLogin] = useState(client.expectLogin);
    const [googleClientId, setGoogleClientId] = useState(client.sharedConfig?.auth?.googleId);
    const [authError, setAuthError] = useState(client.authError);

    // Google OAuth provider
    const GoogleOAuthProvider = getGoogleOAuthProvider(conf, googleClientId);

    function onInit() {
        setInitializing(client.initializing);
        setExpectLogin(client.expectLogin);
        setGoogleClientId(client.sharedConfig?.auth?.googleId);
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
                {initializing ? (
                    <LoadingIndicator conf={conf} />
                ) : (
                    <Suspense fallback={<LoadingIndicator conf={conf} />}>
                        <GoogleOAuthProvider clientId={googleClientId ?? ""}>
                            {expectLogin ? (
                                <LoginView
                                    client={client}
                                    expectLogin={expectLogin}
                                    googleClientId={googleClientId}
                                    authError={authError}
                                />
                            ) : (
                                <MarkdownContentSupport>
                                    <ChatView client={client} fullHeight={fullHeight} scrollRef={scrollRef} />
                                </MarkdownContentSupport>
                            )}
                        </GoogleOAuthProvider>
                    </Suspense>
                )}
            </VerbalWebConfigurationProvider>
        </Box>
    );
}

function getGoogleOAuthProvider(conf: VerbalWebConfiguration, googleClientId?: string) {
    return googleClientId
        ? lazy(() =>
              load("GoogleOAuthProvider", conf, "extra", () => import("@react-oauth/google")).then(
                  ({ GoogleOAuthProvider }) => ({ default: GoogleOAuthProvider }),
              ),
          )
        : (props: PropsWithChildren<{ clientId: string }>) => props.children;
}
