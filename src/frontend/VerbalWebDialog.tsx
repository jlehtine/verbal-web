import VerbalWebConfiguration from "./VerbalWebConfiguration";
import VerbalWebView from "./VerbalWebView";
import { VERBAL_WEB_CLASS_NAME } from "./extract";
import CloseIcon from "@mui/icons-material/Close";
import {
    Box,
    Dialog,
    DialogContent,
    DialogProps,
    DialogTitle,
    DialogTitleProps,
    IconButton,
    Stack,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";

export interface VerbalWebDialogProps extends DialogProps {
    conf: VerbalWebConfiguration;
    onClose?: () => void;
}

/** Verbal Web dialog */
export default function VerbalWebDialog({ conf, ...dialogProps }: VerbalWebDialogProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const contentRef = useRef<HTMLElement>();

    return (
        <Dialog
            {...dialogProps}
            {...(fullScreen ? { fullScreen: true } : { fullWidth: true, maxWidth: "lg" })}
            className={VERBAL_WEB_CLASS_NAME}
            PaperProps={fullScreen ? {} : { sx: { height: "90%" } }}
        >
            <VerbalWebDialogTitle onClose={dialogProps.onClose}>{t("dialog.title")}</VerbalWebDialogTitle>
            <DialogContent dividers ref={contentRef}>
                <VerbalWebView conf={conf} fullHeight scrollRef={contentRef} />
            </DialogContent>
        </Dialog>
    );
}

interface VerbalWebDialogTitleProps extends DialogTitleProps {
    onClose?: () => void;
}

function VerbalWebDialogTitle(props: VerbalWebDialogTitleProps) {
    const { children, onClose } = props;

    return (
        <DialogTitle variant="subtitle1">
            <Stack direction="row" justifyContent="space-between">
                <Box>{children}</Box>
                <Box>
                    {onClose ? (
                        <IconButton aria-label="close" onClick={onClose}>
                            <CloseIcon />
                        </IconButton>
                    ) : null}
                </Box>
            </Stack>
        </DialogTitle>
    );
}
