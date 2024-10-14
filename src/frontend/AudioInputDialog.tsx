import { SpeechToTextConfig } from "../shared/api";
import { ChatClient } from "./ChatClient";
import { AudioErrorCode, SpeechRecorder } from "./SpeechRecorder";
import { logThrownError } from "./log";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogProps, DialogTitle, Stack } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface AudioInputDialogProps extends DialogProps {
    onClose: () => void;
    isSmallScreen: boolean;
    sttConf: SpeechToTextConfig;
    client: ChatClient;
}

export default function AudioInputDialog({ onClose, isSmallScreen, sttConf, client, ...props }: AudioInputDialogProps) {
    const { t } = useTranslation();

    const [error, setError] = useState<AudioErrorCode>();
    const [onStop, setOnStop] = useState<() => void>();
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (props.open) {
            const recorder = new SpeechRecorder({ supportedAudioTypes: sttConf.supportedAudioTypes });
            recorder.addEventListener("state", () => {
                if (recorder.error !== error) {
                    setError(recorder.error);
                }
                if (recorder.recording && onStop === undefined) {
                    setOnStop(() => () => {
                        recorder.stop();
                    });

                    // Prepare chat connectivity, for faster response
                    client.prepareChat();
                }
            });
            recorder.addEventListener("audio", (event) => {
                setProcessing(true);
                client
                    .submitAudioMessage(event.blob)
                    .then(onClose)
                    .catch((err: unknown) => {
                        logThrownError("Failed to process audio", err);
                        setError("processing");
                    });
            });
            recorder.start();
            return () => {
                recorder.close();
            };
        }
    }, [props.open]);

    return (
        <Dialog
            fullScreen={isSmallScreen}
            onClose={() => {
                if (error || !onStop) onClose();
            }}
            {...props}
        >
            <DialogTitle>{t("audio.input")}</DialogTitle>
            <DialogContent>
                {error ? (
                    <Alert severity="error" variant="filled">
                        {t("audio.error." + error)}
                    </Alert>
                ) : processing ? (
                    <Alert severity="info">{t("audio.processing")}</Alert>
                ) : onStop !== undefined ? (
                    <Stack spacing={2}>
                        <Alert severity="info">{t("audio.recording")}</Alert>
                        <Button onClick={onStop} variant="contained" sx={{ padding: 2 }}>
                            {t("audio.stopRecording")}
                        </Button>
                    </Stack>
                ) : (
                    <Alert severity="info">{t("audio.initializingRecording")}</Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={onStop !== undefined}>
                    {t("close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
