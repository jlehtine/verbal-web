import {
    ApiBackendChatMessage,
    ApiFrontendChatMessage,
    ChatAudioMessageNew,
    ChatAudioTranscription,
    ChatMessageError,
    ChatMessageErrorCode,
    ChatMessageNew,
    ChatMessagePart,
    isApiFrontendChatMessage,
    isChatAudioMessageNew,
} from "../shared/api";
import { Chat, InitialChatStateOverrides } from "../shared/chat";
import { VerbalWebError } from "../shared/error";
import { apiMessageToWsData, wsDataToApiMessage } from "../shared/wsdata";
import { ChatCompletionMessage, ChatCompletionProvider, ChatCompletionRequest } from "./ChatCompletionProvider";
import { ModerationCache } from "./ModerationCache";
import { ModerationProvider, ModerationRejectedError } from "./ModerationProvider";
import { RequestContext, contextFrom } from "./RequestContext";
import { TextChunker, chunkText } from "./TextChunker";
import { TranscriptionProvider, TranscriptionRequest } from "./TranscriptionProvider";
import { logDebug, logError, logInfo, logInterfaceData, logThrownError } from "./log";
import { continueRandomErrors, pauseRandomErrors } from "./randomErrors";
import { Request } from "express";
import { WebSocket } from "ws";

/** Inactivity timeout is one minute */
const INACTIVITY_TIMEOUT_MILLIS = 60 * 1000;

/** Interval for sending checks */
const SEND_INTERVAL_MILLIS = 200;

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

    private inactivityTimer?: NodeJS.Timeout;

    constructor(
        req: Request,
        ws: WebSocket,
        transcription: TranscriptionProvider | undefined,
        moderation: ModerationProvider,
        chatCompletion: ChatCompletionProvider,
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
            if (this.chat.backendProcessing) {
                continueRandomErrors();
                this.clearInactivityTimer();
                if (isChatAudioMessageNew(amsg)) {
                    this.info("Audio message received");
                    this.doTranscription(amsg);
                } else {
                    this.info("Chat completion requested");
                    this.doChatCompletion();
                }
            } else {
                this.initWebSocketInactivityTimeout();
            }
        }
    }

    private checkAuthorized(): boolean {
        if (this.config?.allowUsers === undefined || this.requestContext.session?.userEmail !== undefined) {
            return true;
        } else {
            console.debug("session = " + JSON.stringify(this.requestContext.session));
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

    // On web socket error
    private onWebSocketError(err: unknown) {
        this.thrownError("Web socket closed on error", err);
        this.clearInactivityTimer();
    }

    // On web socket close
    private onWebSocketClose() {
        this.debug("Web socket closed");
        this.clearInactivityTimer();
    }

    private initWebSocketInactivityTimeout() {
        this.clearInactivityTimer();
        this.inactivityTimer = setTimeout(() => {
            this.inactivityTimer = undefined;
            this.debug("Closing the connection due to inactivity timeout");
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
    private doTranscription(amsg: ChatAudioMessageNew) {
        if (this.transcription !== undefined) {
            const request: TranscriptionRequest = {
                requestContext: this.requestContext,
                user: this.requestContext.session?.id,
                audio: amsg.binary,
                type: amsg.mimeType,
            };
            this.transcription
                .transcribe(request)
                .then((transcription) => {
                    if (transcription.length === 0) {
                        throw new VerbalWebError("Empty transcription");
                    }
                    const msg: ChatMessageNew = { type: "msgnew", content: transcription };
                    this.chat.update(msg);
                    if (this.ws.readyState === WebSocket.OPEN) {
                        const tmsg: ChatAudioTranscription = { type: "audtrsc", transcription };
                        this.sendMessage(tmsg, "an audio transcription");
                        this.info("Starting chat completion of the audio transcription");
                        this.doChatCompletion();
                    }
                })
                .catch((err: unknown) => {
                    this.handleError(err);
                });
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
            requestContext: this.requestContext,
            model: this.chat.state.model,
            user: this.requestContext.session?.id,
            messages: [...systemInstructions, ...this.chat.state.messages],
        };

        // Perform moderation
        const moderationContent: string[] = request.messages
            .map((m) => m.content)
            .flatMap((c) => chunkText(this.moderation.textChunkerParams, c));
        this.moderation
            .checkModeration(this.requestContext, ...moderationContent)
            .then(() => {
                // Perform (streaming) chat completion
                const state: ChatCompletionState = {
                    completion: "",
                    done: false,
                    sent: 0,
                    moderated: 0,
                    moderationPending: false,
                    moderationChunker: new TextChunker(this.moderation.textChunkerParams),
                };
                this.chatCompletion
                    .chatCompletion(request)
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
                    .checkModeration(this.requestContext, moderationInput)
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
        const errorCode: ChatMessageErrorCode = err instanceof ModerationRejectedError ? "moderation" : "chat";
        const errorMessage = (
            {
                connection: "Assistant connection failed",
                moderation: "Moderation flagged",
                chat: "Chat completion failed",
                limit: "Chat completion usage limit encountered",
            } as Record<ChatMessageErrorCode, string>
        )[errorCode];
        this.thrownError(errorMessage, err);
        if (this.ws.readyState === WebSocket.OPEN) {
            const msg: ChatMessageError = { type: "msgerror", code: errorCode };
            this.chat.update(msg);
            this.sendMessage(msg, "a chat error");
            this.ws.close();
        }
        pauseRandomErrors();
    }
}
