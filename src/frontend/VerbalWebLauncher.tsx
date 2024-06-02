import LoadingIndicator from "./LoadingIndicator";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { VERBAL_WEB_CLASS_NAME } from "./extract";
import load from "./load";
import AssistantIcon from "@mui/icons-material/Assistant";
import { Box, Button, Tooltip } from "@mui/material";
import React, { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";

export interface VerbalWebLauncherProps {
    conf: VerbalWebConfiguration;
}

/**
 * Launcher button for the Verbal Web dialog.
 */
export default function VerbalWebLauncher({ conf }: VerbalWebLauncherProps) {
    const { t } = useTranslation();

    const [open, setOpen] = useState(false);

    // Lazy load the dialog code
    const VerbalWebDialog = lazy(() =>
        load("VerbalWebDialog", conf, "dialog", () => import(/* webpackPrefetch: true */ "./VerbalWebDialog")),
    );

    return (
        <Box className={VERBAL_WEB_CLASS_NAME}>
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
                    />
                </Suspense>
            ) : null}
        </Box>
    );
}
