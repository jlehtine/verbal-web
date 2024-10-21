import {
    ApiBackendChatMessage,
    ApiFrontendChatMessage,
    ChatAudioTranscription,
    ChatInitRealtime,
    ChatMessageError,
    ChatMessageErrorCode,
    ChatMessagePart,
    ChatAudio,
    isApiFrontendChatMessage,
} from "../shared/api";
import { Chat, InitialChatStateOverrides } from "../shared/chat";
import { VerbalWebError } from "../shared/error";
import { apiMessageToWsData, wsDataToApiMessage } from "../shared/wsdata";
import { ChatCompletionMessage, ChatCompletionProvider, ChatCompletionRequest } from "./ChatCompletionProvider";
import { ModerationCache } from "./ModerationCache";
import { ModerationProvider, ModerationRejectedError } from "./ModerationProvider";
import { RealtimeConversation, RealtimeConversationRequest, RealtimeProvider } from "./RealtimeProvider";
import { RequestContext, contextFrom } from "./RequestContext";
import { TextChunker, chunkText } from "./TextChunker";
import { TranscriptionProvider, TranscriptionRequest } from "./TranscriptionProvider";
import { logDebug, logError, logInfo, logInterfaceData, logThrownError } from "./log";
import { continueRandomErrors, pauseRandomErrors } from "./randomErrors";
import { alaw } from "alawmulaw";
import { Request } from "express";
import { Writable } from "stream";
import { Writer as WavWriter } from "wav";
import { WebSocket } from "ws";

/** Inactivity timeout is one minute */
const INACTIVITY_TIMEOUT_MILLIS = 60 * 1000;

/** Interval for sending checks */
const SEND_INTERVAL_MILLIS = 200;

export class RealtimeConversationError extends VerbalWebError {
    constructor(msg: string, options?: ErrorOptions) {
        super(msg, options);
        this.name = "RealtimeConversationError";
    }
}

/** Server configuration details */
export interface ChatServerConfig {
    /**
     * Allowed user emails addresses or email domains.
     * If undefined then authentication is not required.
     */
    allowUsers?: string[];

    /** Google OAuth client id, if Google login enabled */
    googleOAuthClientId?: string;

    /** Session expiration time in millis */
    sessionExpiration: number;
}

/** Internal chat completion state */
interface ChatCompletionState {
    /** Moderation model */
    moderationModel?: string;

    /** User identifier */
    user?: string;

    /** Chat completion received so far */
    completion: string;

    /** Whether full completion has been already received */
    done: boolean;

    /** Number of characters already sent to the client */
    sent: number;

    /** Timeout for sending attempts */
    sendTimeout?: NodeJS.Timeout;

    /** Number of characters already moderated */
    moderated: number;

    /** Whether moderation results are pending */
    moderationPending: boolean;

    /** Text chunker for moderation */
    moderationChunker: TextChunker;
}

function toStandardWebSocketData(data: unknown): string | ArrayBuffer {
    if (typeof data === "string" || (typeof data === "object" && data instanceof ArrayBuffer)) {
        return data;
    } else if (Buffer.isBuffer(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
        throw new Error("Unsupported Web Socket data type");
    }
}

/**
 * A server serving a single chat client web socket session.
 */
export class ChatServer {
    /** Request context */
    private requestContext: RequestContext;

    /** Server configuration */
    private readonly config;

    /** Chat model */
    private readonly chat;

    /** Web socket */
    private readonly ws;

    /** Transcription provider */
    private readonly transcription;

    /** Moderation provider */
    private readonly moderation;

    /** Chat completion provider */
    private readonly chatCompletion;

    /** Realtime provider */
    private readonly realtime;

    private realtimeConversationRequested = false;

    private realtimeConversation?: RealtimeConversation;

    private inactivityTimer?: NodeJS.Timeout;

    private bufferedAudio: Uint8Array[] = [];

    constructor(
        req: Request,
        ws: WebSocket,
        transcription: TranscriptionProvider | undefined,
        moderation: ModerationProvider,
        chatCompletion: ChatCompletionProvider,
        realtime: RealtimeProvider | undefined,
        config?: ChatServerConfig,
        serverOverrides?: InitialChatStateOverrides,
    ) {
        this.requestContext = contextFrom(req);
        this.debug("Web socket connection");
        this.config = config;
        this.chat = new Chat(undefined, serverOverrides);
        this.ws = ws;
        this.transcription = transcription;
        this.moderation = new ModerationCache(moderation);
        this.chatCompletion = chatCompletion;
        this.realtime = realtime;
        this.initWebSocketInactivityTimeout();

        this.ws.on("message", (data) => {
            this.onWebSocketMessage(data);
        });
        this.ws.on("error", (err) => {
            this.onWebSocketError(err);
        });
        this.ws.on("close", () => {
            this.onWebSocketClose();
        });

        this.checkAuthorized();
    }

    private error(msg: string, ...params: unknown[]) {
        logError(msg, this.requestContext, ...params);
    }

    private thrownError(msg: string, err: unknown, ...params: unknown[]) {
        logThrownError(msg, err, this.requestContext, ...params);
    }

    private info(msg: string, ...params: unknown[]) {
        logInfo(msg, this.requestContext, ...params);
    }

    private debug(msg: string, ...params: unknown[]) {
        logDebug(msg, this.requestContext, ...params);
    }

    private debugData(msg: string, data: Record<string, unknown>, ...params: unknown[]) {
        logInterfaceData(msg, this.requestContext, data, ...params);
    }

    private sendMessage(msg: ApiBackendChatMessage, desc: string) {
        this.debugData("Sending %s", msg, desc);
        this.ws.send(apiMessageToWsData(msg));
    }

    // On web socket message
    private onWebSocketMessage(data: unknown) {
        try {
            const amsg = wsDataToApiMessage(toStandardWebSocketData(data), isApiFrontendChatMessage);
            this.processChatMessage(amsg);
        } catch (err: unknown) {
            this.handleError(err);
        }
    }

    // Process a chat message
    private processChatMessage(amsg: ApiFrontendChatMessage) {
        if (this.checkAuthorized()) {
            this.debugData("Received a chat update", amsg);
            this.chat.update(amsg);

            // Start realtime conversation
            if (amsg.type === "init" && amsg.mode === "realtime") {
                this.initWebSocketInactivityTimeout();
                this.handleRealtimeInit(amsg);
            }

            // Input audio
            else if (amsg.type === "audio") {
                this.initWebSocketInactivityTimeout();
                this.handleRealtimeAudio(amsg);
            }

            // Audio commit
            else if (amsg.type === "audiocommit") {
                this.info("Audio message received for transcription");
                this.initWebSocketInactivityTimeout();
                this.doTranscription();
            }

            // Stop realtime conversation
            else if (amsg.type === "rtstop") {
                this.resetRealtimeConversation();
            }

            // Chat completion
            else if (this.chat.backendProcessing) {
                continueRandomErrors();
                this.clearInactivityTimer();
                this.info("Chat completion requested");
                this.doChatCompletion();
            } else {
                this.initWebSocketInactivityTimeout();
            }
        }
    }

    private checkAuthorized(): boolean {
        if (this.config?.allowUsers === undefined || this.requestContext.session?.userEmail !== undefined) {
            return true;
        } else {
            this.error("Unauthorized, requesting authentication");
            if (this.ws.readyState === WebSocket.OPEN) {
                const errmsg: ChatMessageError = { type: "msgerror", code: "auth" };
                this.sendMessage(errmsg, "a chat error");
                this.ws.close();
                this.clearInactivityTimer();
            }
            return false;
        }
    }

    private handleRealtimeInit(amsg: ChatInitRealtime) {
        if (this.realtime) {
            this.info("Realtime conversation requested");
            if (this.realtimeConversation) {
                throw new RealtimeConversationError("Realtime conversation already in progress");
            } else if (this.realtimeConversationRequested) {
                throw new RealtimeConversationError("Realtime conversation request already being processed");
            }
            this.realtimeConversationRequested = true;
            const req: RealtimeConversationRequest = {
                inputAudioType: amsg.realtimeInputAudioType,
                outputAudioType: amsg.realtimeOutputAudioType,
            };
            this.realtime
                .realtimeConversation(this.requestContext, req)
                .then((conversation) => {
                    if (!this.realtimeConversationRequested) {
                        this.debug("Realtime conversation request cancelled");
                        conversation.close();
                        return;
                    }
                    this.info("Realtime conversation started");
                    this.sendMessage({ type: "rtstarted" }, "realtime conversation started");
                    this.realtimeConversation = conversation;
                    conversation.addEventListener("audio", (event) => {
                        const amsg: ChatAudio = { type: "audio", binary: [new Uint8Array(event.audio)] };
                        this.sendMessage(amsg, "realtime audio");
                    });
                    conversation.addEventListener("error", (event) => {
                        this.resetRealtimeConversation();
                        this.handleError(
                            new RealtimeConversationError("Realtime conversation error", { cause: event.error }),
                        );
                    });
                    conversation.addEventListener("state", () => {
                        if (conversation.isClosed()) {
                            this.resetRealtimeConversation();
                        }
                    });
                })
                .catch((err: unknown) => {
                    this.handleError(
                        new RealtimeConversationError("Failed to start realtime conversation", { cause: err }),
                    );
                });
        } else {
            throw new RealtimeConversationError("Realtime conversation not available");
        }
    }

    private handleRealtimeAudio(amsg: ChatAudio) {
        const rtc = this.realtimeConversation;
        if (rtc) {
            amsg.binary.forEach((audio) => {
                rtc.appendAudio(audio);
            });
        } else {
            this.bufferedAudio.push(...amsg.binary);
        }
    }

    // On web socket error
    private onWebSocketError(err: unknown) {
        this.thrownError("Web socket closed on error", err);
        this.resetRealtimeConversation();
        this.clearInactivityTimer();
    }

    // On web socket close
    private onWebSocketClose() {
        this.debug("Web socket closed");
        this.resetRealtimeConversation();
        this.clearInactivityTimer();
    }

    private resetRealtimeConversation() {
        this.realtimeConversationRequested = false;
        const rtc = this.realtimeConversation;
        if (rtc) {
            this.debug("Closing the realtime conversation");
            this.realtimeConversation = undefined;
            rtc.close();
        }
    }

    private initWebSocketInactivityTimeout() {
        this.clearInactivityTimer();
        this.inactivityTimer = setTimeout(() => {
            this.inactivityTimer = undefined;
            this.debug("Closing the connection due to inactivity timeout");
            this.resetRealtimeConversation();
            this.ws.close();
        }, INACTIVITY_TIMEOUT_MILLIS);
    }

    private clearInactivityTimer() {
        if (this.inactivityTimer !== undefined) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = undefined;
        }
    }

    /** Handles an audio transcription request */
    private doTranscription() {
        const transcription = this.transcription;
        if (transcription !== undefined) {
            // Collect buffered audio
            const audioBytes = this.bufferedAudio.reduce((acc, a) => acc + a.byteLength, 0);
            const audioData = new Uint8Array(audioBytes);
            let offset = 0;
            for (const ba of this.bufferedAudio) {
                audioData.set(new Uint8Array(ba), offset);
                offset += ba.byteLength;
            }
            this.bufferedAudio = [];

            // Convert buffered audio from G.711 A-law to PCM 16-bit WAV
            const pcm = alaw.decode(audioData);
            const wavWriter = new WavWriter({ channels: 1, sampleRate: 8000, bitDepth: 16 });
            const chunks: Buffer[] = [];
            wavWriter.pipe(
                new Writable({
                    write(chunk, encoding, callback) {
                        if (chunk instanceof Buffer) {
                            chunks.push(chunk);
                            callback();
                        } else {
                            throw new Error("Unsupported chunk type");
                        }
                    },
                }),
            );

            wavWriter.addListener("end", () => {
                const wav = Buffer.concat(chunks);
                const req: TranscriptionRequest = {
                    user: this.requestContext.session?.id,
                    audio: wav,
                    type: "audio/wav",
                };
                transcription
                    .transcribe(this.requestContext, req)
                    .then((transcription) => {
                        if (transcription.length === 0) {
                            throw new VerbalWebError("Empty transcription");
                        }
                        if (this.ws.readyState === WebSocket.OPEN) {
                            const tmsg: ChatAudioTranscription = { type: "audtrsc", transcription };
                            this.chat.update(tmsg);
                            this.sendMessage(tmsg, "an audio transcription");
                            this.info("Starting chat completion of the audio transcription");
                            this.doChatCompletion();
                        }
                    })
                    .catch((err: unknown) => {
                        this.handleError(err);
                    });
            });

            wavWriter.addListener("error", (err) => {
                this.handleError(err);
            });

            wavWriter.end(Buffer.from(pcm.buffer));
        } else {
            this.handleError(new VerbalWebError("Audio transcription not available"));
        }
    }

    /** Handles a chat completion request */
    private doChatCompletion() {
        // Construct initial prompt
        const initialInstruction = this.chat.state.initialInstruction;
        const pageContent = this.chat.state.pageContent;
        const systemInstruction = initialInstruction
            ? initialInstruction + (pageContent ? "\n\n" + pageContent : "")
            : undefined;
        const systemInstructions: ChatCompletionMessage[] = systemInstruction
            ? [{ role: "system", content: systemInstruction }]
            : [];

        // Construct a chat completion request
        const request: ChatCompletionRequest = {
            model: this.chat.state.model,
            user: this.requestContext.session?.id,
            messages: [...systemInstructions, ...this.chat.state.messages],
        };

        // Perform moderation
        const moderationContent: string[] = request.messages
            .map((m) => m.content)
            .flatMap((c) => chunkText(this.moderation.textChunkerParams, c));
        this.moderation
            .checkModeration(this.requestContext, { user: request.user, content: moderationContent })
            .then(() => {
                // Perform (streaming) chat completion
                const state: ChatCompletionState = {
                    user: request.user,
                    completion: "",
                    done: false,
                    sent: 0,
                    moderated: 0,
                    moderationPending: false,
                    moderationChunker: new TextChunker(this.moderation.textChunkerParams),
                };
                this.chatCompletion
                    .chatCompletion(this.requestContext, request)
                    .then((iterable) => {
                        const iterator = iterable[Symbol.asyncIterator]();
                        const doIter = () => {
                            iterator
                                .next()
                                .then(onChunk)
                                .catch((err: unknown) => {
                                    this.handleError(err);
                                });
                        };
                        const onChunk = ({ done, value }: IteratorResult<string>) => {
                            if (this.ws.readyState === WebSocket.OPEN) {
                                if (done) {
                                    this.chatDone(state);
                                } else {
                                    this.chatData(state, value);
                                    doIter();
                                }
                            }
                        };
                        doIter();
                    })
                    .catch((err: unknown) => {
                        this.handleError(err);
                    });
            })
            .catch((err: unknown) => {
                this.handleError(err);
            });
    }

    /** Process a chat completion data chunk. */
    private chatData(state: ChatCompletionState, data: string) {
        state.completion += data;
        state.moderationChunker.append(data);
        this.process(state);
    }

    /** Finalize the chat completion process */
    private chatDone(state: ChatCompletionState) {
        state.done = true;
        state.moderationChunker.finish();
        this.process(state);
    }

    /** Perform completion moderation and data streaming in parallel */
    private process(state: ChatCompletionState) {
        // Get the next chunk, if moderation not already pending
        if (!state.moderationPending) {
            const { value } = state.moderationChunker.chunk();
            if (value) {
                const moderationInput = state.completion.slice(value.start, value.end);
                state.moderationPending = true;
                this.moderation
                    .checkModeration(this.requestContext, {
                        model: state.moderationModel,
                        user: state.user,
                        content: [moderationInput],
                    })
                    .then(() => {
                        state.moderationPending = false;
                        state.moderated = value.end;
                        this.process(state);
                    })
                    .catch((err: unknown) => {
                        this.handleError(err);
                    });
            }
        }

        // Check whether to send data at this time
        this.sendCheck(state);
    }

    private sendCheck(state: ChatCompletionState) {
        const allDone = state.done && state.moderated >= state.completion.length;
        if (allDone || (this.ws.bufferedAmount === 0 && state.sent < state.completion.length)) {
            this.sendData(state, allDone);
        }

        // Otherwise try again soon
        else {
            this.clearSendTimeout(state);
            state.sendTimeout = setTimeout(() => {
                this.sendCheck(state);
            }, SEND_INTERVAL_MILLIS);
        }

        if (allDone) {
            this.initWebSocketInactivityTimeout();
            pauseRandomErrors();
        }
    }

    /** Send buffered data to the client */
    private sendData(state: ChatCompletionState, allDone: boolean) {
        const msg: ChatMessagePart = {
            type: "msgpart",
            content: state.completion.slice(state.sent),
            done: allDone,
        };
        this.chat.update(msg);
        this.sendMessage(msg, "a chat update");
        state.sent = state.completion.length;
        this.clearSendTimeout(state);
    }

    private clearSendTimeout(state: ChatCompletionState) {
        if (state.sendTimeout !== undefined) {
            clearTimeout(state.sendTimeout);
        }
    }

    private handleError(err: unknown) {
        const errorCode: ChatMessageErrorCode =
            err instanceof ModerationRejectedError
                ? "moderation"
                : err instanceof RealtimeConversationError
                  ? "realtime"
                  : "chat";
        const errorMessage = (
            {
                connection: "Assistant connection failed",
                moderation: "Moderation flagged",
                chat: "Chat completion failed",
                realtime: "Realtime conversation failed",
                limit: "Chat completion usage limit encountered",
            } as Record<ChatMessageErrorCode, string>
        )[errorCode];
        this.thrownError(errorMessage, err);
        if (this.ws.readyState === WebSocket.OPEN) {
            const msg: ChatMessageError = { type: "msgerror", code: errorCode };
            this.chat.update(msg);
            this.sendMessage(msg, "a chat error");
            this.resetRealtimeConversation();
            this.ws.close();
        }
        pauseRandomErrors();
    }
}
