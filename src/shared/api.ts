import { isObject } from "./util";
import { CredentialResponse } from "@react-oauth/google";

/** API messages */
export type ApiMessage = ApiFrontendMessage | ApiBackendMessage;

/** API chat messages */
export type ApiChatMessage = ChatInit | ChatMessageNew | ChatMessagePart | ChatMessageError;

/** API messages sent by the frontend */
export type ApiFrontendMessage = ConfigRequest | AuthRequest | ChatInit | ChatMessageNew;

/** API messages sent by the backend */
export type ApiBackendMessage = ConfigResponse | AuthResponse | ChatMessagePart | ChatMessageError;

/** API message of specific type */
export interface TypedMessage<T extends string> extends Record<string, unknown> {
    /** Type identifier */
    type: T;
}

/** Configuration request from the frontend to the backend */
export type ConfigRequest = TypedMessage<"cfgreq">;

/** Authentication request from the frontend to the backend */
export interface AuthRequest extends TypedMessage<"authreq"> {
    info: AuthInfo;
}

/** Authentication information */
export type AuthInfo = GoogleAuthInfo;

export interface GoogleAuthInfo {
    type: "google";
    creds: CredentialResponse;
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

/** Configuration details from the backend to the frontend */
export interface ConfigResponse extends TypedMessage<"cfgres">, SharedConfig {}

/** Authentication response from the backend to the frontend */
export interface AuthResponse extends TypedMessage<"authres"> {
    error?: AuthError;
}

/** Authentication error code */
export type AuthError = "failed" | "unauthorized";

/** Shared configuration provided by the backend */
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

/** Partial chat message by the backend */
export interface ChatMessagePart extends TypedMessage<"msgpart"> {
    /** New text content */
    content: string;

    /** Is this the final part */
    done: boolean;
}

/** Chat message generation error codes */
export type ChatMessageErrorCode = "connection" | "chat" | "moderation" | "limit";

/** Chat message generation error */
export interface ChatMessageError extends TypedMessage<"msgerror"> {
    /** Error code */
    code: ChatMessageErrorCode;

    /** Error message as human readable text */
    message: string;
}

function isTypedMessage(v: unknown): v is TypedMessage<string> {
    return isObject(v) && typeof v.type === "string";
}

function isTypedMessageOfType<T extends string>(v: unknown, type: T): v is TypedMessage<T> {
    return isObject(v) && v.type === type;
}

export function isApiFrontendMessage(v: unknown): v is ApiFrontendMessage {
    return isTypedMessage(v) && (isConfigRequest(v) || isAuthRequest(v) || isChatInit(v) || isChatMessageNew(v));
}

export function isApiBackendMessage(v: unknown): v is ApiBackendMessage {
    return (
        isTypedMessage(v) && (isConfigResponse(v) || isAuthResponse(v) || isChatMessagePart(v) || isChatMessageError(v))
    );
}

export function isConfigRequest(v: unknown): v is ConfigRequest {
    return isTypedMessageOfType(v, "cfgreq");
}

export function isAuthRequest(v: unknown): v is AuthRequest {
    return isTypedMessageOfType(v, "authreq");
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

export function isConfigResponse(v: unknown): v is ConfigResponse {
    return isTypedMessageOfType(v, "cfgres") && isSharedConfig(v);
}

export function isAuthResponse(v: unknown): v is AuthResponse {
    return isTypedMessageOfType(v, "authres") && (v.error === undefined || isAuthError(v.error));
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
    return typeof v === "string" && ["connection", "chat", "moderation", "limit"].includes(v);
}

export function isAuthError(v: unknown): v is AuthError {
    return v === "failed" || v === "unauthorized";
}
