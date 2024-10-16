import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import {
    isRealtimeErrorMessage,
    isRealtimeMessage,
    isRealtimeMessageOfType,
    RealtimeAudioFormat,
    RealtimeInputAudioBufferAppendMessage,
    RealtimeInputAudioBufferCommitMessage,
    RealtimeSessionUpdateMessage,
} from "./OpenAIRealtimeMessages";
import { RealtimeConversation, RealtimeConversationRequest } from "./RealtimeProvider";
import { RequestContext } from "./RequestContext";
import { logDebug, logInterfaceData, logThrownError } from "./log";
import WebSocket from "ws";

/** Realtime API URL */
const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

const DEFAULT_INPUT_AUDIO_TRANSCRIPTION_MODEL = "whisper-1";

export class OpenAIRealtimeConversation
    extends TypedEventTarget<OpenAIRealtimeConversation, OpenAIRealtimeConversationEvents>
    implements RealtimeConversation
{
    private readonly requestContext;
    private readonly request;
    private readonly ws: WebSocket;
    private connected = false;
    private error?: Error;
    private closed = false;
    private initialized = false;

    constructor(requestContext: RequestContext, request: RealtimeConversationRequest, apiKey: string) {
        super();
        logDebug("Opening a WebSocket connection for OpenAI realtime session");
        this.requestContext = requestContext;
        this.request = request;
        this.ws = new WebSocket(REALTIME_URL, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });
        this.ws.on("open", () => {
            this.onWebSocketOpen();
        });
        this.ws.on("message", (data) => {
            this.onWebSocketMessage(data);
        });
        this.ws.on("error", (err) => {
            this.onWebSocketError(err);
        });
        this.ws.on("close", () => {
            this.onWebSocketClose();
        });
    }

    private onWebSocketOpen(): void {
        logDebug("Realtime WebSocket connected");
        this.connected = true;
        this.stateChanged();
    }

    private onWebSocketMessage(data: WebSocket.Data): void {
        try {
            logInterfaceData("Received realtime message", this.requestContext, data);
            if (typeof data === "string") {
                const msg: unknown = JSON.parse(data);
                if (isRealtimeMessage(msg)) {
                    // error
                    if (isRealtimeMessageOfType(msg, "error") && isRealtimeErrorMessage(msg)) {
                        this.handleError(new Error(`Realtime error: ${msg.error.code} : ${msg.error.message}`));
                    }

                    // session updated
                    else if (isRealtimeMessageOfType(msg, "session.updated")) {
                        this.initialized = true;
                        this.stateChanged();
                    }
                }
            }
        } catch (err: unknown) {
            this.handleError(err);
        }
    }

    private onWebSocketError(err: Error): void {
        logThrownError("Realtime WebSocket error", err);
        if (this.error === undefined) {
            this.error = new VerbalWebError("Realtime WebSocket error", { cause: err });
        }
        this.stateChanged();
    }

    private onWebSocketClose(): void {
        logDebug("Realtime WebSocket closed");
        this.closed = true;
        this.stateChanged();
    }

    private stateChanged() {
        this.dispatchEvent({ target: this, type: "state" });
    }

    private connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const checkState = () => {
                if (this.connected) {
                    resolve();
                    return true;
                } else if (this.error || this.closed) {
                    reject(this.error ?? new VerbalWebError("Realtime connection closed"));
                    return true;
                } else {
                    return false;
                }
            };
            if (!checkState()) {
                const eventListener = () => {
                    if (checkState()) {
                        this.removeEventListener("state", eventListener);
                    }
                };
                this.addEventListener("state", eventListener);
            }
        });
    }

    private sendMessage(message: unknown): void {
        if (this.ws.readyState !== WebSocket.OPEN) {
            throw new VerbalWebError("Realtime WebSocket not open");
        }
        logInterfaceData("Sending realtime message", this.requestContext, message);
        this.ws.send(JSON.stringify(message));
    }

    private closeWebSocket() {
        if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
            this.ws.close();
        }
        if (!this.closed) {
            this.closed = true;
            this.stateChanged();
        }
    }

    private handleError(err: unknown) {
        logThrownError("Realtime conversation error", err, this.requestContext);
        if (this.error === undefined) {
            this.error =
                typeof err === "object" && err instanceof Error ? err : new Error("Realtime error", { cause: err });
            this.stateChanged();
        }
        this.closeWebSocket();
    }

    init(): Promise<void> {
        return new Promise((resolve, reject: (reason: unknown) => void) => {
            this.connect()
                .then(() => {
                    const updateSessionReq: RealtimeSessionUpdateMessage = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: this.request.instructions,
                            voice: this.request.voice,
                            input_audio_format: toAudioFormat(this.request.inputAudioType),
                            output_audio_format: toAudioFormat(this.request.outputAudioType),
                            input_audio_transcription:
                                this.request.inputAudioTranscriptionModel === null
                                    ? null
                                    : {
                                          model:
                                              this.request.inputAudioTranscriptionModel ??
                                              DEFAULT_INPUT_AUDIO_TRANSCRIPTION_MODEL,
                                      },
                        },
                    };
                    const checkState = () => {
                        if (this.initialized) {
                            resolve();
                            return true;
                        } else if (this.error || this.closed) {
                            reject(this.error ?? new VerbalWebError("Realtime connection closed"));
                            return true;
                        } else {
                            return false;
                        }
                    };
                    const eventListener = () => {
                        if (checkState()) {
                            this.removeEventListener("state", eventListener);
                        }
                    };
                    this.addEventListener("state", eventListener);
                    this.sendMessage(updateSessionReq);
                })
                .catch(reject);
        });
    }

    appendAudio(audio: ArrayBuffer): void {
        const msg: RealtimeInputAudioBufferAppendMessage = {
            type: "input_audio_buffer.append",
            audio: Buffer.from(audio).toString("base64"),
        };
        this.sendMessage(msg);
    }

    commitUserAudio(): void {
        const msg: RealtimeInputAudioBufferCommitMessage = {
            type: "input_audio_buffer.commit",
        };
        this.sendMessage(msg);
    }

    close(): void {
        this.closeWebSocket();
    }

    isClosed(): boolean {
        return this.closed;
    }
}

interface OpenAIRealtimeConversationEvents {
    state: TypedEvent<OpenAIRealtimeConversation, "state">;
}

function toAudioFormat(type: string): RealtimeAudioFormat {
    switch (type) {
        case "audio/PCMA":
            return "g711_alaw";
        case "audio/PCMU":
            return "g711_ulaw";
        case "audio/pcm;rate=24000;bits=16;encoding=signed-int;channels=1;big-endian=false":
            return "pcm16";
        default:
            throw new VerbalWebError(`Unsupported realtime audio type: ${type}`);
    }
}