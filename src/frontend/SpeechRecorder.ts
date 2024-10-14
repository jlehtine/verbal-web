import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { logDebug, logThrownError } from "./log";

export type AudioErrorCode = "general" | "notfound" | "notallowed" | "processing";

export interface SpeechRecorderParams {
    supportedAudioTypes: string[];
}

/**
 * Records speech from the microphone.
 */
export class SpeechRecorder extends TypedEventTarget<SpeechRecorder, SpeechRecorderEventMap> {
    private readonly params: SpeechRecorderParams;
    private started = false;
    private stopped = false;

    recording = false;
    error: AudioErrorCode | undefined;

    private mediaRecorder: MediaRecorder | undefined;
    private mediaStream: MediaStream | undefined;

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
                    if (this.stopped) {
                        this.stop();
                        return;
                    }
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
        this.stop();
        this.mediaRecorder = undefined;
    }

    private stateChanged() {
        this.dispatchEvent({ target: this, type: "state" });
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
