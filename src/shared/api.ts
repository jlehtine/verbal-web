import { isObject } from "./util";

/** Shared configuration provided by the backend from `/chatconf` path */
export interface SharedConfig {
    /** Authentication configuration, indicating that authentication is supported */
    auth?: AuthConfig;
}

/** Authentication configuration */
export interface AuthConfig {
    /** Whether authentication is required */
    required: boolean;
    /** Google OAuth client id, indicating that Google login should be enabled */
    googleId?: string;
}

/** API chat messages */
export type ApiChatMessage = ApiFrontendChatMessage | ApiBackendChatMessage;

/** API messages sent by the frontend over web socket */
export type ApiFrontendChatMessage = ChatInit | ChatMessageNew;

/** API messages sent by the backend over web socket */
export type ApiBackendChatMessage = ChatMessagePart | ChatMessageError;

/** API message of specific type */
export interface TypedMessage<T extends string> extends Record<string, unknown> {
    /** Type identifier */
    type: T;
}

/** API message containing binary data */
export interface BinaryMessage<T extends string> extends TypedMessage<T> {
    /** Binary data */
    binary: ArrayBuffer;
}

/** Chat initialization by the frontend */
export interface ChatInit extends TypedMessage<"init">, ChatState {}

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
    /** Text content */
    content: string;
}

/** Partial chat message by the backend */
export interface ChatMessagePart extends TypedMessage<"msgpart"> {
    /** New text content */
    content: string;

    /** Is this the final part */
    done: boolean;
}

/** Chat message generation error codes */
export type ChatMessageErrorCode =
    /** Authentication is required */
    | "auth"
    /** Connection issue with the AI backend */
    | "connection"
    /** Chat completion error */
    | "chat"
    /** Moderation rejected content */
    | "moderation"
    /** Usage limits exceeded */
    | "limit";

/** Chat message generation error */
export interface ChatMessageError extends TypedMessage<"msgerror"> {
    /** Error code */
    code: ChatMessageErrorCode;
}

function isTypedMessage(v: unknown): v is TypedMessage<string> {
    return isObject(v) && typeof v.type === "string";
}

function isTypedMessageOfType<T extends string>(v: unknown, type: T): v is TypedMessage<T> {
    return isObject(v) && v.type === type;
}

export function isApiFrontendChatMessage(v: unknown): v is ApiFrontendChatMessage {
    return isTypedMessage(v) && (isChatInit(v) || isChatMessageNew(v));
}

export function isApiBackendChatMessage(v: unknown): v is ApiBackendChatMessage {
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

export function isSharedConfig(v: unknown): v is SharedConfig {
    return isObject(v) && (typeof v.auth === "undefined" || isAuthConfig(v.auth));
}

export function isAuthConfig(v: unknown): v is AuthConfig {
    return isObject(v) && typeof v.required === "boolean" && ["string", "undefined"].includes(typeof v.googleId);
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
    return typeof v === "string" && ["auth", "connection", "chat", "moderation", "limit"].includes(v);
}
