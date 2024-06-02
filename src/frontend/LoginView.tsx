import { AuthError } from "../shared/api";
import { ChatClient } from "./ChatClient";
import LoadingIndicator from "./LoadingIndicator";
import WelcomeView from "./WelcomeView";
import { useConfiguration } from "./context";
import LoginIcon from "@mui/icons-material/Login";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import React from "react";
import { useTranslation } from "react-i18next";

export interface LoginViewProps {
    client: ChatClient;
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

function AuthenticationView({ authPending, authError }: LoginViewProps) {
    const conf = useConfiguration();
    const { t } = useTranslation();

    return authPending ? (
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
                        {authError && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {t("login.error." + authError)}
                            </Alert>
                        )}
                    </Box>
                </Stack>
            </Paper>
        </Stack>
    );
}
