import { useConfiguration } from "./context";
import AssistantIcon from "@mui/icons-material/Assistant";
import { Avatar, Box, Link, Paper, Stack, Typography } from "@mui/material";
import React from "react";
import { useTranslation } from "react-i18next";

export default function WelcomeView() {
    const { t } = useTranslation();
    const conf = useConfiguration();
    return (
        <Paper sx={{ maxWidth: "40rem", padding: 2, pt: 4, pb: 4, margin: 4 }}>
            <Stack direction="row" spacing={2}>
                <Avatar sx={{ bgcolor: "primary.main" }}>
                    <AssistantIcon />
                </Avatar>
                <Box>
                    <Typography variant="h4" sx={{ fontSize: "150%" }}>
                        {t("welcome.title")}
                    </Typography>
                    <Typography sx={{ mt: 2 }}>{t("welcome.text")}</Typography>
                    {conf.termsOfServiceUrl && (
                        <Typography sx={{ mt: 2 }}>
                            <Link href={conf.termsOfServiceUrl} target="_blank" variant="body2">
                                {t("welcome.terms")}
                            </Link>
                        </Typography>
                    )}
                </Box>
            </Stack>
        </Paper>
    );
}
