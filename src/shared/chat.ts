import {
    ApiChatMessage,
    ChatMessage,
    ChatMessageErrorCode,
    ChatState,
    isChatAudioMessageNew,
    isChatAudioTranscription,
    isChatInit,
    isChatMessageError,
    isChatMessageNew,
    isChatMessagePart,
} from "./api";
import { lastOf } from "./array";
import { VerbalWebError } from "./error";

/**
 * A model of a chat state and how it changes in response to API messages.
 */
export class Chat {
    /** Current chat state */
    state: ChatState = { messages: [] };

    /** Error code on the last message */
    error?: ChatMessageErrorCode;

    /** Failed user input if user input was removed */
    failedUserInput = "";

    /** Whether backend is currently processing a response */
    backendProcessing = false;

    /** Server overrides for initial state */
    private serverOverrides?: InitialChatState;

    /**
     * Constructs a new chat model.
     *
     * @param initialState initial state
     */
    constructor(initialState?: InitialChatState, serverOverrides?: InitialChatStateOverrides) {
        this.state = { ...initialState, messages: initialState?.messages ?? [], ...serverOverrides };
        this.serverOverrides = serverOverrides;
    }

    /**
     * Updates chat state according to the specified API message.
     *
     * @param amsg API message
     */
    update(amsg: ApiChatMessage): void {
        if (isChatInit(amsg)) {
            this.state = { ...amsg.state, ...this.serverOverrides };
            this.error = undefined;
            this.backendProcessing = lastOf(this.state.messages)?.role === "user";
        } else if (isChatMessageNew(amsg) || isChatAudioMessageNew(amsg)) {
            if (typeof amsg.content === "string") {
                this.state.messages.push({ role: "user", content: amsg.content });
            }
            this.backendProcessing = true;
            this.failedUserInput = "";
        } else if (isChatAudioTranscription(amsg)) {
            this.state.messages.push({ role: "user", content: amsg.transcription });
            this.backendProcessing = true;
        } else if (isChatMessagePart(amsg)) {
            const lastMsg = lastOf(this.state.messages);
            if (lastMsg?.role === "assistant") {
                lastMsg.content += amsg.content;
            } else {
                this.state.messages.push({ role: "assistant", content: amsg.content });
            }
            if (amsg.done) {
                this.backendProcessing = false;
            }
        } else if (isChatMessageError(amsg)) {
            this.error = amsg.code;
            this.backendProcessing = false;

            // Remove messages depending on the error
            if (this.error === "moderation" && lastOf(this.state.messages)?.role === "assistant") {
                this.state.messages.pop();
            }
            if (lastOf(this.state.messages)?.role === "user") {
                if (this.error !== "auth") {
                    this.failedUserInput = this.state.messages.pop()?.content ?? "";
                } else {
                    this.backendProcessing = true;
                }
            }
        } else {
            throw new VerbalWebError("Unexpected API message");
        }
    }
}

/** Configuration regarding the initial chat state */
export interface InitialChatState extends Omit<ChatState, "messages"> {
    messages?: ChatMessage[];
}

/** Server overrides for the initial chat state */
export type InitialChatStateOverrides = Omit<ChatState, "messages">;
