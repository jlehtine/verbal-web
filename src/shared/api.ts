/** API messages */
export type ApiMessage = ApiFrontendMessage | ApiBackendMessage;

/** API messages sent by the frontend */
export type ApiFrontendMessage = ChatInit | ChatMessageNew;

/** API messages sent by the backend */
export type ApiBackendMessage = ChatMessagePart | ChatMessageError;

/** API message of specific type */
export interface TypedMessage<T extends string> extends Record<string, unknown> {
    /** Type identifier */
    type: T;
}

/** Chat initialization by the frontend */
export interface ChatInit extends TypedMessage<"init">, ChatState {
    type: "init";
}

/** Chat state */
export interface ChatState {
    /** Initial instruction as configured in the frontend */
    initialInstruction?: string;

    /** Page content collected by the frontend */
    pageContent?: string;

    /** GPT model as configured in the frontend */
    model?: string;

    /** Current messages */
    messages: ChatMessage[];
}

/** Chat message */
export interface ChatMessage {
    /** Originating role, "user" messages are from the user and "assistant" messages from the AI assistant */
    role: "user" | "assistant";

    /** Text content */
    content: string;
}

/** New chat message by the frontend */
export interface ChatMessageNew extends TypedMessage<"msgnew"> {
    type: "msgnew";

    /** Text content */
    content: string;
}

/** Partial chat message by the backend */
export interface ChatMessagePart extends TypedMessage<"msgpart"> {
    type: "msgpart";

    /** New text content */
    content: string;

    /** Is this the final part */
    final?: true;
}

/** Chat message generation error codes */
export type ChatMessageErrorCode = "connection" | "chat" | "moderation" | "limit";

/** Chat message generation error */
export interface ChatMessageError extends TypedMessage<"msgerror"> {
    type: "msgerror";

    /** Error code */
    code: ChatMessageErrorCode;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object";
}

function isTypedMessage(v: unknown): v is TypedMessage<string> {
    return isObject(v) && typeof v.type === "string";
}

function isTypedMessageOfType<T extends string>(v: unknown, type: T): v is TypedMessage<T> {
    return isObject(v) && v.type === type;
}

export function isApiFrontendMessage(v: unknown): v is ApiFrontendMessage {
    return isTypedMessage(v) && (isChatInit(v) || isChatMessageNew(v));
}

export function isApiBackendMessage(v: unknown): v is ApiBackendMessage {
    return isTypedMessage(v) && (isChatMessagePart(v) || isChatMessageError(v));
}

export function isChatInit(v: unknown): v is ChatInit {
    return (
        isTypedMessageOfType(v, "init") &&
        ["string", "undefined"].includes(typeof v.pageContent) &&
        ["string", "undefined"].includes(typeof v.initialInstruction) &&
        ["string", "undefined"].includes(typeof v.model) &&
        Array.isArray(v.messages) &&
        v.messages.map(isChatMessage).reduce((a, b) => a && b, true)
    );
}

export function isChatMessage(v: unknown): v is ChatMessage {
    return isObject(v) && (v.role === "user" || v.role === "assistant") && typeof v.content === "string";
}

export function isChatMessageNew(v: unknown): v is ChatMessageNew {
    return isTypedMessageOfType(v, "msgnew") && typeof v.content === "string";
}

export function isChatMessagePart(v: unknown): v is ChatMessagePart {
    return (
        isTypedMessageOfType(v, "msgpart") && typeof v.content === "string" && (v.fin === undefined || v.fin === true)
    );
}

export function isChatMessageError(v: unknown): v is ChatMessageError {
    return isTypedMessageOfType(v, "msgerror") && isChatMessageErrorCode(v.code);
}

export function isChatMessageErrorCode(v: unknown): v is ChatMessageErrorCode {
    return typeof v === "string" && ["connection", "chat", "moderation", "limit"].includes(v);
}
