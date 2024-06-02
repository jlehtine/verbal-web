import { AuthError } from "../shared/api";
import { ChatClient } from "./ChatClient";
import LoadingIndicator from "./LoadingIndicator";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import WelcomeView from "./WelcomeView";
import { useConfiguration } from "./context";
import load from "./load";
import LoginIcon from "@mui/icons-material/Login";
import { Alert, Box, Paper, Stack, Typography, useTheme } from "@mui/material";
import React, { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";

export interface LoginViewProps {
    client: ChatClient;
    googleClientId?: string;
    authPending: boolean;
    authError?: AuthError;
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
    const conf = useConfiguration();
    const { t } = useTranslation();

    return props.authPending ? (
        <LoadingIndicator conf={conf} />
    ) : (
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

function LoginButtons({ client, googleClientId }: LoginViewProps) {
    const conf = useConfiguration();
    const theme = useTheme();

    const GoogleLogin = getGoogleLogin(conf, googleClientId);

    return (
        <Suspense fallback={<LoadingIndicator conf={conf} />}>
            <Stack spacing={2} alignItems="center" sx={{ mt: 2 }}>
                {googleClientId && (
                    <Box sx={{ mt: 2 }}>
                        <GoogleLogin
                            onSuccess={(creds) => {
                                client.submitAuthentication({ type: "google", creds: creds });
                            }}
                            onError={() => {
                                client.setAuthError("failed");
                            }}
                            theme={theme.palette.mode === "dark" ? "filled_black" : undefined}
                        />
                    </Box>
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
