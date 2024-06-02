import {
    ApiBackendMessage,
    AuthError,
    AuthRequest,
    AuthResponse,
    ChatMessageError,
    ChatMessageErrorCode,
    ChatMessagePart,
    ConfigResponse,
    isApiFrontendMessage,
    isAuthRequest,
    isConfigRequest,
} from "../shared/api";
import { Chat, InitialChatStateOverrides } from "../shared/chat";
import { VerbalWebError } from "../shared/error";
import { ChatCompletionMessage, ChatCompletionProvider, ChatCompletionRequest } from "./ChatCompletionProvider";
import { ModerationCache } from "./ModerationCache";
import { ModerationProvider, ModerationRejectedError } from "./ModerationProvider";
import { TextChunker, chunkText } from "./TextChunker";
import { logDebug, logError, logInfo, logInterfaceData, logThrownError } from "./log";
import { CredentialResponse } from "@react-oauth/google";
import { Request } from "express";
import { OAuth2Client } from "google-auth-library";
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

/**
 * A server serving a single chat client web socket session.
 */
export class ChatServer {
    /** Server configuration */
    private readonly config;

    /** Client ip */
    private readonly ip;

    /** Chat model */
    private readonly chat;

    /** Web socket */
    private readonly ws;

    /** Moderation provider */
    private readonly moderation;

    /** Chat completion provider */
    private readonly chatCompletion;

    private inactivityTimer?: NodeJS.Timeout;

    private readonly googleClient = new OAuth2Client();

    constructor(
        req: Request,
        ws: WebSocket,
        moderation: ModerationProvider,
        chatCompletion: ChatCompletionProvider,
        config?: ChatServerConfig,
        serverOverrides?: InitialChatStateOverrides,
    ) {
        this.config = config;
        this.ip = req.ip;
        logDebug("Chat server initialization [%s]", this.ip);
        this.chat = new Chat(undefined, serverOverrides);
        this.ws = ws;
        this.moderation = new ModerationCache(moderation);
        this.chatCompletion = chatCompletion;
        this.initWebSocketInactivityTimeout();

        this.ws.on("message", (data, isBinary) => {
            this.onWebSocketMessage(data, isBinary);
        });
        this.ws.on("error", (err) => {
            this.onWebSocketError(err);
        });
        this.ws.on("close", () => {
            this.onWebSocketClose();
        });
    }

    private sendMessage(msg: ApiBackendMessage) {
        this.ws.send(JSON.stringify(msg));
    }

    // On web socket message
    private onWebSocketMessage(data: unknown, isBinary: boolean) {
        let processed = false;
        try {
            if (!isBinary && (typeof data === "string" || Buffer.isBuffer(data))) {
                const amsg: unknown = JSON.parse(data.toString());
                if (isApiFrontendMessage(amsg)) {
                    if (isConfigRequest(amsg)) {
                        logInterfaceData("Received a configuration request [%s]", amsg, this.ip);
                        const res: ConfigResponse = {
                            type: "cfgres",
                            ...(this.config?.allowUsers !== undefined || this.config?.googleOAuthClientId !== undefined
                                ? {
                                      auth: {
                                          required: this.config.allowUsers !== undefined,
                                          googleId: this.config.googleOAuthClientId,
                                      },
                                  }
                                : {}),
                        };
                        logInterfaceData("Sending a configuration response [%s]", res, this.ip);
                        this.sendMessage(res);
                        processed = true;
                    } else if (isAuthRequest(amsg)) {
                        logInterfaceData("Received an authentication request [%s]", amsg, this.ip);
                        this.handleAuthRequest(amsg);
                        processed = true;
                    } else {
                        logInterfaceData("Received a chat update [%s]", amsg, this.ip);
                        this.chat.update(amsg);
                        processed = true;
                    }
                    if (this.chat.backendProcessing) {
                        this.clearInactivityTimer();
                        this.doChatCompletion();
                    } else {
                        this.initWebSocketInactivityTimeout();
                    }
                }
            }
            if (!processed) {
                logError("Received an unrecognized message from the client [%s]", this.ip);
                console.debug("msg = " + JSON.stringify(data));
            }
        } catch (err: unknown) {
            logThrownError("Failed to process a client message [%s]", err, this.ip);
        }
    }

    // On web socket error
    private onWebSocketError(err: unknown) {
        logThrownError("Web socket error [%s]", err, this.ip);
        this.clearInactivityTimer();
    }

    // On web socket close
    private onWebSocketClose() {
        logDebug("Web socket closed [%s]", this.ip);
        this.clearInactivityTimer();
    }

    private handleAuthRequest(req: AuthRequest) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (req.info.type === "google") {
            let user: string | undefined;
            let authError: AuthError | undefined;
            this.checkGoogleAuthRequest(req.info.creds)
                .then((u) => {
                    user = u;
                    const res: AuthResponse = {
                        type: "authres",
                        error: (authError = this.isAuthorized(u) ? undefined : "unauthorized"),
                    };
                    this.sendMessage(res);
                })
                .catch((err: unknown) => {
                    logThrownError("Google login failed", err);
                    this.sendMessage({ type: "authres", error: (authError = "failed") });
                })
                .finally(() => {
                    if (authError) {
                        logInfo("Google authentication failed [%s]", this.ip);
                    } else {
                        logInfo("Google authentication completed for %s [%s]", user, this.ip);
                    }
                });
        } else {
            throw new VerbalWebError("Unsupported authentication method");
        }
    }

    private isAuthorized(user: string): boolean {
        if (this.config?.allowUsers === undefined) {
            return true;
        } else {
            const ulc = user.toLowerCase();
            for (const au of this.config.allowUsers) {
                const aulc = au.toLowerCase();
                if (ulc == aulc || ulc.endsWith("@" + aulc)) {
                    return true;
                }
            }
        }
        return false;
    }

    private async checkGoogleAuthRequest(creds: CredentialResponse): Promise<string> {
        if (creds.credential) {
            const ticket = await this.googleClient.verifyIdToken({
                idToken: creds.credential,
                audience: this.config?.googleOAuthClientId,
            });
            const user = ticket.getPayload()?.email;
            if (user) {
                return user;
            }
        }
        throw new VerbalWebError("Google authentication failed on missing information");
    }

    private initWebSocketInactivityTimeout() {
        this.clearInactivityTimer();
        this.inactivityTimer = setTimeout(() => {
            this.inactivityTimer = undefined;
            logDebug("Closing the connection due to inactivity timeout [%s]", this.ip);
            this.ws.close();
        }, INACTIVITY_TIMEOUT_MILLIS);
    }

    private clearInactivityTimer() {
        if (this.inactivityTimer !== undefined) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = undefined;
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
            messages: [...systemInstructions, ...this.chat.state.messages],
        };

        // Perform moderation
        const moderationContent: string[] = request.messages
            .map((m) => m.content)
            .flatMap((c) => chunkText(this.moderation.textChunkerParams, c));
        this.moderation
            .checkModeration(...moderationContent)
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
                                    this.handleError(err, "chat");
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
                        this.handleError(err, "chat");
                    });
            })
            .catch((err: unknown) => {
                this.handleError(err, "moderation");
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
                    .checkModeration(moderationInput)
                    .then(() => {
                        state.moderationPending = false;
                        state.moderated = value.end;
                        this.process(state);
                    })
                    .catch((err: unknown) => {
                        if (err instanceof ModerationRejectedError) {
                            this.handleError(err, "moderation");
                        }
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
    }

    /** Send buffered data to the client */
    private sendData(state: ChatCompletionState, allDone: boolean) {
        const msg: ChatMessagePart = {
            type: "msgpart",
            content: state.completion.slice(state.sent),
            done: allDone,
        };
        logInterfaceData("Sending a chat update [%s]", msg, this.ip);
        this.sendMessage(msg);
        state.sent = state.completion.length;
        this.clearSendTimeout(state);
    }

    private clearSendTimeout(state: ChatCompletionState) {
        if (state.sendTimeout !== undefined) {
            clearTimeout(state.sendTimeout);
        }
    }

    private handleError(err: unknown, errorCode: ChatMessageErrorCode) {
        const errorMessage = (
            {
                connection: "Assistant connection failed",
                moderation: "Moderation failed",
                chat: "Chat completion failed",
                limit: "Chat completion usage limit encountered",
            } as Record<ChatMessageErrorCode, string>
        )[errorCode];
        logThrownError(errorMessage + " [%s]", err, this.ip);
        if (this.ws.readyState === WebSocket.OPEN) {
            const msg: ChatMessageError = { type: "msgerror", code: errorCode, message: errorMessage };
            logInterfaceData("Sending a chat error [%s]", msg, this.ip);
            this.sendMessage(msg);
            this.ws.close();
        }
    }
}
