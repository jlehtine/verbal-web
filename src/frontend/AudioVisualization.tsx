import { AudioAnalyserEventFunc } from "./AudioAnalyserEvent";
import { logThrownError } from "./log";
import { useTheme } from "@mui/material";
import React, { useEffect } from "react";

const MIN_DB = -60;
const MAX_DB = -3.1;
const SILENCE_RADIUS = 3;
const BUFFER_SAMPLES = 64;
const UPDATE_INTERVAL_MILLIS = 100;

export interface AudioVisualizationProps {
    size: number;
    refAudioAnalyserEventFunc: React.MutableRefObject<AudioAnalyserEventFunc<unknown> | undefined>;
}

export function AudioVisualization({ size, refAudioAnalyserEventFunc }: AudioVisualizationProps) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const theme = useTheme();

    useEffect(() => {
        let canvasFailed = false;
        let lastRendered: number;
        const audioAnalyserEventFunc: AudioAnalyserEventFunc<unknown> = (event) => {
            if (canvasRef.current) {
                if (lastRendered && event.timestamp - lastRendered < UPDATE_INTERVAL_MILLIS) {
                    return;
                } else {
                    lastRendered = event.timestamp;
                }
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
                        ctx.clearRect(0, 0, size, size);
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
                            const wf = (dbf * size) / 4;
                            const vf = dbf * (size / 2 - wf - SILENCE_RADIUS);

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
                                        size / 2 + Math.cos(angle) * radius,
                                        size / 2 + Math.sin(angle) * radius,
                                    );
                                } else {
                                    ctx.lineTo(
                                        size / 2 + Math.cos(angle) * radius,
                                        size / 2 + Math.sin(angle) * radius,
                                    );
                                }
                            }
                            ctx.fill();
                        }

                        // Or visualize silence
                        else {
                            ctx.beginPath();
                            ctx.ellipse(size / 2, size / 2, 3, 3, 0, 0, 2 * Math.PI);
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
        };
        refAudioAnalyserEventFunc.current = audioAnalyserEventFunc;
        return () => {
            refAudioAnalyserEventFunc.current = undefined;
        };
    }, []);

    return <canvas width={size} height={size} ref={canvasRef}></canvas>;
}
