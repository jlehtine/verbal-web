import {
    ApiFrontendMessage,
    AuthError,
    AuthInfo,
    AuthRequest,
    ChatInit,
    ChatMessageNew,
    SharedConfig,
    isApiBackendMessage,
    isAuthResponse,
    isConfigResponse,
} from "../shared/api";
import { Chat, InitialChatState } from "../shared/chat";
import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { logDebug, logError, logThrownError } from "./log";

/** Path to the added to the backend URL for WebSocket connections */
const WS_PATH = "chatws";

/** Base backoff period in milliseconds for exponential backoff */
const BACKOFF_BASE_MILLIS = 100;

/** Inactivity timeout is one minute */
const INACTIVITY_TIMEOUT_MILLIS = 60 * 1000;

export function isAuthError(v: unknown): v is AuthError {
    return v === "error" || v === "unauthorized";
}

/**
 * A client for the chat backend.
 */
export class ChatClient extends TypedEventTarget<ChatClient, ChatClientEventMap> {
    /** Shared configuration */
    sharedConfig?: SharedConfig;

    /** Whether authentication is currently pending */
    get authPending() {
        return this.pendingAuth !== undefined;
    }

    /** Is user authenticated */
    authenticated: boolean;

    /** Authentication error */
    authError?: AuthError;

    /** Chat model */
    chat;

    /** Chat client connection state */
    connectionState = ChatConnectionState.UNCONNECTED;

    /** Web socket URL */
    private wsUrl;

    private ws: WebSocket;

    private numErrors = 0;

    private retryTimer?: number;

    private inactivityTimer?: number;

    private pendingAuth?: AuthRequest;

    constructor(backendUrl: string, initialState: InitialChatState) {
        logDebug("Chat client initialization");
        super();
        this.authenticated = false;
        this.chat = new Chat(initialState);
        this.wsUrl = getWebSocketUrl(backendUrl);
        this.ws = this.initWebSocket();
    }

    /**
     * Submits a new user message to the backend.
     *
     * @param content message text
     */
    submitMessage(content: string) {
        // Update chat model state
        const amsg: ChatMessageNew = { type: "msgnew", content: content };
        this.chat.update(amsg);

        // Send the API message if already connected
        if (this.ensureWebSocket()) {
            logDebug("Sending a chat update");
            this.sendMessage(amsg);
        }

        this.chatEvent();
    }

    /**
     * Submits authentication request.
     *
     * @param info authentication information
     */
    submitAuthentication(info: AuthInfo) {
        // Authentication request
        this.authenticated = false;
        this.pendingAuth = { type: "authreq", info: info };

        // Send the API message if already connected
        if (this.ensureWebSocket()) {
            logDebug("Sending an authentication request");
            this.sendMessage(this.pendingAuth);
        }

        this.initializationEvent();
    }

    /**
     * Sets authentication error.
     *
     * @param error authentication error code
     */
    setAuthError(error?: AuthError) {
        if (error !== undefined) {
            this.authenticated = false;
        }
        this.authError = error;
        this.initializationEvent();
    }

    private ensureWebSocket(): boolean {
        let ready = false;

        // Check if WebSocket needs to be created
        if (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED) {
            this.ws = this.initWebSocket();
        }

        // Or if already connected
        else if (this.connectionState === ChatConnectionState.CONNECTED) {
            ready = true;
        }

        return ready;
    }

    private sendMessage(msg: ApiFrontendMessage) {
        this.ws.send(JSON.stringify(msg));
    }

    /**
     * Initializes a web socket.
     */
    private initWebSocket(): WebSocket {
        logDebug("Connecting to %s", this.wsUrl);
        this.clearRetryTimer();
        const ws = new WebSocket(this.wsUrl);

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
            if (this.sharedConfig === undefined) {
                logDebug("Requesting configuration");
                ws.send(JSON.stringify({ type: "cfgreq" }));
            }
            if (this.chat.backendProcessing) {
                const initMsg: ChatInit = { ...this.chat.state, type: "init" };
                logDebug("Sending the chat initialization");
                ws.send(JSON.stringify(initMsg));
            }
            this.initWebSocketInactivityTimeout();
            this.chatEvent();
        }
    }

    // On web socket message
    private onWebSocketMessage(ws: WebSocket, ev: MessageEvent) {
        if (ws === this.ws && ws.readyState === WebSocket.OPEN) {
            let processed = false;
            try {
                const data: unknown = ev.data;
                if (typeof data === "string") {
                    const amsg: unknown = JSON.parse(data);
                    if (isApiBackendMessage(amsg)) {
                        if (isConfigResponse(amsg)) {
                            logDebug("Received configuration");
                            this.sharedConfig = amsg;
                            this.initializationEvent();
                            if (this.pendingAuth && this.connectionState === ChatConnectionState.CONNECTED) {
                                this.sendMessage(this.pendingAuth);
                            }
                        } else if (isAuthResponse(amsg)) {
                            logDebug("Received an authentication response");
                            this.pendingAuth = undefined;
                            this.authenticated = amsg.error === undefined;
                            this.authError = amsg.error;
                            this.initializationEvent();
                        } else {
                            logDebug("Received a chat update");
                            this.chat.update(amsg);
                            this.numErrors = 0;
                            this.chatEvent();
                        }
                        processed = true;
                        this.initWebSocketInactivityTimeout();
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
            this.retryWebSocket();
            this.chatEvent();
        }
    }

    // On web socket close
    private onWebSocketClose(ws: WebSocket) {
        if (ws === this.ws) {
            logDebug("Connection closed");
            this.connectionState = ChatConnectionState.UNCONNECTED;
            this.clearInactivityTimer();
            this.chatEvent();
        }
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
        this.inactivityTimer = setTimeout(() => {
            this.inactivityTimer = undefined;
            if (this.connectionState == ChatConnectionState.CONNECTED && !this.chat.backendProcessing) {
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
        if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
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
 * Determine the actual full backend URL based on the specified URL.
 *
 * @param backendUrl configured URL
 */
function getWebSocketUrl(backendUrl: string): URL {
    let backendBase = backendUrl;
    if (backendBase === "") {
        backendBase = window.location.href;
    } else if (backendBase && !backendBase.endsWith("/")) {
        backendBase += "/";
    }
    const url = new URL(WS_PATH, backendBase);
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
