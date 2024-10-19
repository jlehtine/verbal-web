import {
    ApiFrontendChatMessage,
    ChatInit,
    ChatMessageNew,
    ChatAudio,
    ChatRealtimeStop,
    LogRequestLevel,
    SharedConfig,
    isApiBackendChatMessage,
    isChatMessageError,
    isSharedConfig,
} from "../shared/api";
import { Chat, InitialChatState } from "../shared/chat";
import { describeError, VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { retryWithBackoff } from "../shared/retry";
import { apiMessageToWsData, wsDataToApiMessage } from "../shared/wsdata";
import { SUPPORTED_REALTIME_INPUT_AUDIO_TYPE, SUPPORTED_REALTIME_OUTPUT_AUDIO_TYPE } from "./AudioProvider";
import { logDebug, logThrownError } from "./log";
import { StatusCodes } from "http-status-codes";

/** Paths to backend endpoints */
const CONF_PATH = "vw/conf";
const AUTH_SESSION_PATH = "vw/auth/session";
const AUTH_LOGIN_PATH_PREFIX = "vw/auth/login/";
const CHAT_PATH = "vw/chat";

/** Base backoff period in milliseconds for exponential backoff */
const BACKOFF_BASE_MILLIS = 100;

/** Inactivity timeout is one minute */
const INACTIVITY_TIMEOUT_MILLIS = 60 * 1000;

/** Identity provider identifiers */
export type IdentityProviderId = "google";

/**
 * State of the chat client backend connection
 */
export enum ChatConnectionState {
    /** Not currently connected */
    UNCONNECTED,

    /** Connecting to the backend */
    CONNECTING,

    /** Connected to the backend and ready to send data */
    CONNECTED,

    /** A connection error was detected */
    ERROR,
}

/** Authentication errors */
export type AuthErrorCode = "failed" | "unauthorized";

/** Signals authentication failure */
export class AuthError extends VerbalWebError {
    readonly errorCode: AuthErrorCode;

    constructor(msg: string, code: AuthErrorCode, options?: ErrorOptions) {
        super(msg, options);
        this.errorCode = code;
    }
}

/**
 * A client for the chat backend.
 */
export class ChatClient extends TypedEventTarget<ChatClient, ChatClientEventMap> {
    /** Whether currently busy with initialization */
    get initializing(): boolean {
        return this.sharedConfig === undefined || (this.sharedConfig.auth?.required === true && !this.authChecked);
    }

    /** Whether currently expecting a login and a list of supported identity providers */
    get expectLogin(): undefined | IdentityProviderId[] {
        return !this.initializing &&
            !this.authInitialized &&
            this.sharedConfig?.auth?.required &&
            this.sharedConfig.auth.googleId &&
            !this.idToken
            ? ["google"]
            : undefined;
    }

    /** Shared configuration */
    sharedConfig?: SharedConfig;

    /** Authentication error */
    authError?: AuthErrorCode;

    /** Chat model */
    chat;

    /** Chat client connection state */
    connectionState = ChatConnectionState.UNCONNECTED;

    realtimeStarted = false;

    private ws?: WebSocket;

    private numErrors = 0;

    private retryTimer?: number;

    private inactivityTimer?: number;

    private idProvider?: IdentityProviderId;

    private idToken?: string;

    private authChecked = false;

    private authInitialized = false;

    private chatInitialized = false;

    private pendingMessages: ApiFrontendChatMessage[] = [];

    private pendingPrepareChat = false;

    private realtime = false;

    private readonly backendUrl;

    constructor(backendUrl: string, initialState: InitialChatState) {
        logDebug("Chat client initialization");
        super();
        this.backendUrl = backendUrl;
        this.chat = new Chat(initialState);
        this.updateState();
    }

    /**
     * Prepares the chat connectivity for use when input is expected.
     */
    prepareChat(reinit = false) {
        this.initInactivityTimeout();
        if (!this.chatInitialized || reinit) {
            this.pendingPrepareChat = true;
            this.updateState();
        }
    }

    /**
     * Submits a new user message to the backend.
     *
     * @param content message text
     */
    submitMessage(content: string): void {
        // Update chat model state
        const amsg: ChatMessageNew = { type: "msgnew", content: content };
        this.chat.update(amsg);
        this.chatEvent();

        // Send the API message, if possible
        this.updateState(amsg);
    }

    /**
     * Start a realtime conversation.
     */
    startRealtime() {
        logDebug("Starting a realtime conversation");
        this.realtime = true;
        this.prepareChat(true);
    }

    /**
     * Submit realtime audio data.
     *
     * @param buffer audio data
     */
    submitAudio(buffer: ArrayBuffer) {
        const amsg: ChatAudio = { type: "audio", binary: buffer };
        this.submitApiMessage(amsg);
    }

    /**
     * Commit realtime audio data.
     */
    commitAudio() {
        logDebug("Committing audio for transcription");
        this.submitApiMessage({ type: "audiocommit" });
    }

    /**
     * Stop a realtime conversation.
     */
    stopRealtime() {
        if (!this.realtime) return;
        logDebug("Stopping a realtime conversation");
        this.realtime = false;
        this.realtimeStarted = false;

        // Clear any pending audio messages
        this.pendingMessages = this.pendingMessages.filter((msg) => msg.type !== "audio");

        // Send a stop message, if connected to an initialized chat
        if (this.chatInitialized && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const amsg: ChatRealtimeStop = { type: "rtstop" };
            this.sendMessage(amsg);
        }
    }

    /**
     * Submits an API message to the backend. Also updates the chat state.
     *
     * @param message API message to send
     */
    submitApiMessage(message: ApiFrontendChatMessage) {
        if (this.chat.update(message)) {
            this.chatEvent();
        }
        this.pendingMessages.push(message);
        this.updateState();
    }

    /**
     * Sends an error log to the backend.
     *
     * @param message message
     * @param err error, if available
     */
    submitLog(level: LogRequestLevel, message: string, err?: unknown) {
        const msg = err != undefined ? describeError(err, true, message) : message;
        const logRequest = { level: level, message: msg };
        fetch(getHttpUrl(this.backendUrl, "vw/log"), {
            method: "post",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(logRequest),
        }).catch((err: unknown) => {
            logThrownError("Failed to send an error log", err);
        });
    }

    /**
     * Login to backend.
     *
     * @param idProvider identity provider
     * @param idToken identity token
     */
    async login(idProvider: IdentityProviderId, idToken: string): Promise<void> {
        // Update state
        this.idProvider = undefined;
        this.idToken = undefined;
        this.authInitialized = false;
        this.initializationEvent();

        // Authentication request
        return retryWithBackoff(
            () => {
                logDebug("Sending an authentication request");
                return fetch(getHttpUrl(this.backendUrl, AUTH_LOGIN_PATH_PREFIX + encodeURIComponent(idProvider)), {
                    method: "post",
                    headers: {
                        Authorization: "Bearer " + idToken,
                    },
                }).then((res) => {
                    if (res.ok) {
                        logDebug("Authenticated successfully");
                        return undefined;
                    } else if (res.status === StatusCodes.UNAUTHORIZED.valueOf()) {
                        logDebug("Unauthorized to use the service");
                        return "unauthorized";
                    } else if (res.status >= 400 && res.status <= 499) {
                        logDebug("Authentication request failed: HTTP error %d", res.status);
                        return "failed";
                    } else {
                        throw new VerbalWebError(httpStatusError(res, "Error while authenticating"));
                    }
                });
            },
            (err: unknown) => {
                logThrownError("Failed to send an authentication request", err);
            },
            5,
        )
            .then((errorCode) => {
                if (!errorCode) {
                    this.idProvider = idProvider;
                    this.idToken = idToken;
                    this.authInitialized = true;
                } else {
                    throw new AuthError("Authentication failed", errorCode);
                }
            })
            .catch((err: unknown) => {
                this.setAuthError(err instanceof AuthError ? err.errorCode : "failed");
                this.initializationEvent();
                throw err;
            })
            .finally(() => {
                this.authChecked = true;
                this.initializationEvent();
                this.updateState();
            });
    }

    /**
     * Sets authentication error.
     *
     * @param error authentication error code
     */
    setAuthError(error: AuthErrorCode | undefined) {
        this.authError = error;
        if (error) {
            this.idProvider = undefined;
            this.idToken = undefined;
            this.authInitialized = false;
        }
        this.initializationEvent();
    }

    /**
     * Updates client state for the next step.
     *
     * @param msg Optional chat message update to be sent, if ready for it
     */
    private updateState(msg?: ChatMessageNew) {
        // Need configuration details?
        if (!this.sharedConfig) {
            retryWithBackoff(
                () => {
                    logDebug("Requesting configuration");
                    return fetch(getHttpUrl(this.backendUrl, CONF_PATH)).then((res) => {
                        checkResponseStatus(res, "Request failed");
                        return res.json().then((conf) => {
                            if (!isSharedConfig(conf)) {
                                throw new VerbalWebError("Unsupported configuration content");
                            }
                            logDebug("Received configuration");
                            return conf;
                        });
                    });
                },
                (err: unknown) => {
                    logThrownError("Failed to fetch configuration from backend", err);
                },
            )
                .then((conf) => {
                    this.sharedConfig = conf;
                    this.initializationEvent();
                    this.updateState();
                })
                .catch((err: unknown) => {
                    logThrownError("Unable to configure", err);
                });
        }

        // Existing session needs to be checked?
        else if (this.sharedConfig.auth?.required && !this.authChecked) {
            retryWithBackoff(
                () => {
                    logDebug("Checking for an existing session");
                    return fetch(getHttpUrl(this.backendUrl, AUTH_SESSION_PATH)).then((res) => {
                        if (res.ok) {
                            logDebug("A valid session already exists");
                            return true;
                        } else if (res.status >= 400 && res.status <= 499) {
                            logDebug("Session not found, authentication is required");
                            return false;
                        }
                        throw new VerbalWebError(httpStatusError(res, "Request failed"));
                    });
                },
                (err: unknown) => {
                    logThrownError("Failed to check for an existing session", err);
                },
                5,
            )
                .then((sessionOk) => {
                    if (sessionOk) {
                        this.authInitialized = true;
                    }
                })
                .catch((err: unknown) => {
                    logThrownError("Unable to check for a session", err);
                })
                .finally(() => {
                    this.authChecked = true;
                    this.initializationEvent();
                    this.updateState();
                });
        }

        // Ready to send chat content to backend?
        else if (
            (this.chat.backendProcessing || this.pendingPrepareChat || this.pendingMessages.length > 0) &&
            (!this.sharedConfig.auth?.required || this.authInitialized)
        ) {
            // Need chat initialization?
            if (!this.chatInitialized || this.chat.error !== undefined || this.pendingPrepareChat) {
                if (this.ensureWebSocket()) {
                    logDebug(`Sending the ${this.realtime ? "realtime" : "chat"} initialization`);
                    const init: ChatInit = {
                        type: "init",
                        state: this.chat.state,
                        ...(this.realtime
                            ? {
                                  mode: "realtime",
                                  realtimeInputAudioType: SUPPORTED_REALTIME_INPUT_AUDIO_TYPE,
                                  realtimeOutputAudioType: SUPPORTED_REALTIME_OUTPUT_AUDIO_TYPE,
                              }
                            : { mode: "chat" }),
                    };
                    this.chat.update(init);
                    this.sendMessage(init);
                    this.chatInitialized = true;
                    this.pendingPrepareChat = false;
                    this.updateState();
                }
            } else {
                // Send the pending messages
                this.handlePendingMessages();

                // Can send the supplied message?
                if (msg && this.ensureWebSocket()) {
                    logDebug("Sending a chat update");
                    this.sendMessage(msg);
                }
            }
        }
    }

    private handlePendingMessages() {
        if (this.pendingMessages.length === 0) return;
        if (this.ensureWebSocket()) {
            while (this.pendingMessages.length > 0) {
                const msg = this.pendingMessages.shift();
                if (msg) {
                    this.sendMessage(msg);
                }
            }
        }
    }

    /**
     * Ensure that web socket is available, or initialize it if it is not.
     *
     * @returns whether the web socket i currently available
     */
    private ensureWebSocket(): boolean {
        let ready = false;

        // Check if WebSocket needs to be created
        if (
            this.ws === undefined ||
            this.ws.readyState === WebSocket.CLOSING ||
            this.ws.readyState === WebSocket.CLOSED
        ) {
            this.ws = this.initWebSocket();
        }

        // Or if already connected
        else if (this.ws.readyState === WebSocket.OPEN) {
            ready = true;
        }

        return ready;
    }

    private sendMessage(msg: ApiFrontendChatMessage) {
        if (this.ws === undefined) throw new VerbalWebError("Web socket not created");
        this.ws.send(apiMessageToWsData(msg));
        this.updateInactivityTimeout();
    }

    /**
     * Initializes a web socket.
     */
    private initWebSocket(): WebSocket {
        const wsUrl = getWebSocketUrl(this.backendUrl);
        logDebug("Connecting to %s", wsUrl);
        this.clearRetryTimer();
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";

        ws.addEventListener("open", () => {
            this.onWebSocketOpen(ws);
        });
        ws.addEventListener("message", (ev) => {
            this.onWebSocketMessage(ws, ev);
        });
        ws.addEventListener("error", (ev) => {
            this.onWebSocketError(ws, ev);
        });
        ws.addEventListener("close", () => {
            this.onWebSocketClose(ws);
        });

        if (this.connectionState !== ChatConnectionState.ERROR) {
            this.connectionState = ChatConnectionState.CONNECTING;
        }
        this.chatEvent();
        return ws;
    }

    // On web socket connection
    private onWebSocketOpen(ws: WebSocket) {
        if (ws === this.ws) {
            logDebug("Connection established");
            this.connectionState = ChatConnectionState.CONNECTED;
            this.clearRetryTimer();
            this.updateState();
            this.chatEvent();
            this.initInactivityTimeout();
        }
    }

    // On web socket message
    private onWebSocketMessage(ws: WebSocket, ev: MessageEvent) {
        if (ws === this.ws && ws.readyState === WebSocket.OPEN) {
            try {
                const amsg = wsDataToApiMessage(ev.data, isApiBackendChatMessage);

                // Handle realtime start
                if (amsg.type === "rtstarted") {
                    this.realtimeStarted = true;
                    this.chatEvent();
                }

                // Handle realtime audio
                else if (amsg.type === "audio") {
                    if (this.realtime && this.realtimeStarted) {
                        const event: RealtimeAudioEvent = { target: this, type: "rtaudio", data: amsg.binary };
                        this.dispatchEvent(event);
                    }
                }

                // Handle a chat update
                else {
                    logDebug("Received a chat update");
                    this.chat.update(amsg);
                    this.numErrors = 0;
                    this.chatEvent();
                    if (isChatMessageError(amsg) && amsg.code === "auth") {
                        if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
                            logDebug("Authentication missing, must re-authenticate");
                            this.authInitialized = false;
                            this.authChecked = false;
                            this.connectionState = ChatConnectionState.UNCONNECTED;
                            this.ws.close();
                            this.initializationEvent();
                            this.resetConnectionState();
                            this.updateState();
                        }
                    } else {
                        this.updateInactivityTimeout();
                    }
                }
            } catch (err: unknown) {
                logThrownError("Failed to process a backend message", err);
            }
        }
    }

    // On web socket error
    private onWebSocketError(ws: WebSocket, ev: Event) {
        if (ws === this.ws) {
            logThrownError("Connection error", ev);
            this.connectionState = ChatConnectionState.ERROR;
            this.resetConnectionState();
            this.retryWebSocket();
            this.chatEvent();
        }
    }

    // On web socket close
    private onWebSocketClose(ws: WebSocket) {
        if (ws === this.ws) {
            logDebug("Connection closed");
            this.connectionState = ChatConnectionState.UNCONNECTED;
            this.resetConnectionState();
            this.chatEvent();
        }
    }

    private resetConnectionState() {
        this.clearInactivityTimeout();
        this.chatInitialized = false;
    }

    /**
     * Retries web socket connection after an exponential backoff.
     */
    private retryWebSocket() {
        this.clearRetryTimer();
        this.clearInactivityTimeout();
        const backoffBase = BACKOFF_BASE_MILLIS * Math.pow(2, this.numErrors);
        const backoff = backoffBase + Math.random() * backoffBase;
        logDebug("Retrying to connect in %d milliseconds", backoff);
        this.numErrors++;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.ws = this.initWebSocket();
        }, backoff);
    }

    /**
     * Clears the retry timer, if it is pending.
     */
    private clearRetryTimer() {
        if (this.retryTimer !== undefined) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
    }

    /**
     * Initialize or clear web socket inactivity timeout, depending on the current state.
     */
    private updateInactivityTimeout() {
        if (this.chat.backendProcessing) {
            this.clearInactivityTimeout();
        } else {
            this.initInactivityTimeout();
        }
    }

    /**
     * Initializes or re-initializes the inactivity timeout for the web socket.
     */
    private initInactivityTimeout() {
        this.clearInactivityTimeout();
        if (!this.ws || (this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING)) return;
        this.inactivityTimer = setTimeout(() => {
            this.inactivityTimer = undefined;
            if (
                this.ws &&
                this.ws.readyState !== WebSocket.CLOSED &&
                this.ws.readyState !== WebSocket.CLOSING &&
                !this.chat.backendProcessing
            ) {
                logDebug("Closing the connection due to inactivity timeout");
                this.ws.close();
                this.connectionState = ChatConnectionState.UNCONNECTED;
            }
        }, INACTIVITY_TIMEOUT_MILLIS);
    }

    /**
     * Clears the inactivity timer, if it is pending.
     */
    private clearInactivityTimeout() {
        if (this.inactivityTimer !== undefined) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = undefined;
        }
    }

    /**
     * Closes the connection and releases associated resources.
     */
    close() {
        logDebug("Chat client closing");

        // Clear any pending timers
        this.clearRetryTimer();
        this.clearInactivityTimeout();

        // Close WebSocket
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
            this.ws.close();
        }
        this.connectionState = ChatConnectionState.UNCONNECTED;

        // Notify event listeners
        this.chatEvent();

        // Clear event listeners
        this.clearListeners();
    }

    private initializationEvent() {
        this.dispatchEvent({ target: this, type: "init" });
    }

    /**
     * Dispatches a chat event to all listeners.
     */
    private chatEvent() {
        this.dispatchEvent({ target: this, type: "chat" });
    }
}

/**
 * Determine the full HTTP URL for the specified path.
 *
 * @param backendUrl configured backend URL
 * @param path path under base
 */
function getHttpUrl(backendUrl: string, path: string): URL {
    const backendBase = getBackendBase(backendUrl);
    return new URL(path, backendBase);
}

/**
 * Determine the actual full backend URL based on the specified URL.
 *
 * @param backendUrl configured backend URL
 */
function getWebSocketUrl(backendUrl: string): URL {
    const backendBase = getBackendBase(backendUrl);
    const url = new URL(CHAT_PATH, backendBase);
    const wsProtocol = {
        "http:": "ws:",
        "https:": "wss:",
    }[url.protocol];
    if (wsProtocol === undefined) {
        throw new VerbalWebError(`Failed to resolve web socket URL for backend base URL ${backendUrl}`);
    }
    url.protocol = wsProtocol;
    return url;
}

function getBackendBase(backendUrl: string): string {
    let backendBase = backendUrl;
    if (backendBase === "") {
        backendBase = window.location.href;
    } else if (backendBase && !backendBase.endsWith("/")) {
        backendBase += "/";
    }
    return backendBase;
}

function checkResponseStatus(res: Response, msg: string): void {
    if (!res.ok) {
        throw new VerbalWebError(httpStatusError(res, msg));
    }
}

function httpStatusError(res: Response, msg: string): string {
    return `${msg}: HTTP error ${res.status.toString()}`;
}

// Supported event types
interface ChatClientEventMap {
    init: InitializationEvent;
    chat: ChatEvent;
    rtaudio: RealtimeAudioEvent;
}

/** An event dispatched on initialization updates */
export type InitializationEvent = TypedEvent<ChatClient, "init">;

/**
 * An event dispatched on chat changes.
 */
export type ChatEvent = TypedEvent<ChatClient, "chat">;

/**
 * An event dispatched on realtime audio data.
 */
export interface RealtimeAudioEvent extends TypedEvent<ChatClient, "rtaudio"> {
    /** Realtime audio data */
    data: ArrayBuffer;
}
