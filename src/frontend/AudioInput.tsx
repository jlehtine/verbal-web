import { SpeechToTextConfig } from "../shared/api";
import { ChatClient } from "./ChatClient";
import { AudioErrorCode, SpeechRecorder } from "./SpeechRecorder";
import { logThrownError } from "./log";
import CloseIcon from "@mui/icons-material/Close";
import StopIcon from "@mui/icons-material/Stop";
import { Alert, Box, IconButton, Stack, useTheme } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const CANVAS_SIZE = 64;
const MIN_DB = -60;
const MAX_DB = -3.1;
const SILENCE_RADIUS = 3;
const BUFFER_SAMPLES = 64;

export interface AudioInputProps {
    onClose: () => void;
    sttConf: SpeechToTextConfig;
    client: ChatClient;
}

export default function AudioInput({ onClose, sttConf, client }: AudioInputProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [error, setError] = useState<AudioErrorCode>();
    const [processing, setProcessing] = useState(false);
    const [onStop, setOnStop] = useState<() => void>();

    useEffect(() => {
        const recorder = new SpeechRecorder({
            supportedAudioTypes: sttConf.supportedAudioTypes,
            stopOnSilence: true,
        });
        let canvasFailed = false;
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
        recorder.addEventListener("analyser", (event) => {
            if (canvasRef.current) {
                try {
                    const c = canvasRef.current;
                    const ctx = c.getContext("2d", { alpha: true, willReadFrequently: false });
                    if (ctx) {
                        const analyser = event.analyser;
                        const buflen = analyser.frequencyBinCount;
                        const tdata = new Float32Array(buflen);
                        analyser.getFloatTimeDomainData(tdata);

                        // Volume in dB
                        const db = 20 * Math.log10(event.rms);

                        // Clear canvas
                        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                        ctx.fillStyle = theme.palette.primary.main;

                        // Visualize volume and audio waveform
                        if (!event.silence && db > MIN_DB) {
                            // Calculate the scaling factor for wave form
                            let maxabs = 0;
                            for (let i = 0; i < buflen; i++) {
                                const abs = Math.abs(tdata[i]);
                                if (abs > maxabs) {
                                    maxabs = abs;
                                }
                            }
                            const normf = maxabs === 0 ? 1 : 1 / maxabs;

                            // Volume factor
                            const dbf = Math.min((db - MIN_DB) / (MAX_DB - MIN_DB), 1);
                            const wf = (dbf * CANVAS_SIZE) / 4;
                            const vf = dbf * (CANVAS_SIZE / 2 - wf - SILENCE_RADIUS);

                            // Draw waveform amplified by volume factor
                            const samples = Math.min(BUFFER_SAMPLES, buflen);
                            const points = 2 * samples - 2;
                            ctx.beginPath();
                            for (let i = 0; i < points; i++) {
                                const index = i < samples ? i : 2 * samples - i - 1;
                                const angle = (i / points + event.timestamp / 10000) * Math.PI * 2;
                                const radius = SILENCE_RADIUS + vf + tdata[index] * normf * wf;
                                if (i === 0) {
                                    ctx.moveTo(
                                        CANVAS_SIZE / 2 + Math.cos(angle) * radius,
                                        CANVAS_SIZE / 2 + Math.sin(angle) * radius,
                                    );
                                } else {
                                    ctx.lineTo(
                                        CANVAS_SIZE / 2 + Math.cos(angle) * radius,
                                        CANVAS_SIZE / 2 + Math.sin(angle) * radius,
                                    );
                                }
                            }
                            ctx.fill();
                        }

                        // Or visualize silence
                        else {
                            ctx.beginPath();
                            ctx.ellipse(CANVAS_SIZE / 2, CANVAS_SIZE / 2, 3, 3, 0, 0, 2 * Math.PI);
                            ctx.fill();
                        }
                    }
                } catch (err: unknown) {
                    if (!canvasFailed) {
                        logThrownError("Failed to draw audio waveform", err);
                        canvasFailed = true;
                    }
                }
            }
        });
        recorder.start();
        return () => {
            recorder.close();
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
                ) : onStop === undefined ? (
                    <Alert severity="info">{t("audio.initializingRecording")}</Alert>
                ) : (
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Alert severity="info">{t("audio.recording")}</Alert>
                        <canvas width={CANVAS_SIZE} height={CANVAS_SIZE} ref={canvasRef}></canvas>
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
