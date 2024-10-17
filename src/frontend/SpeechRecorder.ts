import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { AudioAnalyserEvent, AudioAnalyserEventMap, AudioAnalyserEventTarget } from "./AudioAnalyserEvent";
import { logDebug, logThrownError } from "./log";

const TARGET_SAMPLE_RATE = 8000;
const TARGET_SAMPLE_SIZE = 16;
const FFT_SIZE = 1024;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MILLIS = 2000;
const SOUND_DURATION_MILLIS = 1000;
const RMS_AVERAGING_WINDOW = 20;

export const SUPPORTED_REALTIME_INPUT_AUDIO_TYPE = "audio/PCMA";

export type AudioErrorCode = "general" | "notfound" | "notallowed" | "processing" | "realtime";

export type SpeechRecorderParams = SpeechRecorderSttParams | SpeechRecorderRealtimeParams;

export interface SpeechRecorderSttParams {
    mode: "stt";
    supportedAudioTypes: string[];
    stopOnSilence?: boolean;
}

export interface SpeechRecorderRealtimeParams {
    mode: "realtime";
    supportedInputAudioTypes: string[];
    supportedOutputAudioTypes: string[];
}

/**
 * Records speech from the microphone.
 */
export class SpeechRecorder
    extends TypedEventTarget<SpeechRecorder, SpeechRecorderEventMap>
    implements AudioAnalyserEventTarget<SpeechRecorder>
{
    private readonly params: SpeechRecorderParams;
    private started = false;
    private stopped = false;
    private readonly rmsSamples = new Float32Array(RMS_AVERAGING_WINDOW);
    private rmsSampleHead = 0;
    private rmsSampleNum = 0;
    private rmsSampleSum = 0;
    private silenceStartedAt: number | undefined;
    private soundStartedAt: number | undefined;
    private soundDetected = false;
    private tryRequestAnimationFrame = typeof requestAnimationFrame === "function";

    recording = false;
    error: AudioErrorCode | undefined;

    private mediaRecorder: MediaRecorder | undefined;
    private mediaStream: MediaStream | undefined;
    private audioContext: AudioContext | undefined;
    private audioSource: MediaStreamAudioSourceNode | undefined;
    private g711aEncoder: AudioWorkletNode | undefined;
    private analyser: AnalyserNode | undefined;

    constructor(params: SpeechRecorderParams) {
        super();
        this.params = params;
    }

    /**
     * Starts recording.
     */
    start() {
        const mode = this.params.mode;
        if (this.started) {
            throw new VerbalWebError("SpeechRecorder already started");
        }
        this.started = true;
        try {
            navigator.mediaDevices
                .getUserMedia({
                    audio: {
                        channelCount: 1,
                        sampleRate: TARGET_SAMPLE_RATE,
                        sampleSize: TARGET_SAMPLE_SIZE,
                        autoGainControl: true,
                        noiseSuppression: true,
                    },
                })
                .then((stream) => {
                    this.mediaStream = stream;

                    // Abort if already stopped
                    if (this.stopped) {
                        this.stop();
                        return;
                    }
                    logDebug("Start audio recording");

                    // Check realtime audio type
                    if (mode === "realtime") {
                        getRealtimeInputAudioType(this.params.supportedInputAudioTypes);
                    }

                    // Initialize media recorder, for speech-to-text
                    if (mode === "stt") {
                        this.mediaRecorder = new MediaRecorder(stream, {
                            mimeType: getMediaRecorderAudioType(this.params.supportedAudioTypes),
                        });
                        this.mediaRecorder.addEventListener("dataavailable", (event: BlobEvent) => {
                            if (event.data.size > 0) {
                                logDebug("Processing recorded audio");
                                const audioEvent: SpeechRecorderAudioEvent = {
                                    target: this,
                                    type: "audio",
                                    blob: event.data,
                                };
                                this.dispatchEvent(audioEvent);
                            }
                        });
                    }

                    // Initialize audio context and source
                    try {
                        this.audioContext = new AudioContext();
                        this.audioSource = this.audioContext.createMediaStreamSource(stream);
                    } catch (err: unknown) {
                        if (mode === "realtime") {
                            throw err;
                        } else {
                            logThrownError("Audio visualization failed", err);
                        }
                    }

                    // Initialize audio analyser, if possible
                    try {
                        if (this.audioContext && this.audioSource) {
                            this.analyser = this.audioContext.createAnalyser();
                            this.analyser.fftSize = FFT_SIZE;
                            this.audioSource.connect(this.analyser);
                            this.scheduleAnalyzeAudio();
                            logDebug("Started audio analysis");
                        }
                    } catch (err: unknown) {
                        logThrownError("Audio visualization failed", err);
                    }

                    // Initialize G711 A-law encoder, for realtime
                    if (mode === "realtime" && this.audioContext && this.audioSource) {
                        logDebug("Initializing G711 A-law encoder");
                        this.audioContext.audioWorklet
                            .addModule("G711AEncoder.js")
                            .then(() => {
                                if (!this.stopped && this.audioContext && this.audioSource) {
                                    this.g711aEncoder = new AudioWorkletNode(this.audioContext, "G711AEncoder");
                                    this.g711aEncoder.port.onmessage = (event) => {
                                        const data: unknown = event.data;
                                        if (data instanceof Uint8Array) {
                                            const audioEvent: SpeechRecorderRealtimeAudioEvent = {
                                                target: this,
                                                type: "rtaudio",
                                                buffer: data.buffer,
                                            };
                                            this.dispatchEvent(audioEvent);
                                        }
                                    };
                                    this.audioSource.connect(this.g711aEncoder);
                                    this.recording = true;
                                    this.stateChanged();
                                    logDebug("G711 A-law encoder started");
                                }
                            })
                            .catch((err: unknown) => {
                                this.handleError(err);
                            });
                    }

                    // Start audio recording, for speech-to-text
                    if (this.mediaRecorder !== undefined) {
                        this.mediaRecorder.start();
                        this.recording = true;
                        this.stateChanged();
                    }
                })
                .catch((err: unknown) => {
                    this.handleError(err);
                });
        } catch (err: unknown) {
            this.handleError(err);
        }
    }

    private handleError(err: unknown) {
        logThrownError("Audio initialization failed", err);
        this.error = toAudioErrorCode(err);
        this.stateChanged();
        this.close();
    }

    /**
     * Stops recording.
     */
    stop() {
        if (!this.stopped) {
            logDebug("Stop audio recording");
        }
        this.stopped = true;
        if (this.analyser !== undefined) {
            this.analyser.disconnect();
            this.analyser = undefined;
        }
        if (this.g711aEncoder !== undefined) {
            this.g711aEncoder.disconnect();
            this.g711aEncoder = undefined;
        }
        if (this.audioSource !== undefined) {
            this.audioSource.disconnect();
            this.audioSource = undefined;
        }
        if (this.audioContext !== undefined) {
            this.audioContext.close().catch((err: unknown) => {
                logThrownError("AudioContext close failed", err);
            });
            this.audioContext = undefined;
        }
        if (this.mediaRecorder !== undefined && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
        }
        if (this.mediaStream !== undefined) {
            this.mediaStream.getTracks().forEach((track) => {
                track.stop();
            });
            this.mediaStream = undefined;
        }
    }

    /**
     * Closes the recorder.
     */
    close() {
        this.clearListeners();
        this.stop();
        this.mediaRecorder = undefined;
    }

    private stateChanged() {
        this.dispatchEvent({ target: this, type: "state" });
    }

    private scheduleAnalyzeAudio() {
        if (!this.stopped) {
            if (this.tryRequestAnimationFrame) {
                try {
                    requestAnimationFrame((timestamp) => {
                        this.analyzeAudio(timestamp);
                    });
                    return;
                } catch (err: unknown) {
                    logThrownError("requestAnimationFrame failed, falling back to setting timeouts", err);
                    this.tryRequestAnimationFrame = false;
                }
            }
            setTimeout(() => {
                this.analyzeAudio(performance.now());
            }, 1000 / 60);
        }
    }

    private analyzeAudio(timestamp: number) {
        const analyser = this.analyser;
        if (!this.stopped && analyser) {
            // RMS volume level
            const buflen = analyser.frequencyBinCount;
            const tdata = new Float32Array(buflen);
            analyser.getFloatTimeDomainData(tdata);
            let sum = 0;
            for (let i = 0; i < buflen; i++) {
                sum += tdata[i];
            }
            const mean = sum / buflen;
            let sqsum = 0;
            for (let i = 0; i < buflen; i++) {
                const v = tdata[i] - mean;
                sqsum += v * v;
            }
            const rmsnow = Math.sqrt(sqsum / buflen);

            // RMS averaging
            if (this.rmsSampleNum < RMS_AVERAGING_WINDOW) {
                this.rmsSampleNum++;
            } else {
                this.rmsSampleSum -= this.rmsSamples[this.rmsSampleHead];
            }
            this.rmsSamples[this.rmsSampleHead] = rmsnow;
            this.rmsSampleSum += rmsnow;
            this.rmsSampleHead = (this.rmsSampleHead + 1) % RMS_AVERAGING_WINDOW;
            const rms = this.rmsSampleSum / this.rmsSampleNum;

            // Silence detection
            let silence;
            const stopOnSilence = this.params.mode === "stt" && this.params.stopOnSilence;
            if (rms < SILENCE_THRESHOLD) {
                if (this.silenceStartedAt === undefined) {
                    this.silenceStartedAt = timestamp;
                }
                if (
                    this.soundDetected &&
                    stopOnSilence &&
                    timestamp - this.silenceStartedAt > SILENCE_DURATION_MILLIS
                ) {
                    this.stop();
                }
                silence = true;
            } else {
                this.silenceStartedAt = undefined;
                silence = false;
            }
            if (!this.soundDetected && rms > SILENCE_THRESHOLD) {
                if (this.soundStartedAt === undefined) {
                    this.soundStartedAt = timestamp;
                }
                if (timestamp - this.soundStartedAt > SOUND_DURATION_MILLIS) {
                    this.soundDetected = true;
                }
            }

            // Send analyser event
            const event: AudioAnalyserEvent<SpeechRecorder> = {
                target: this,
                type: "analyser",
                timestamp,
                analyser,
                rms,
                silence,
            };
            this.dispatchEvent(event);

            // Schedule next round
            this.scheduleAnalyzeAudio();
        }
    }
}

function getMediaRecorderAudioType(supportedAudioTypes: string[]) {
    for (const audioType of supportedAudioTypes) {
        if (MediaRecorder.isTypeSupported(audioType)) {
            return audioType;
        }
    }
    throw new VerbalWebError("No supported audio format available");
}

export function getRealtimeInputAudioType(supportedInputAudioTypes: string[]) {
    for (const audioType of supportedInputAudioTypes) {
        if (audioType === SUPPORTED_REALTIME_INPUT_AUDIO_TYPE) {
            return audioType;
        }
    }
    throw new VerbalWebError("No supported audio format available");
}

interface SpeechRecorderEventMap extends AudioAnalyserEventMap<SpeechRecorder> {
    state: SpeechRecorderStateEvent;
    audio: SpeechRecorderAudioEvent;
    rtaudio: SpeechRecorderRealtimeAudioEvent;
}

export type SpeechRecorderStateEvent = TypedEvent<SpeechRecorder, "state">;

export interface SpeechRecorderAudioEvent extends TypedEvent<SpeechRecorder, "audio"> {
    blob: Blob;
}

export interface SpeechRecorderRealtimeAudioEvent extends TypedEvent<SpeechRecorder, "rtaudio"> {
    buffer: ArrayBuffer;
}

function toAudioErrorCode(err: unknown): AudioErrorCode {
    if (typeof err === "object") {
        if (err instanceof DOMException) {
            const name = err.name;
            if (name === "NotFoundError" || name === "OverconstrainedError") {
                return "notfound";
            } else if (name === "NotAllowedError" || name === "SecurityError") {
                return "notallowed";
            }
        }
    }
    return "general";
}
