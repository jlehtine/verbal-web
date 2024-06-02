import { AuthError } from "../shared/api";
import { ChatClient } from "./ChatClient";
import ChatView from "./ChatView";
import LoadingIndicator from "./LoadingIndicator";
import LoginView from "./LoginView";
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
    const [configuring, setConfiguring] = useState(true);
    const [googleClientId, setGoogleClientId] = useState<string>();
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

    // Google OAuth provider
    const GoogleOAuthProvider = getGoogleOAuthProvider(conf, googleClientId);

    function onInit() {
        setConfiguring(!client.sharedConfig);
        setLoginPending(client.sharedConfig?.auth !== undefined && !client.authenticated);
        setGoogleClientId(client.sharedConfig?.auth?.googleId);
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
                ) : (
                    <Suspense fallback={<LoadingIndicator conf={conf} />}>
                        <GoogleOAuthProvider clientId={googleClientId ?? ""}>
                            {" "}
                            {loginPending ? (
                                <LoginView
                                    client={client}
                                    googleClientId={googleClientId}
                                    authPending={authPending}
                                    authError={authError}
                                />
                            ) : (
                                <ChatView client={client} fullHeight={fullHeight} scrollRef={scrollRef} />
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
