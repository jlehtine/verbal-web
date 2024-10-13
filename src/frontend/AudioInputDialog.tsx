import { SpeechToTextConfig } from "../shared/api";
import { VerbalWebError } from "../shared/error";
import { ChatClient } from "./ChatClient";
import { AudioErrorCode, toAudioErrorCode } from "./audio";
import { logDebug, logError } from "./log";
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
        let stopped = false;
        let mediaRecorder: MediaRecorder | undefined;
        let mediaStream: MediaStream | undefined;
        const stopRecording = () => {
            stopped = true;
            if (mediaRecorder !== undefined && mediaRecorder.state !== "inactive") {
                logDebug("Stop audio recording");
                mediaRecorder.stop();
            }
            if (mediaStream !== undefined) {
                mediaStream.getTracks().forEach((track) => {
                    track.stop();
                });
                mediaStream = undefined;
            }
        };
        if (props.open) {
            navigator.mediaDevices
                .getUserMedia({
                    audio: {
                        channelCount: 1,
                        sampleRate: 8000,
                        sampleSize: 8,
                        autoGainControl: true,
                        noiseSuppression: true,
                    },
                })
                .then((stream) => {
                    mediaStream = stream;
                    if (stopped) {
                        stopRecording();
                        return;
                    }
                    mediaRecorder = new MediaRecorder(stream, {
                        mimeType: getAudioType(sttConf.supportedAudioTypes),
                    });
                    mediaRecorder.ondataavailable = (event: BlobEvent) => {
                        if (event.data.size > 0) {
                            logDebug("Processing recorded audio");
                            setProcessing(true);
                            client
                                .submitAudioMessage(event.data)
                                .then(onClose)
                                .catch((err: unknown) => {
                                    logError("Failed to process audio: %o", err);
                                    setError("processing");
                                });
                        }
                    };
                    logDebug("Start audio recording");
                    mediaRecorder.start();
                    setOnStop(() => stopRecording);
                })
                .catch((err: unknown) => {
                    logError("Audio failed: %o", err);
                    setError(toAudioErrorCode(err));
                    stopRecording();
                });
            return () => {
                stopRecording();
                setError(undefined);
                setOnStop(undefined);
                setProcessing(false);
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

function getAudioType(supportedTypes: string[]) {
    for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    throw new VerbalWebError("No supported audio format available");
}
