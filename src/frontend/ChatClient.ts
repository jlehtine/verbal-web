import { ApiFrontendMessage, ChatInit, isApiBackendMessage } from "../shared/api";
import { Chat, InitialChatState } from "../shared/chat";
import { VerbalWebError } from "../shared/error";
import { TypedEvent, TypedEventTarget } from "../shared/event";
import { logDebug, logError, logThrownError } from "./log";

/** Path to the added to the backend URL for WebSocket connections */
const WS_PATH = "chatws";

/** Base backoff period in milliseconds for exponential backoff */
const BACKOFF_BASE_MILLIS = 8;

/** Inactivity timeout is one minute */
const INACTIVITY_TIMEOUT_MILLIS = 60 * 1000;

/**
 * A client for the chat backend.
 */
export class ChatClient extends TypedEventTarget<ChatClient, ChatClientEventMap> {
    /** Chat model */
    chat;

    /** Chat client connection state */
    connectionState = ChatConnectionState.UNCONNECTED;

    /** Web socket URL */
    private wsUrl;

    private ws: WebSocket | undefined;

    private numErrors = 0;

    private retryTimer?: number;

    private inactivityTimer?: number;

    constructor(backendUrl: string, initialState: InitialChatState) {
        logDebug("Chat client initialization");
        super();
        this.chat = new Chat(initialState);
        this.wsUrl = getWebSocketUrl(backendUrl);
    }

    /**
     * Submits a new user message to the backend.
     *
     * @param content message text
     */
    submitMessage(content: string) {
        this.updateChat({ type: "msgnew", content: content });
    }

    /**
     * Updates a chat.
     *
     * @param amsg API message
     */
    private updateChat(amsg: ApiFrontendMessage) {
        // Update chat model state
        this.chat.update(amsg);

        // Check if WebSocket needs to be created
        if (this.ws === undefined) {
            this.initWebSocket();
        }

        // Otherwise send the API message if already connected
        else if (this.connectionState == ChatConnectionState.CONNECTED) {
            logDebug("Sending a chat update");
            this.ws.send(JSON.stringify(amsg));
        }
    }

    /**
     * Initializes the web socket and its listeners.
     */
    private initWebSocket() {
        logDebug(`Connecting to ${this.wsUrl.toString()}`);
        this.clearRetryTimer();
        const ws = (this.ws = new WebSocket(this.wsUrl));

        // On connection established
        ws.addEventListener("open", () => {
            if (ws === this.ws) {
                logDebug("Connection established");
                this.connectionState = ChatConnectionState.CONNECTED;
                this.clearRetryTimer();
                if (this.chat.backendProcessing) {
                    const initMsg: ChatInit = { ...this.chat.state, type: "init" };
                    logDebug("Sending the chat initialization");
                    ws.send(JSON.stringify(initMsg));
                }
                this.initWebSocketInactivityTimeout();
                this.changed();
            }
        });

        // On received message
        ws.addEventListener("message", (ev) => {
            if (ws === this.ws) {
                let processed = false;
                try {
                    const data: unknown = ev.data;
                    if (typeof data === "string") {
                        const amsg: unknown = JSON.parse(data);
                        if (isApiBackendMessage(amsg)) {
                            logDebug("Received a chat update");
                            this.chat.update(amsg);
                            processed = true;
                            this.numErrors = 0;
                            this.initWebSocketInactivityTimeout();
                        }
                    }
                    if (!processed) {
                        logError("Received an unrecognized message from the backend");
                    }
                } catch (err: unknown) {
                    logThrownError("Failed to process a backend message", err);
                }
                this.changed();
            }
        });

        // On error
        ws.addEventListener("error", (ev) => {
            if (ws === this.ws) {
                logThrownError("Connection error", ev);
                this.ws = undefined;
                this.connectionState = ChatConnectionState.ERROR;
                this.retryWebSocket();
                this.changed();
            }
        });

        // On connection closed
        ws.addEventListener("close", () => {
            if (ws === this.ws) {
                logDebug("Connection closed");
                this.connectionState = ChatConnectionState.UNCONNECTED;
                this.clearInactivityTimer();
                this.changed();
            }
        });

        if (this.connectionState !== ChatConnectionState.ERROR) {
            this.connectionState = ChatConnectionState.CONNECTING;
        }
        this.changed();
    }

    /**
     * Retries web socket connection after an exponential backoff.
     */
    private retryWebSocket() {
        this.clearRetryTimer();
        this.clearInactivityTimer();
        this.numErrors++;
        const backoffBase = Math.pow(BACKOFF_BASE_MILLIS, this.numErrors);
        const backoff = backoffBase + Math.random() * backoffBase;
        logDebug("Retrying to connect in %d milliseconds", backoff);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.initWebSocket();
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
            if (
                this.ws !== undefined &&
                this.connectionState == ChatConnectionState.CONNECTED &&
                !this.chat.backendProcessing
            ) {
                logDebug("Closing the connection due to inactivity timeout");
                this.ws.close();
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
        if (this.ws !== undefined) {
            this.ws.close();
            this.ws = undefined;
        }
    }

    /**
     * Dispatches a chat change event to all listeners.
     */
    private changed() {
        this.dispatchEvent({ target: this, type: "change" });
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
    change: ChatChangeEvent;
}

/**
 * An event dispatched on chat changes.
 */
export type ChatChangeEvent = TypedEvent<ChatClient, "change">;

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
