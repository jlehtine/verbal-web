import LoadingIndicator from "./LoadingIndicator";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { defaultTheme } from "./defaultTheme";
import "./i18n";
import load from "./load";
import AssistantIcon from "@mui/icons-material/Assistant";
import { Box, Button, ThemeProvider, Tooltip } from "@mui/material";
import React, { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";

interface VerbalWebUIProps {
    conf: VerbalWebConfiguration;
}

/** HTML class name for the Verbal Web assistant */
export const VERBAL_WEB_ASSISTANT_CLASS_NAME = "verbal-web-assistant";

/** HTML class name for the Verbal Web assistant dialog */
export const VERBAL_WEB_ASSISTANT_DIALOG_CLASS_NAME = "verbal-web-assistant-dialog";

export default function VerbalWebUI({ conf }: VerbalWebUIProps) {
    const { t } = useTranslation();

    const [open, setOpen] = useState(false);

    // Lazy load the dialog code
    const VerbalWebDialog = lazy(() =>
        load(conf, "dialog", () => import(/* webpackPrefetch: true */ "./VerbalWebDialog")),
    );

    return (
        <ThemeProvider theme={defaultTheme()}>
            <Box className={VERBAL_WEB_ASSISTANT_CLASS_NAME}>
                <Tooltip title={t("launch.tooltip")}>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => {
                            setOpen(true);
                        }}
                        startIcon={<AssistantIcon />}
                    >
                        {t("launch.text")}
                    </Button>
                </Tooltip>
                {open ? (
                    <Suspense fallback={<LoadingIndicator conf={conf} />}>
                        <VerbalWebDialog
                            conf={conf}
                            open={true}
                            onClose={() => {
                                setOpen(false);
                            }}
                            className={VERBAL_WEB_ASSISTANT_DIALOG_CLASS_NAME}
                        />
                    </Suspense>
                ) : null}
            </Box>
        </ThemeProvider>
    );
}
