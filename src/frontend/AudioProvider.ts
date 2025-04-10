import { G711ADecoder } from "../shared/G711ADecoder";
import { G711AEncoder } from "../shared/G711AEncoder";
import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { isFloat32Array3, isObject } from "../shared/util";
import { AudioAnalyserEvent, AudioAnalyserEventMap, AudioAnalyserEventTarget } from "./AudioAnalyserEvent";
import { logDebug, logThrownError } from "./log";

const INPUT_SAMPLE_RATE = 8000;
const INPUT_SAMPLE_SIZE = 16;
const INPUT_BUFFER_DISPATCH_SIZE = 4096;
const FFT_SIZE = 1024;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MILLIS = 500;
const SILENCE_STOP_DURATION_MILLIS = 2000;
const SOUND_DURATION_MILLIS = 1000;
const RMS_AVERAGING_WINDOW = 20;
const OUTPUT_SAMPLE_RATE = 24000;

export const SUPPORTED_REALTIME_INPUT_AUDIO_TYPE = "audio/PCMA;rate=8000;channels=1";
export const SUPPORTED_REALTIME_OUTPUT_AUDIO_TYPE = "audio/PCMA;rate=24000;channels=1";

export class AudioError extends VerbalWebError {
    constructor(msg: string, options?: ErrorOptions) {
        super(msg, options);
        this.name = "AudioError";
    }
}

export type AudioErrorCode = "general" | "notfound" | "notallowed" | "processing" | "realtime" | "warning" | "noaudio";

export type AudioParams = AudioSttParams | AudioRealtimeParams;

export interface AudioSttParams {
    mode: "stt";
    supportedAudioTypes: string[];
    stopOnSilence?: boolean;
}

export interface AudioRealtimeParams {
    mode: "realtime";
    supportedInputAudioTypes: string[];
    supportedOutputAudioTypes: string[];
}

/**
 * Records speech from the microphone.
 */
export class AudioProvider
    extends TypedEventTarget<AudioProvider, AudioProviderEventMap>
    implements AudioAnalyserEventTarget<AudioProvider>
{
    private readonly params: AudioParams;
    private started = false;
    private readonly rmsSamples = new Float32Array(RMS_AVERAGING_WINDOW);
    private rmsSampleHead = 0;
    private rmsSampleNum = 0;
    private rmsSampleSum = 0;
    private silenceStartedAt: number | undefined;
    private soundStartedAt: number | undefined;
    private silenceDetected = true;
    private silenceDetectedPrev = true;
    private soundDetected = false;
    private audioRecorded = false;
    private tryRequestAnimationFrame = typeof requestAnimationFrame === "function";
    private inputBuffers: Float32Array[][] = [];
    private inputBufferCount = 0;

    error: AudioErrorCode | undefined;
    recording = false;
    stopped = false;

    private mediaStream: MediaStream | undefined;
    private audioInContext: AudioContext | undefined;
    private audioOutContext: AudioContext | undefined;
    private audioSource: MediaStreamAudioSourceNode | undefined;
    private audioInput: AudioWorkletNode | undefined;
    private audioOutput: AudioWorkletNode | undefined;
    private g711aEncoder: G711AEncoder | undefined;
    private audioSampleRate: number | undefined;
    private readonly g711aDecoder = new G711ADecoder();
    private analyser: AnalyserNode | undefined;

    constructor(params: AudioParams) {
        super();
        this.params = params;
    }

    /**
     * Starts recording.
     */
    start() {
        const mode = this.params.mode;
        if (this.started) {
            throw new VerbalWebError("AudioProvider already started");
        }
        this.started = true;
        try {
            navigator.mediaDevices
                .getUserMedia({
                    audio: {
                        channelCount: 1,
                        sampleRate: INPUT_SAMPLE_RATE,
                        sampleSize: INPUT_SAMPLE_SIZE,
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
                        getRealtimeOutputAudioType(this.params.supportedOutputAudioTypes);
                    } else {
                        getRealtimeInputAudioType(this.params.supportedAudioTypes);
                    }

                    // Initialize input audio context and analyser
                    this.audioInContext = new AudioContext();
                    this.audioSource = this.audioInContext.createMediaStreamSource(stream);
                    this.analyser = this.audioInContext.createAnalyser();
                    this.analyser.fftSize = FFT_SIZE;
                    this.audioSource.connect(this.analyser);
                    this.scheduleAnalyzeAudio();
                    logDebug("Started audio analysis");

                    // Initialize audio worklet for input
                    logDebug("Initializing audio input worklet");
                    this.audioInContext.audioWorklet
                        .addModule("VerbalWebAudioInput.js")
                        .then(() => {
                            // Push to input buffers array
                            const pushInputBuffer = (buffer: Float32Array[]) => {
                                this.inputBuffers.push(buffer);
                                this.inputBufferCount += buffer[0].length;
                            };

                            // Dispatch audio data as event
                            const dispatchInputBuffers = () => {
                                if (this.g711aEncoder) {
                                    const event: AudioProviderAudioEvent = {
                                        target: this,
                                        type: "audio",
                                        buffer: this.g711aEncoder.encodeFloat32(
                                            this.inputBuffers,
                                            this.audioSampleRate,
                                        ),
                                    };
                                    this.dispatchEvent(event);
                                    this.inputBuffers = [];
                                    this.inputBufferCount = 0;
                                    this.audioRecorded = true;
                                }
                            };

                            if (!this.stopped && this.audioInContext && this.audioSource) {
                                this.audioInput = new AudioWorkletNode(this.audioInContext, "VerbalWebAudioInput");
                                this.audioInput.port.onmessage = (event) => {
                                    const data: unknown = event.data;
                                    if (
                                        isObject(data) &&
                                        typeof data.sampleRate === "number" &&
                                        isFloat32Array3(data.inputs)
                                    ) {
                                        if (this.g711aEncoder === undefined) {
                                            this.g711aEncoder = new G711AEncoder(INPUT_SAMPLE_RATE);
                                            this.audioSampleRate = data.sampleRate;
                                        }
                                        const silent = this.silenceDetected && this.silenceDetectedPrev;
                                        pushInputBuffer(data.inputs[0]);
                                        if (silent) {
                                            let skip = 0;
                                            while (
                                                skip < this.inputBuffers.length - 1 &&
                                                this.inputBufferCount > INPUT_BUFFER_DISPATCH_SIZE
                                            ) {
                                                this.inputBufferCount -= this.inputBuffers[skip][0].length;
                                                skip++;
                                            }
                                            this.inputBuffers = this.inputBuffers.slice(skip);
                                        } else {
                                            if (this.inputBufferCount >= INPUT_BUFFER_DISPATCH_SIZE) {
                                                dispatchInputBuffers();
                                            }
                                            if (this.silenceDetected && this.inputBufferCount > 0) {
                                                dispatchInputBuffers();
                                            }
                                        }
                                        this.silenceDetectedPrev = this.silenceDetected;
                                    }
                                };
                                this.audioSource.connect(this.audioInput);
                                this.recording = true;
                                this.stateChanged();
                                logDebug("Audio input worklet initialized");
                            }
                        })
                        .catch((err: unknown) => {
                            this.handleError(err);
                        });

                    // Realtime output audio processing
                    if (mode === "realtime") {
                        // Initialize PCM 16-bit signed little-endian decoder for output
                        this.audioOutContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
                        logDebug("Initializing audio output worklet");
                        this.audioOutContext.audioWorklet
                            .addModule("VerbalWebAudioOutput.js")
                            .then(() => {
                                if (!this.stopped && this.audioOutContext) {
                                    this.audioOutput = new AudioWorkletNode(
                                        this.audioOutContext,
                                        "VerbalWebAudioOutput",
                                        { outputChannelCount: [1] },
                                    );
                                    this.audioOutput.connect(this.audioOutContext.destination);
                                    logDebug("Audio output worklet initialized");
                                }
                            })
                            .catch((err: unknown) => {
                                this.handleError(err);
                            });
                    }

                    // Start audio recording, for speech-to-text
                    this.recording = true;
                    this.stateChanged();
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
        const event: AudioProviderErrorEvent = {
            target: this,
            type: "error",
            level: "error",
            errorCode: this.error,
            error: err,
        };
        this.dispatchEvent(event);
        this.stateChanged();
        this.close();
    }

    private handleWarning(msg: string, err: unknown) {
        logThrownError(msg, err);
        const event: AudioProviderErrorEvent = {
            target: this,
            type: "error",
            level: "warning",
            errorCode: "warning",
            error: err,
        };
        this.dispatchEvent(event);
    }

    playAudio(audio: Uint8Array) {
        if (!this.stopped && this.audioOutput !== undefined) {
            this.audioOutput.port.postMessage({ outputs: [[this.g711aDecoder.decodeToFloat32(audio)]] });
        }
    }

    /**
     * Stops recording.
     */
    stop() {
        if (this.stopped) return;
        logDebug("Stop audio recording");
        this.stopped = true;
        if (!this.audioRecorded) {
            this.error = "noaudio";
        }
        if (this.analyser !== undefined) {
            this.analyser.disconnect();
            this.analyser = undefined;
        }
        if (this.audioInput !== undefined) {
            this.audioInput.disconnect();
            this.audioInput = undefined;
        }
        if (this.audioSource !== undefined) {
            this.audioSource.disconnect();
            this.audioSource = undefined;
        }
        if (this.audioInContext !== undefined) {
            this.audioInContext.close().catch((err: unknown) => {
                this.handleWarning("Input AudioContext close failed", err);
            });
            this.audioInContext = undefined;
        }
        if (this.audioOutput !== undefined) {
            this.audioOutput.port.postMessage({ closed: true });
            this.audioOutput.disconnect();
            this.audioOutput = undefined;
        }
        if (this.audioOutContext !== undefined) {
            this.audioOutContext.close().catch((err: unknown) => {
                this.handleWarning("Output AudioContext close failed", err);
            });
            this.audioOutContext = undefined;
        }
        if (this.mediaStream !== undefined) {
            this.mediaStream.getTracks().forEach((track) => {
                track.stop();
            });
            this.mediaStream = undefined;
        }
        this.stateChanged();
    }

    /**
     * Closes the recorder.
     */
    close() {
        this.clearListeners();
        this.stop();
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
                    this.handleWarning("requestAnimationFrame failed, falling back to setting timeouts", err);
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
                if (timestamp - this.silenceStartedAt > SILENCE_DURATION_MILLIS) {
                    if (!this.silenceDetected) {
                        logDebug("Silence detected");
                    }
                    this.silenceDetected = true;
                }
                if (
                    timestamp - this.silenceStartedAt > SILENCE_STOP_DURATION_MILLIS &&
                    this.soundDetected &&
                    stopOnSilence
                ) {
                    this.stop();
                }
                silence = true;
            } else {
                if (this.silenceDetected) {
                    logDebug("Sound detected");
                }
                this.silenceStartedAt = undefined;
                this.silenceDetected = false;
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
            const event: AudioAnalyserEvent<AudioProvider> = {
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

export function getRealtimeInputAudioType(supportedInputAudioTypes: string[]) {
    for (const audioType of supportedInputAudioTypes) {
        if (audioType === SUPPORTED_REALTIME_INPUT_AUDIO_TYPE) {
            return audioType;
        }
    }
    throw new VerbalWebError("No supported audio format available");
}

export function getRealtimeOutputAudioType(supportedOutputAudioTypes: string[]) {
    for (const audioType of supportedOutputAudioTypes) {
        if (audioType === SUPPORTED_REALTIME_OUTPUT_AUDIO_TYPE) {
            return audioType;
        }
    }
    throw new VerbalWebError("No supported audio format available");
}

interface AudioProviderEventMap extends AudioAnalyserEventMap<AudioProvider> {
    state: AudioProviderStateEvent;
    audio: AudioProviderAudioEvent;
    error: AudioProviderErrorEvent;
}

export type AudioProviderStateEvent = TypedEvent<AudioProvider, "state">;

export interface AudioProviderAudioEvent extends TypedEvent<AudioProvider, "audio"> {
    buffer: Uint8Array;
}

export interface AudioProviderErrorEvent extends TypedEvent<AudioProvider, "error"> {
    level: "error" | "warning";
    error: unknown;
    errorCode: AudioErrorCode;
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
