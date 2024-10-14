import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { logDebug, logThrownError } from "./log";

const SILENCE_THRESHOLD = 0.05;
const SILENCE_DURATION_MILLIS = 3000;
const SOUND_DURATION_MILLIS = 500;

export type AudioErrorCode = "general" | "notfound" | "notallowed" | "processing";

export interface SpeechRecorderParams {
    supportedAudioTypes: string[];
    stopAfterSilenceMillis?: boolean;
}

/**
 * Records speech from the microphone.
 */
export class SpeechRecorder extends TypedEventTarget<SpeechRecorder, SpeechRecorderEventMap> {
    private readonly params: SpeechRecorderParams;
    private started = false;
    private stopped = false;
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
    private analyser: AnalyserNode | undefined;

    constructor(params: SpeechRecorderParams) {
        super();
        this.params = params;
    }

    /**
     * Starts recording.
     */
    start() {
        if (this.started) {
            throw new VerbalWebError("SpeechRecorder already started");
        }
        this.started = true;
        try {
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
                    this.mediaStream = stream;

                    // Abort if already stopped
                    if (this.stopped) {
                        this.stop();
                        return;
                    }

                    // Initialize media recorder
                    this.mediaRecorder = new MediaRecorder(stream, {
                        mimeType: getAudioType(this.params.supportedAudioTypes),
                    });
                    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
                        if (event.data.size > 0) {
                            logDebug("Processing recorded audio");
                            const audioEvent: SpeechRecorderAudio = {
                                target: this,
                                type: "audio",
                                blob: event.data,
                                timecode: Date.now(),
                            };
                            this.dispatchEvent(audioEvent);
                        }
                    };

                    // Initialize audio context
                    try {
                        this.audioContext = new AudioContext();
                        this.audioSource = this.audioContext.createMediaStreamSource(stream);
                        this.analyser = this.audioContext.createAnalyser();
                        this.analyser.fftSize = 256;
                        this.audioSource.connect(this.analyser);
                        this.scheduleAnalyzeAudio();
                        logDebug("Started audio analysis");
                    } catch (err: unknown) {
                        logThrownError("Audio analysis initialization failed", err);
                    }

                    // Start audio recording
                    logDebug("Start audio recording");
                    this.mediaRecorder.start();
                    this.recording = true;
                    this.stateChanged();
                })
                .catch((err: unknown) => {
                    logThrownError("Audio failed", err);
                    this.error = toAudioErrorCode(err);
                    this.stateChanged();
                });
        } catch (err: unknown) {
            logThrownError("Audio failed", err);
            this.error = toAudioErrorCode(err);
            this.stateChanged();
        }
    }

    /**
     * Stops recording.
     */
    stop() {
        if (this.stopped) {
            return;
        }
        this.stopped = true;
        if (this.analyser !== undefined) {
            this.analyser.disconnect();
            this.analyser = undefined;
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
            logDebug("Stop audio recording");
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
        if (!this.stopped && this.analyser) {
            // RMS volume level
            const buflen = this.analyser.frequencyBinCount;
            const tdata = new Float32Array(buflen);
            this.analyser.getFloatTimeDomainData(tdata);
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
            const rms = Math.sqrt(sqsum / buflen);

            // Silence detection
            if (rms < SILENCE_THRESHOLD) {
                if (this.silenceStartedAt === undefined) {
                    this.silenceStartedAt = timestamp;
                }
                if (
                    this.soundDetected &&
                    this.params.stopAfterSilenceMillis &&
                    timestamp - this.silenceStartedAt > SILENCE_DURATION_MILLIS
                ) {
                    this.stop();
                }
            } else {
                this.silenceStartedAt = undefined;
                if (this.soundStartedAt === undefined) {
                    this.soundStartedAt = timestamp;
                }
                if (timestamp - this.soundStartedAt > SOUND_DURATION_MILLIS) {
                    this.soundDetected = true;
                }
            }

            // Schedule next round
            this.scheduleAnalyzeAudio();
        }
    }
}

function getAudioType(supportedAudioTypes: string[]) {
    for (const audioType of supportedAudioTypes) {
        if (MediaRecorder.isTypeSupported(audioType)) {
            return audioType;
        }
    }
    throw new VerbalWebError("No supported audio format available");
}

interface SpeechRecorderEventMap {
    state: SpeechRecorderState;
    audio: SpeechRecorderAudio;
}

export type SpeechRecorderState = TypedEvent<SpeechRecorder, "state">;

export interface SpeechRecorderAudio extends TypedEvent<SpeechRecorder, "audio"> {
    blob: Blob;
    timecode: number;
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
