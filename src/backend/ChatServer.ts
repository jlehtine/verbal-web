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
import { RequestContext } from "./RequestContext";
import { TextChunker, chunkText } from "./TextChunker";
import { logDebug, logError, logInfo, logInterfaceData, logThrownError } from "./log";
import { CredentialResponse } from "@react-oauth/google";
import { Request } from "express";
import { OAuth2Client } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";
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
    /** Request context */
    private readonly requestContext: RequestContext;

    /** Server configuration */
    private readonly config;

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

    private authenticated;

    constructor(
        req: Request,
        ws: WebSocket,
        moderation: ModerationProvider,
        chatCompletion: ChatCompletionProvider,
        config?: ChatServerConfig,
        serverOverrides?: InitialChatStateOverrides,
    ) {
        this.requestContext = { chatId: uuidv4(), sourceIp: req.ip };
        this.config = config;
        this.debug("Accepted a web socket connection");
        this.chat = new Chat(undefined, serverOverrides);
        this.ws = ws;
        this.moderation = new ModerationCache(moderation);
        this.chatCompletion = chatCompletion;
        this.authenticated = this.config?.allowUsers === undefined;
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

    private debugData(msg: string, data: unknown, ...params: unknown[]) {
        logInterfaceData(msg, this.requestContext, data, ...params);
    }

    private sendMessage(msg: ApiBackendMessage, desc: string) {
        this.debugData("Sending %s", msg, desc);
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
                        this.debugData("Received a configuration request", amsg);
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
                        this.sendMessage(res, "a configuration response");
                        processed = true;
                    } else if (isAuthRequest(amsg)) {
                        this.debugData("Received an authentication request", amsg);
                        this.handleAuthRequest(amsg).catch((err: unknown) => {
                            this.thrownError("Authentication request processing failed", err);
                        });
                        processed = true;
                    } else if (!this.authenticated) {
                        this.error("Unauthenticated request (ignoring)");
                        processed = true;
                    } else {
                        this.debugData("Received a chat update", amsg);
                        this.chat.update(amsg);
                        processed = true;
                    }
                    if (this.chat.backendProcessing) {
                        this.info("Chat completion requested");
                        this.clearInactivityTimer();
                        this.doChatCompletion();
                    } else {
                        this.initWebSocketInactivityTimeout();
                    }
                }
            }
            if (!processed) {
                this.error("Received an unrecognized message");
                this.debugData("Unrecognized input message", data);
            }
        } catch (err: unknown) {
            this.thrownError("Failed to process a client message [%s]", err);
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

    private async handleAuthRequest(req: AuthRequest) {
        // Reset any existing authentication on new authencation request
        this.authenticated = false;
        this.requestContext.userEmail = undefined;

        let user: string | undefined;
        let authError: AuthError | undefined;

        // Google authentication
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (req.info.type === "google") {
            try {
                user = await this.checkGoogleAuthRequest(req.info.creds);
                this.debug("Google authenticated %s", user);
            } catch (err) {
                this.thrownError("Google authentication failed", err);
                authError = "failed";
            }
        }

        // Unsupported authencation method
        else {
            throw new VerbalWebError("Unsupported authentication method");
        }

        // Check authorization
        if (user && !authError) {
            if (this.isAuthorized(user)) {
                this.authenticated = true;
                this.requestContext.userEmail = user;
                this.info("User authenticated and authorized");
            } else {
                authError = "unauthorized";
                this.info("Authenticated user %s is not authorized", user);
            }
        }

        const res: AuthResponse = {
            type: "authres",
            error: authError,
        };
        this.sendMessage(res, "an authentication response");
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
                moderation: "Moderation failed",
                chat: "Chat completion failed",
                limit: "Chat completion usage limit encountered",
            } as Record<ChatMessageErrorCode, string>
        )[errorCode];
        this.thrownError(errorMessage, err);
        if (this.ws.readyState === WebSocket.OPEN) {
            const msg: ChatMessageError = { type: "msgerror", code: errorCode, message: errorMessage };
            this.chat.update(msg);
            this.sendMessage(msg, "a chat error");
            this.ws.close();
        }
    }
}
