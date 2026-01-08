import { isObject } from "../shared/util";

export interface RealtimeMessage<T extends string> extends Record<string, unknown> {
    event_id?: string;
    type: T;
}

export interface RealtimeEventIdMessage<T extends string> extends RealtimeMessage<T> {
    event_id: string;
}

export type RealtimeClientMessage =
    | RealtimeSessionUpdateMessage
    | RealtimeInputAudioBufferAppendMessage
    | RealtimeInputAudioBufferCommitMessage
    | RealtimeConversationItemCreateMessage;

export type RealtimeServerMessage =
    | RealtimeErrorMessage
    | RealtimeSessionCreatedMessage
    | RealtimeSessionUpdatedMessage
    | RealtimeConversationItemCreatedMessage;

// Client messages

export interface RealtimeSessionUpdateMessage extends RealtimeMessage<"session.update"> {
    session: RealtimeSessionUpdate;
}

export interface RealtimeSessionUpdate {
    modalities?: RealtimeModality[];
    instructions?: string;
    voice?: string;
    input_audio_format?: RealtimeAudioFormat;
    output_audio_format?: RealtimeAudioFormat;
    input_audio_transcription?: RealtimeInputAudioTranscription | null;
    turn_detection?: RealtimeTurnDetection | null;
    // TODO tools
    temperature?: number;
    max_output_tokens?: number | "inf";
}

export interface RealtimeInputAudioTranscription {
    model: string;
}

export interface RealtimeTurnDetection {
    type: "server_vad";
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
}

export interface RealtimeInputAudioBufferAppendMessage extends RealtimeMessage<"input_audio_buffer.append"> {
    audio: string;
}

export type RealtimeInputAudioBufferCommitMessage = RealtimeMessage<"input_audio_buffer.commit">;

export interface RealtimeConversationItemCreateMessage
    extends RealtimeMessage<"conversation.item.create">, RealtimeConversationItemInfo {}

// Server messages

export interface RealtimeErrorMessage extends RealtimeEventIdMessage<"error"> {
    error: RealtimeEventErrorInfo;
}

export type RealtimeSessionCreatedMessage = RealtimeEventIdMessage<"session.created">;

export type RealtimeSessionUpdatedMessage = RealtimeEventIdMessage<"session.updated">;

export interface RealtimeConversationCreatedMessage extends RealtimeEventIdMessage<"conversation.created"> {
    conversation: RealtimeConversation;
}

export interface RealtimeConversation {
    id: string;
    object: "realtime.conversation";
}

export interface RealtimeConversationItemCreatedMessage
    extends RealtimeEventIdMessage<"conversation.item.created">, RealtimeConversationItemInfo {}

export interface RealtimeConversationItemInputAudioTranscriptionCompletedMessage
    extends
        RealtimeEventIdMessage<"conversation.item.input_audio_transcription.completed">,
        RealtimeConversationItemContentIdentity {
    transcript: string;
}

export interface RealtimeConversationItemInputAudioTranscriptionFailedMessage
    extends
        RealtimeEventIdMessage<"conversation.item.input_audio_transcription.failed">,
        RealtimeConversationItemContentIdentity {
    error: RealtimeErrorInfo;
}

export interface RealtimeResponseTextDeltaMessage
    extends RealtimeEventIdMessage<"response.text.delta">, RealtimeResponseContentPartIdentity {
    delta: string;
}

export interface RealtimeResponseAudioTranscriptDoneMessage
    extends RealtimeEventIdMessage<"response.audio_transcript.done">, RealtimeResponseContentPartIdentity {
    transcript: string;
}

export interface RealtimeResponseAudioDeltaMessage
    extends RealtimeEventIdMessage<"response.audio.delta">, RealtimeResponseContentPartIdentity {
    delta: string;
}

// Common types

export interface RealtimeConversationItemInfo {
    previous_item_id: string;
    item: RealtimeConversationItem;
}

export interface RealtimeConversationItem {
    id: string;
    // TODO functions
    type: "message";
    status: "completed" | "in_progress" | "incomplete";
    role: "user" | "assistant" | "system";
    content: RealtimeConversationContent;
    call_id?: string;
    name?: string;
    arguments?: string;
    output?: string;
}

export interface RealtimeConversationContent {
    type: "input_text" | "input_audio" | "text" | "audio";
    text?: string;
    audio?: string;
    transcript?: string;
}

export type RealtimeModality = "text" | "audio";

export type RealtimeAudioFormat = "pcm16" | "g711_ulaw" | "g711_alaw";

export interface RealtimeErrorInfo {
    type: string;
    code: string;
    message: string;
    param?: string;
}

export interface RealtimeEventErrorInfo extends RealtimeErrorInfo {
    event_id?: string;
}

export interface RealtimeConversationItemContentIdentity {
    item_id: string;
    content_index: number;
}

export interface RealtimeResponseContentPartIdentity extends RealtimeConversationItemContentIdentity {
    response_id: string;
    output_index: number;
}

// Message validation functions

export function isRealtimeMessage(message: unknown): message is RealtimeMessage<string> {
    return isObject(message) && typeof message.type === "string";
}

export function isRealtimeMessageOfType<T extends string>(
    message: RealtimeMessage<string>,
    type: T,
): message is RealtimeMessage<T> {
    return message.type === type;
}

export function isRealtimeErrorMessage(message: RealtimeMessage<string>): message is RealtimeErrorMessage {
    return isRealtimeMessageOfType(message, "error");
}

export function isRealtimeSessionUpdatedMessage(
    message: RealtimeMessage<string>,
): message is RealtimeSessionUpdatedMessage {
    return isRealtimeMessageOfType(message, "session.updated");
}

export function isRealtimeResponseAudioDeltaMessage(
    message: RealtimeMessage<string>,
): message is RealtimeResponseAudioDeltaMessage {
    return isRealtimeMessageOfType(message, "response.audio.delta") && typeof message.delta === "string";
}
