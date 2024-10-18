import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { AudioAnalyserEvent, AudioAnalyserEventMap, AudioAnalyserEventTarget } from "./AudioAnalyserEvent";
import { logDebug, logThrownError } from "./log";

const INPUT_SAMPLE_RATE = 8000;
const INPUT_SAMPLE_SIZE = 16;
const FFT_SIZE = 1024;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MILLIS = 500;
const SILENCE_STOP_DURATION_MILLIS = 2000;
const SOUND_DURATION_MILLIS = 1000;
const RMS_AVERAGING_WINDOW = 20;
const OUTPUT_SAMPLE_RATE = 24000;

export const SUPPORTED_REALTIME_INPUT_AUDIO_TYPE = "audio/PCMA";
export const SUPPORTED_REALTIME_OUTPUT_AUDIO_TYPE =
    "audio/pcm;rate=24000;bits=16;encoding=signed-int;channels=1;big-endian=false";

export class AudioError extends VerbalWebError {
    constructor(msg: string, options?: ErrorOptions) {
        super(msg, options);
        this.name = "AudioError";
    }
}

export type AudioErrorCode = "general" | "notfound" | "notallowed" | "processing" | "realtime" | "warning";

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
    private stopped = false;
    private readonly rmsSamples = new Float32Array(RMS_AVERAGING_WINDOW);
    private rmsSampleHead = 0;
    private rmsSampleNum = 0;
    private rmsSampleSum = 0;
    private silenceStartedAt: number | undefined;
    private soundStartedAt: number | undefined;
    private silenceDetected = true;
    private soundDetected = false;
    private tryRequestAnimationFrame = typeof requestAnimationFrame === "function";

    recording = false;
    error: AudioErrorCode | undefined;

    private mediaRecorder: MediaRecorder | undefined;
    private mediaStream: MediaStream | undefined;
    private audioInContext: AudioContext | undefined;
    private audioOutContext: AudioContext | undefined;
    private audioSource: MediaStreamAudioSourceNode | undefined;
    private g711aEncoder: AudioWorkletNode | undefined;
    private pcm16sleDecoder: AudioWorkletNode | undefined;
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
                    }

                    // Initialize media recorder, for speech-to-text
                    if (mode === "stt") {
                        this.mediaRecorder = new MediaRecorder(stream, {
                            mimeType: getMediaRecorderAudioType(this.params.supportedAudioTypes),
                        });
                        this.mediaRecorder.addEventListener("dataavailable", (event: BlobEvent) => {
                            if (event.data.size > 0) {
                                logDebug("Processing recorded audio");
                                const audioEvent: AudioProviderAudioEvent = {
                                    target: this,
                                    type: "audio",
                                    blob: event.data,
                                };
                                this.dispatchEvent(audioEvent);
                            }
                        });
                    }

                    // Initialize audio context and analyser
                    try {
                        this.audioInContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
                        this.audioSource = this.audioInContext.createMediaStreamSource(stream);
                        this.analyser = this.audioInContext.createAnalyser();
                        this.analyser.fftSize = FFT_SIZE;
                        this.audioSource.connect(this.analyser);
                        this.scheduleAnalyzeAudio();
                        logDebug("Started audio analysis");
                    } catch (err: unknown) {
                        if (mode === "realtime") {
                            throw err;
                        } else {
                            this.handleWarning("Audio context initialization failed", err);
                        }
                    }

                    // Realtime audio processing
                    if (mode === "realtime" && this.audioInContext && this.audioSource) {
                        // Initialize G711 A-law encoder for input
                        logDebug("Initializing G711 A-law encoder");
                        this.audioInContext.audioWorklet
                            .addModule("G711AEncoder.js")
                            .then(() => {
                                if (!this.stopped && this.audioInContext && this.audioSource) {
                                    this.g711aEncoder = new AudioWorkletNode(this.audioInContext, "G711AEncoder");
                                    this.g711aEncoder.port.onmessage = (event) => {
                                        const data: unknown = event.data;
                                        if (!this.silenceDetected && data instanceof Uint8Array) {
                                            const audioEvent: AudioProviderRealtimeAudioEvent = {
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
                                    logDebug("G711 A-law encoder initialized");
                                }
                            })
                            .catch((err: unknown) => {
                                this.handleError(err);
                            });

                        // Initialize PCM 16-bit signed little-endian decoder for output
                        this.audioOutContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
                        logDebug("Initializing PCM 16-bit signed little-endian decoder");
                        this.audioOutContext.audioWorklet
                            .addModule("PCM16SLEDecoder.js")
                            .then(() => {
                                if (!this.stopped && this.audioOutContext) {
                                    this.pcm16sleDecoder = new AudioWorkletNode(
                                        this.audioOutContext,
                                        "PCM16SLEDecoder",
                                    );
                                    this.pcm16sleDecoder.connect(this.audioOutContext.destination);
                                    logDebug("PCM 16-bit signed little-endian decoder initialized");
                                }
                            })
                            .catch((err: unknown) => {
                                this.handleError(err);
                            });
                    }

                    // Start audio recording, for speech-to-text
                    if (this.mediaRecorder) {
                        this.mediaRecorder.start();
                        this.mediaRecorder.pause();
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
        this.dispatchEvent({
            target: this,
            type: "error",
            level: "error",
            errorCode: this.error,
            error: err,
        } as AudioProviderErrorEvent);
        this.stateChanged();
        this.close();
    }

    private handleWarning(msg: string, err: unknown) {
        logThrownError(msg, err);
        this.dispatchEvent({
            target: this,
            type: "error",
            level: "warning",
            errorCode: "warning",
            error: err,
        } as AudioProviderErrorEvent);
    }

    playAudio(audio: ArrayBuffer) {
        if (!this.stopped && this.pcm16sleDecoder !== undefined) {
            this.pcm16sleDecoder.port.postMessage(audio);
        }
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
        if (this.audioInContext !== undefined) {
            this.audioInContext.close().catch((err: unknown) => {
                this.handleWarning("Input AudioContext close failed", err);
            });
            this.audioInContext = undefined;
        }
        if (this.pcm16sleDecoder !== undefined) {
            this.pcm16sleDecoder.port.postMessage("close");
            this.pcm16sleDecoder.disconnect();
            this.pcm16sleDecoder = undefined;
        }
        if (this.audioOutContext !== undefined) {
            this.audioOutContext.close().catch((err: unknown) => {
                this.handleWarning("Output AudioContext close failed", err);
            });
            this.audioOutContext = undefined;
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
                        if (this.mediaRecorder && this.recording) {
                            this.mediaRecorder.pause();
                        }
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
                    if (this.mediaRecorder && this.recording) {
                        this.mediaRecorder.resume();
                    }
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
    rtaudio: AudioProviderRealtimeAudioEvent;
    error: AudioProviderErrorEvent;
}

export type AudioProviderStateEvent = TypedEvent<AudioProvider, "state">;

export interface AudioProviderAudioEvent extends TypedEvent<AudioProvider, "audio"> {
    blob: Blob;
}

export interface AudioProviderRealtimeAudioEvent extends TypedEvent<AudioProvider, "rtaudio"> {
    buffer: ArrayBuffer;
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
