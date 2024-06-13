import {
    ApiFrontendChatMessage,
    ChatInit,
    ChatMessageNew,
    SharedConfig,
    isApiBackendChatMessage,
    isChatMessageError,
    isSharedConfig,
} from "../shared/api";
import { Chat, InitialChatState } from "../shared/chat";
import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { retryWithBackoff } from "../shared/retry";
import { logDebug, logError, logThrownError } from "./log";
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
export type AuthError = "failed" | "unauthorized";

/**
 * A client for the chat backend.
 */
export class ChatClient extends TypedEventTarget<ChatClient, ChatClientEventMap> {
    /** Whether currently busy with initialization */
    get initializing(): boolean {
        return (
            this.sharedConfig === undefined ||
            (this.sharedConfig.auth?.required === true &&
                (!this.authChecked || (this.idToken !== undefined && !this.authInitialized)))
        );
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
    authError?: AuthError;

    /** Chat model */
    chat;

    /** Chat client connection state */
    connectionState = ChatConnectionState.UNCONNECTED;

    private ws?: WebSocket;

    private numErrors = 0;

    private retryTimer?: number;

    private inactivityTimer?: number;

    private idProvider?: IdentityProviderId;

    private idToken?: string;

    private authChecked = false;

    private authInitialized = false;

    private chatInitialized = false;

    private readonly backendUrl;

    constructor(backendUrl: string, initialState: InitialChatState) {
        logDebug("Chat client initialization");
        super();
        this.backendUrl = backendUrl;
        this.chat = new Chat(initialState);
        this.updateState();
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

        // Send the API message, if possible
        this.updateState(amsg);

        this.chatEvent();
    }

    /**
     * Submits authentication request.
     *
     * @param idProvider identity provider
     * @param idToken identity token
     */
    submitAuthentication(idProvider: IdentityProviderId, idToken: string): void {
        // Authentication request
        this.idProvider = idProvider;
        this.idToken = idToken;
        this.authInitialized = false;

        // Send the API message, if possible
        this.updateState();

        this.initializationEvent();
    }

    /**
     * Sets authentication error.
     *
     * @param error authentication error code
     */
    setAuthError(error: AuthError | undefined) {
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
                        } else if (res.status === StatusCodes.UNAUTHORIZED.valueOf()) {
                            logDebug("Session not found, authentication is required");
                            return false;
                        }
                        throw new VerbalWebError(httpStatusError(res, "Request failed"));
                    });
                },
                (err: unknown) => {
                    logThrownError("Failed to check for an existing session", err);
                },
            )
                .then((sessionOk) => {
                    this.authChecked = true;
                    this.authError = undefined;
                    this.authInitialized = sessionOk;
                    this.initializationEvent();
                    this.updateState();
                })
                .catch((err: unknown) => {
                    logThrownError("Unable to check for a session", err);
                });
        }

        // Authentication request pending?
        else if (this.idProvider && this.idToken && !this.authInitialized) {
            const idp = this.idProvider;
            const idt = this.idToken;
            retryWithBackoff(
                () => {
                    logDebug("Sending an authentication request");
                    return fetch(getHttpUrl(this.backendUrl, AUTH_LOGIN_PATH_PREFIX + encodeURIComponent(idp)), {
                        method: "post",
                        headers: {
                            Authorization: "Bearer " + idt,
                        },
                    }).then((res) => {
                        if (res.ok) {
                            logDebug("Authenticated successfully");
                            return true;
                        } else if (
                            res.status === StatusCodes.UNAUTHORIZED.valueOf() ||
                            res.status === StatusCodes.FORBIDDEN.valueOf()
                        ) {
                            logDebug("Unauthorized to use the service");
                            return false;
                        }
                        throw new VerbalWebError(httpStatusError(res, "Unexpected error while authenticating"));
                    });
                },
                (err: unknown) => {
                    logThrownError("Failed to send an authentication request", err);
                },
            )
                .then((ok) => {
                    if (ok) {
                        this.authInitialized = true;
                        this.initializationEvent();
                        this.updateState();
                    } else {
                        throw new VerbalWebError("Authentication rejected or not authorized");
                    }
                })
                .catch((err: unknown) => {
                    logThrownError("Unauthorized", err);
                    this.setAuthError("unauthorized");
                    this.idProvider = undefined;
                    this.idToken = undefined;
                    this.initializationEvent();
                });
        }

        // Ready to send chat content to backend?
        else if (this.chat.backendProcessing && (!this.sharedConfig.auth?.required || this.authInitialized)) {
            // Need chat initialization?
            if (!this.chatInitialized || this.chat.error !== undefined) {
                if (this.ensureWebSocket()) {
                    logDebug("Sending the chat initialization");
                    const init: ChatInit = { ...this.chat.state, type: "init" };
                    this.chat.update(init);
                    this.sendMessage(init);
                    this.chatInitialized = true;
                }
            }

            // Can send the supplied message?
            else if (msg) {
                if (this.ensureWebSocket()) {
                    logDebug("Sending a chat update");
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
        this.ws.send(JSON.stringify(msg));
        this.clearInactivityTimer();
    }

    /**
     * Initializes a web socket.
     */
    private initWebSocket(): WebSocket {
        const wsUrl = getWebSocketUrl(this.backendUrl);
        logDebug("Connecting to %s", wsUrl);
        this.clearRetryTimer();
        const ws = new WebSocket(wsUrl);

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
            this.initWebSocketInactivityTimeout();
        }
    }

    // On web socket message
    private onWebSocketMessage(ws: WebSocket, ev: MessageEvent) {
        if (ws === this.ws && ws.readyState === WebSocket.OPEN) {
            try {
                let processed = false;
                const data: unknown = ev.data;
                if (typeof data === "string") {
                    const amsg: unknown = JSON.parse(data);
                    if (isApiBackendChatMessage(amsg)) {
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
                            this.initWebSocketInactivityTimeout();
                        }
                        processed = true;
                    }
                }
                if (!processed) {
                    logError("Received an unrecognized message from the backend");
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
        this.clearInactivityTimer();
        this.chatInitialized = false;
    }

    /**
     * Retries web socket connection after an exponential backoff.
     */
    private retryWebSocket() {
        this.clearRetryTimer();
        this.clearInactivityTimer();
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
     * Initializes or re-initializes the inactivity timeout for the web socket.
     */
    private initWebSocketInactivityTimeout() {
        this.clearInactivityTimer();
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
    private clearInactivityTimer() {
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
        this.clearInactivityTimer();

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
}

/** An event dispatched on initialization updates */
export type InitializationEvent = TypedEvent<ChatClient, "init">;

/**
 * An event dispatched on chat changes.
 */
export type ChatEvent = TypedEvent<ChatClient, "chat">;
