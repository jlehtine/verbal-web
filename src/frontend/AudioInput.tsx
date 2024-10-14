import { SpeechToTextConfig } from "../shared/api";
import { ChatClient } from "./ChatClient";
import { AudioErrorCode, SpeechRecorder } from "./SpeechRecorder";
import { logThrownError } from "./log";
import CloseIcon from "@mui/icons-material/Close";
import StopIcon from "@mui/icons-material/Stop";
import { Alert, IconButton, Stack } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 48;
const MIN_DB = -60;
const MAX_DB = -3;

export interface AudioInputProps {
    onClose: () => void;
    isSmallScreen: boolean;
    sttConf: SpeechToTextConfig;
    client: ChatClient;
}

export default function AudioInput({ onClose, sttConf, client }: AudioInputProps) {
    const { t } = useTranslation();
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

                        // Clear canvas
                        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                        // Visualize audio waveform
                        const rms = event.rms;
                        ctx.fillStyle = "blue";
                        if (!event.silence) {
                            let maxabs = 0;
                            for (let i = 0; i < buflen; i++) {
                                const abs = Math.abs(tdata[i]);
                                if (abs > maxabs) {
                                    maxabs = abs;
                                }
                            }
                            let index = 0;
                            for (let i = 0; i < CANVAS_WIDTH; i++) {
                                const nextIndex = Math.floor(((i + 1) / CANVAS_WIDTH) * buflen);
                                let rv = 0;
                                for (let j = index; j < nextIndex; j++) {
                                    const d = tdata[j];
                                    if (rv === 0 || Math.abs(d) > Math.abs(rv)) {
                                        rv = d;
                                    }
                                }
                                const value = rv / maxabs;
                                const y0 = CANVAS_HEIGHT / 2;
                                const y1 = y0 + (CANVAS_HEIGHT / 2) * value;
                                const y = y0 < y1 ? y0 : y1;
                                const h = Math.abs(y0 - y1);
                                ctx.fillRect(i, y, 1, h);
                                index = nextIndex;
                            }
                        }

                        // Always display a horizontal line at the center
                        ctx.fillRect(0, CANVAS_HEIGHT / 2, CANVAS_WIDTH, 2);

                        // Visualize dB volume level
                        if (!event.silence) {
                            const db = 20 * Math.log10(rms);
                            if (db >= MIN_DB) {
                                const wr = ((CANVAS_WIDTH / 2) * (db - MIN_DB)) / (MAX_DB - MIN_DB);
                                ctx.strokeStyle = "red";
                                ctx.lineWidth = 4;
                                ctx.beginPath();
                                ctx.ellipse(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, wr, wr / 5, 0, 0, 2 * Math.PI);
                                ctx.stroke();
                            }
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
        <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3, mb: 3, mr: 2 }}>
            {error !== undefined ? (
                <Alert severity="error" variant="filled">
                    {t("audio.error." + error)}
                </Alert>
            ) : processing ? (
                <Alert severity="info">{t("audio.processing")}</Alert>
            ) : onStop === undefined ? (
                <Alert severity="info">{t("audio.initializingRecording")}</Alert>
            ) : (
                <Stack direction="row" spacing={2}>
                    <Alert severity="info">{t("audio.recording")}</Alert>
                    <canvas width={CANVAS_WIDTH} height={CANVAS_HEIGHT} ref={canvasRef}></canvas>
                </Stack>
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
