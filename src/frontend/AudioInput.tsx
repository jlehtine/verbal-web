import { RealtimeConfig, SpeechToTextConfig } from "../shared/api";
import { AudioAnalyserEventFunc } from "./AudioAnalyserEvent";
import { AudioMode } from "./AudioMode";
import { AudioVisualization } from "./AudioVisualization";
import { ChatClient } from "./ChatClient";
import { AudioErrorCode, SpeechRecorder } from "./SpeechRecorder";
import { logThrownError } from "./log";
import CloseIcon from "@mui/icons-material/Close";
import StopIcon from "@mui/icons-material/Stop";
import { Alert, Box, IconButton, Stack, useTheme } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const VISUALIZATION_SIZE = 64;

export type AudioInputProps = AudioInputSttProps | AudioInputRealtimeProps;

interface AudioInputCommonProps {
    mode: AudioMode;
    onClose: () => void;
    client: ChatClient;
}

interface AudioInputSttProps extends AudioInputCommonProps {
    mode: "stt";
    sttConf: SpeechToTextConfig;
}

interface AudioInputRealtimeProps extends AudioInputCommonProps {
    mode: "realtime";
    realtimeConf: RealtimeConfig;
}

export default function AudioInput(props: AudioInputProps) {
    const { mode, onClose, client } = props;

    const { t } = useTranslation();
    const theme = useTheme();
    const refAudioAnalyserEventFunc = React.useRef<AudioAnalyserEventFunc<unknown>>();

    const [error, setError] = useState<AudioErrorCode>();
    const [processing, setProcessing] = useState(false);
    const [realtimePending, setRealtimePending] = useState(false);
    const [onStop, setOnStop] = useState<() => void>();

    useEffect(() => {
        let realtimeStarted = false;
        const recorder = new SpeechRecorder(
            mode === "stt"
                ? {
                      mode,
                      supportedAudioTypes: props.sttConf.supportedAudioTypes,
                      stopOnSilence: true,
                  }
                : {
                      mode,
                      supportedInputAudioTypes: props.realtimeConf.supportedInputAudioTypes,
                      supportedOutputAudioTypes: props.realtimeConf.supportedOutputAudioTypes,
                  },
        );
        recorder.addEventListener("state", () => {
            if (recorder.error !== error) {
                recorder.close();
                setError(recorder.error);
            }
            if (recorder.recording && onStop === undefined) {
                if (mode === "realtime") {
                    if (!realtimeStarted) {
                        setRealtimePending(true);
                        client.startRealtime();
                        realtimeStarted = true;
                    }
                } else {
                    // Prepare chat connectivity, for faster response
                    client.prepareChat();
                    setOnStop(() => () => {
                        recorder.stop();
                        setProcessing(true);
                    });
                }
            }
        });
        recorder.addEventListener("audio", (event) => {
            client
                .submitAudioMessage(event.blob)
                .then(onClose)
                .catch((err: unknown) => {
                    logThrownError("Failed to process audio", err);
                    setError("processing");
                });
        });
        recorder.addEventListener("analyser", (event) => {
            if (refAudioAnalyserEventFunc.current) {
                refAudioAnalyserEventFunc.current(event);
            }
        });
        const onChatEvent = () => {
            if (client.chat.error !== undefined) {
                recorder.close();
                if (error === undefined) {
                    if (mode === "realtime") {
                        setError("realtime");
                    } else {
                        setError("processing");
                    }
                }
            }
            if (client.realtimeStarted && onStop === undefined) {
                setRealtimePending(false);
                recorder.addEventListener("rtaudio", (event) => {
                    client.submitRealtimeAudio(event.buffer);
                });
                setOnStop(() => () => {
                    recorder.close();
                    client.stopRealtime();
                    onClose();
                });
            }
        };
        client.addEventListener("chat", onChatEvent);
        recorder.start();
        return () => {
            recorder.close();
            client.removeEventListener("chat", onChatEvent);
            if (mode === "realtime") {
                client.stopRealtime();
            }
        };
    }, []);

    return (
        <Box sx={{ mt: 2 }}>
            <Stack direction="row" spacing={2} justifyContent="flex-end" alignItems="center">
                {error !== undefined ? (
                    <Alert severity="error" variant="filled">
                        {t("audio.error." + error)}
                    </Alert>
                ) : processing ? (
                    <Alert severity="info">{t("audio.processing")}</Alert>
                ) : realtimePending ? (
                    <Alert severity="info">{t("audio.realtimePending")}</Alert>
                ) : onStop === undefined ? (
                    <Alert severity="info">{t("audio.initializingRecording")}</Alert>
                ) : (
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Alert severity="info">{t("audio.recording")}</Alert>
                        <AudioVisualization
                            size={VISUALIZATION_SIZE}
                            refAudioAnalyserEventFunc={refAudioAnalyserEventFunc}
                        />
                    </Stack>
                )}
                <Box sx={{ pt: 1.5, pb: 1.5, pr: 1.5 }}>
                    {error !== undefined || processing || onStop === undefined ? (
                        <IconButton onClick={onClose}>
                            <CloseIcon />
                        </IconButton>
                    ) : (
                        <IconButton onClick={onStop} sx={{ color: theme.palette.error.main }}>
                            <StopIcon />
                        </IconButton>
                    )}
                </Box>
            </Stack>
        </Box>
    );
}
