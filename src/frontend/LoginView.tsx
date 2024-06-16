import { AuthErrorCode, ChatClient, IdentityProviderId } from "./ChatClient";
import LoadingIndicator from "./LoadingIndicator";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import WelcomeView from "./WelcomeView";
import { useConfiguration } from "./context";
import load from "./load";
import { logError, logThrownError } from "./log";
import LoginIcon from "@mui/icons-material/Login";
import { Alert, Box, CircularProgress, Paper, Stack, Typography, useTheme } from "@mui/material";
import React, { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";

export interface LoginViewProps {
    client: ChatClient;
    expectLogin: IdentityProviderId[];
    googleClientId?: string;
    authError?: AuthErrorCode;
}

export default function LoginView(props: LoginViewProps) {
    return (
        <Stack>
            <WelcomeView />
            <AuthenticationView {...props} />
        </Stack>
    );
}

function AuthenticationView(props: LoginViewProps) {
    const { t } = useTranslation();
    return (
        <Stack direction="row" justifyContent="center">
            <Paper sx={{ maxWidth: "40rem", padding: 2, pt: 4, pb: 4 }}>
                <Stack direction="row" spacing={2}>
                    <LoginIcon />
                    <Box>
                        <Typography variant="h5" sx={{ fontSize: "125%" }}>
                            {t("login.title")}
                        </Typography>
                        <Typography sx={{ mt: 2 }}>{t("login.text")}</Typography>
                    </Box>
                </Stack>
                {props.authError && (
                    <Box>
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {t("login.error." + props.authError)}
                        </Alert>
                    </Box>
                )}
                <LoginButtons {...props} />
            </Paper>
        </Stack>
    );
}

function LoginButtons({ client, expectLogin, googleClientId }: LoginViewProps) {
    const { t } = useTranslation();
    const conf = useConfiguration();
    const theme = useTheme();

    const [inProgress, setInProgress] = useState(false);

    const google = expectLogin.includes("google");
    const GoogleLogin = google && getGoogleLogin(conf, googleClientId);

    return (
        <Suspense fallback={<LoadingIndicator conf={conf} />}>
            <Stack spacing={2} alignItems="center" sx={{ mt: 2 }}>
                {inProgress ? (
                    <Paper sx={{ mt: 2, padding: 2 }}>
                        <CircularProgress />
                        <Typography>{t("login.inProgress")}</Typography>
                    </Paper>
                ) : (
                    <>
                        {GoogleLogin && (
                            <Box sx={{ mt: 2 }}>
                                <GoogleLogin
                                    onSuccess={(creds) => {
                                        if (creds.credential !== undefined) {
                                            setInProgress(true);
                                            client
                                                .login("google", creds.credential)
                                                .catch((err: unknown) => {
                                                    logThrownError("Login failed", err);
                                                })
                                                .finally(() => {
                                                    setInProgress(false);
                                                });
                                        } else {
                                            logError("Google authentication credentials not received");
                                        }
                                    }}
                                    onError={() => {
                                        client.setAuthError("failed");
                                    }}
                                    theme={theme.palette.mode === "dark" ? "filled_black" : undefined}
                                />
                            </Box>
                        )}
                    </>
                )}
            </Stack>
        </Suspense>
    );
}

function getGoogleLogin(conf: VerbalWebConfiguration, googleClientId?: string) {
    return googleClientId
        ? lazy(() =>
              load("GoogleLogin", conf, "extra", () => import("@react-oauth/google")).then(({ GoogleLogin }) => ({
                  default: GoogleLogin,
              })),
          )
        : () => undefined;
}
