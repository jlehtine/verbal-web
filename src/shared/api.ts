import { isObject } from "./util";

/** Shared configuration provided by the backend to the client from configuration endpoint */
export interface SharedConfig {
    /** Authentication configuration, indicating that authentication is supported */
    auth?: AuthConfig;
    /** Speech-to-text configuration, if speech-to-text support */
    speechToText?: SpeechToTextConfig;
    /** Realtime conversation configuration, if realtime supported */
    realtime?: RealtimeConfig;
}

/** Authentication configuration */
export interface AuthConfig {
    /** Whether authentication is required */
    required: boolean;
    /** Google OAuth client id, indicating that Google login should be enabled */
    googleId?: string;
}

/** Speech-to-text configuration */
export interface SpeechToTextConfig {
    /** Supported speech-to-text audio types */
    supportedAudioTypes: string[];
}

/** Realtime configuration */
export interface RealtimeConfig {
    /** Supported realtime audio input types */
    supportedInputAudioTypes: string[];
    /** Supported realtime audio output types */
    supportedOutputAudioTypes: string[];
}

/** Logging request from client to the backend logging endpoint */
export interface LogRequest {
    level: LogRequestLevel;
    message: string;
}

export type LogRequestLevel = "error" | "warning";

/** API chat messages */
export type ApiChatMessage = ApiFrontendChatMessage | ApiBackendChatMessage;

/** API messages sent by the frontend over web socket */
export type ApiFrontendChatMessage = ChatInit | ChatMessageNew | ChatAudio | ChatAudioCommit | ChatRealtimeStop;

/** API messages sent by the backend over web socket */
export type ApiBackendChatMessage =
    | ChatMessagePart
    | ChatAudioTranscription
    | ChatMessageError
    | ChatRealtimeStarted
    | ChatAudio;

/** API message of specific type */
export interface TypedMessage<T extends string> extends Record<string, unknown> {
    /** Type identifier */
    type: T;
}

/** API message containing binary data */
export interface BinaryMessage<T extends string> extends TypedMessage<T> {
    /** Binary data */
    binary: Uint8Array[];
}

/** Chat initialization by the frontend */
export type ChatInit = ChatInitSimple | ChatInitRealtime;

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

/** Simple chat initialization */
export interface ChatInitSimple extends ChatInitCommon {
    mode: "chat";
}

/** Realtime chat initialization */
export interface ChatInitRealtime extends ChatInitCommon {
    mode: "realtime";
    realtimeInputAudioType: string;
    realtimeOutputAudioType: string;
}

/** Common parts of chat initialization */
export interface ChatInitCommon extends TypedMessage<"init"> {
    /** Mode: "chat" for traditional chat or "realtime" for realtime conversation */
    mode: ChatMode;

    /** Initial chat state */
    state: ChatState;
}

export type ChatMode = "chat" | "realtime";

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

/** Audio message transcription by the backend */
export interface ChatAudioTranscription extends TypedMessage<"audtrsc"> {
    /** Transription */
    transcription: string;
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
    /** Realtime conversation error */
    | "realtime"
    /** Usage limits exceeded */
    | "limit";

/** Chat message generation error */
export interface ChatMessageError extends TypedMessage<"msgerror"> {
    /** Error code */
    code: ChatMessageErrorCode;
}

export type ChatAudio = BinaryMessage<"audio">;

export type ChatAudioCommit = TypedMessage<"audiocommit">;

export type ChatRealtimeStarted = TypedMessage<"rtstarted">;

export type ChatRealtimeStop = TypedMessage<"rtstop">;

export function isLogRequest(v: unknown): v is LogRequest {
    return isObject(v) && (v.level === "error" || v.level === "warning") && typeof v.message === "string";
}

function isTypedMessage(v: unknown): v is TypedMessage<string> {
    return isObject(v) && typeof v.type === "string";
}

function isTypedMessageOfType<T extends string>(v: unknown, type: T): v is TypedMessage<T> {
    return isObject(v) && v.type === type;
}

export function isBinaryMessage(v: unknown): v is BinaryMessage<string> {
    return isTypedMessage(v) && Array.isArray(v.binary) && v.binary.every((i) => i instanceof Uint8Array);
}

function isBinaryMessageOfType<T extends string>(v: unknown, type: T): v is BinaryMessage<T> {
    return isTypedMessageOfType(v, type) && isBinaryMessage(v);
}

export function isApiFrontendChatMessage(v: unknown): v is ApiFrontendChatMessage {
    return (
        isTypedMessage(v) &&
        (isChatInit(v) || isChatMessageNew(v) || isChatAudio(v) || isChatAudioCommit(v) || isChatRealtimeStop(v))
    );
}

export function isApiBackendChatMessage(v: unknown): v is ApiBackendChatMessage {
    return (
        isTypedMessage(v) &&
        (isChatMessagePart(v) ||
            isChatAudioTranscription(v) ||
            isChatMessageError(v) ||
            isChatRealtimeStarted(v) ||
            isChatAudio(v))
    );
}

function isChatState(v: unknown): v is ChatState {
    return (
        isObject(v) &&
        ["string", "undefined"].includes(typeof v.pageContent) &&
        ["string", "undefined"].includes(typeof v.initialInstruction) &&
        ["string", "undefined"].includes(typeof v.model) &&
        Array.isArray(v.messages) &&
        v.messages.map(isChatMessage).reduce((a, b) => a && b, true)
    );
}

function isChatInitCommon(v: TypedMessage<"init">): v is ChatInitCommon {
    return (v.mode === "chat" || v.mode === "realtime") && isChatState(v.state);
}

function isChatInitSimple(v: ChatInitCommon): v is ChatInitSimple {
    return v.mode === "chat";
}

function isChatInitRealtime(v: ChatInitCommon): v is ChatInitRealtime {
    return (
        v.mode === "realtime" &&
        typeof v.realtimeInputAudioType === "string" &&
        typeof v.realtimeOutputAudioType === "string"
    );
}

export function isChatInit(v: unknown): v is ChatInit {
    return isTypedMessageOfType(v, "init") && isChatInitCommon(v) && (isChatInitSimple(v) || isChatInitRealtime(v));
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

export function isChatAudioTranscription(v: unknown): v is ChatAudioTranscription {
    return isTypedMessageOfType(v, "audtrsc") && typeof v.transcription === "string";
}

export function isChatMessageError(v: unknown): v is ChatMessageError {
    return isTypedMessageOfType(v, "msgerror") && isChatMessageErrorCode(v.code);
}

export function isChatMessageErrorCode(v: unknown): v is ChatMessageErrorCode {
    return typeof v === "string" && ["auth", "connection", "chat", "realtime", "moderation", "limit"].includes(v);
}

export function isChatRealtimeStarted(v: unknown): v is ChatRealtimeStarted {
    return isTypedMessageOfType(v, "rtstarted");
}

export function isChatAudio(v: unknown): v is ChatAudio {
    return isBinaryMessageOfType(v, "audio");
}

export function isChatAudioCommit(v: unknown): v is ChatAudioCommit {
    return isTypedMessageOfType(v, "audiocommit");
}

export function isChatRealtimeStop(v: unknown): v is ChatRealtimeStop {
    return isTypedMessageOfType(v, "rtstop");
}
