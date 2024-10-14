import { SpeechToTextConfig } from "../shared/api";
import { ChatClient } from "./ChatClient";
import { AudioErrorCode, SpeechRecorder } from "./SpeechRecorder";
import { logThrownError } from "./log";
import CloseIcon from "@mui/icons-material/Close";
import StopIcon from "@mui/icons-material/Stop";
import { Alert, IconButton, Stack } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface AudioInputProps {
    onClose: () => void;
    isSmallScreen: boolean;
    sttConf: SpeechToTextConfig;
    client: ChatClient;
}

export default function AudioInput({ onClose, sttConf, client }: AudioInputProps) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);

    const [error, setError] = useState<AudioErrorCode>();
    const [processing, setProcessing] = useState(false);
    const [onStop, setOnStop] = useState<() => void>();

    useEffect(() => {
        const recorder = new SpeechRecorder({
            supportedAudioTypes: sttConf.supportedAudioTypes,
            stopAfterSilenceMillis: true,
        });
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
    }, []);

    return (
        <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3, mb: 3, mr: 2 }} ref={ref}>
            {error !== undefined ? (
                <Alert severity="error" variant="filled">
                    {t("audio.error." + error)}
                </Alert>
            ) : processing ? (
                <Alert severity="info">{t("audio.processing")}</Alert>
            ) : onStop === undefined ? (
                <Alert severity="info">{t("audio.initializingRecording")}</Alert>
            ) : (
                <Alert severity="info">{t("audio.recording")}</Alert>
            )}
            {error !== undefined || processing || onStop === undefined ? (
                <IconButton onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            ) : (
                <IconButton onClick={onStop} sx={{ color: "red" }}>
                    <StopIcon />
                </IconButton>
            )}
        </Stack>
    );
}
