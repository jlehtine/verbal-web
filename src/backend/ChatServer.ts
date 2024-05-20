import { ChatMessageError, ChatMessagePart, isApiFrontendMessage } from "../shared/api";
import { Chat, InitialChatStateOverrides } from "../shared/chat";
import { logDebug, logError, logInterfaceData, logThrownError } from "./log";
import { ModerationRejected } from "./moderation";
import { query } from "./query";
import { Request } from "express";
import OpenAI from "openai";
import { WebSocket } from "ws";

/** Inactivity timeout is one minute */
const INACTIVITY_TIMEOUT_MILLIS = 60 * 1000;

/**
 * A server serving a single chat client web socket session.
 */
export class ChatServer {
    /** Client ip */
    private readonly ip;

    /** Chat model */
    private readonly chat;

    /** Web socket */
    private readonly ws;

    /** Open AI client */
    private readonly openai;

    private inactivityTimer?: NodeJS.Timeout;

    constructor(req: Request, ws: WebSocket, openai: OpenAI, serverOverrides?: InitialChatStateOverrides) {
        this.ip = req.ip;
        logDebug("Chat server initialization [%s]", this.ip);
        this.chat = new Chat(undefined, serverOverrides);
        this.ws = ws;
        this.openai = openai;
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

    // On web socket message
    private onWebSocketMessage(data: unknown, isBinary: boolean) {
        let processed = false;
        try {
            if (!isBinary && (typeof data === "string" || Buffer.isBuffer(data))) {
                const amsg: unknown = JSON.parse(data.toString());
                if (isApiFrontendMessage(amsg)) {
                    logInterfaceData("Received a chat update [%s]", amsg, this.ip);
                    this.chat.update(amsg);
                    processed = true;
                    if (this.chat.backendProcessing) {
                        this.clearInactivityTimer();
                        query(this.chat.state, this.openai)
                            .then((response) => {
                                const rmsg: ChatMessagePart = {
                                    type: "msgpart",
                                    content: response,
                                    final: true,
                                };
                                this.chat.update(rmsg);
                                if (this.ws.readyState === WebSocket.OPEN) {
                                    logInterfaceData("Sending a chat update [%s]", rmsg, this.ip);
                                    this.ws.send(JSON.stringify(rmsg));
                                    this.initWebSocketInactivityTimeout();
                                }
                            })
                            .catch((err: unknown) => {
                                logThrownError("Chat completion failed [%s]", err, this.ip);
                                const rmsg: ChatMessageError = {
                                    type: "msgerror",
                                    code: err instanceof ModerationRejected ? "moderation" : "chat",
                                };
                                if (this.ws.readyState === WebSocket.OPEN) {
                                    logInterfaceData("Sending a chat update [%s]", rmsg, this.ip);
                                    this.ws.send(JSON.stringify(rmsg));
                                    this.ws.close();
                                }
                            });
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
}
