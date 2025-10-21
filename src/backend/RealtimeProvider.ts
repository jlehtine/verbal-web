import { TypedEvent, TypedEventTarget } from "../shared/event";
import { RequestContext } from "./RequestContext";

/**
 * Request for a real-time conversation.
 */
export interface RealtimeConversationRequest {
    /** Model identifier */
    model?: string;

    /** User identifier */
    user?: string;

    /** Modalities the model can respond with */
    modalities?: string[];

    /** System instructions */
    instructions?: string;

    /** Voice used by model */
    voice?: string;

    /** Audio input MIME type */
    inputAudioType: string;

    /** Audio output MIME type */
    outputAudioType: string;

    /** Input audio transcription model, or null to disable */
    inputAudioTranscriptionModel?: string | null;
}

/**
 * Real-time conversation.
 */
export interface RealtimeConversation extends TypedEventTarget<RealtimeConversation, RealtimeConversationEventMap> {
    /**
     * Append user audio data to the audio buffer.
     *
     * @param audio PCM audio data
     */
    appendAudio(audio: Uint8Array | ArrayBuffer): void;

    /**
     * Commit buffered user audio data to a user message.
     */
    commitUserAudio(): void;

    /**
     * Close the conversation.
     */
    close(): void;

    /**
     * Returns whether the conversation is closed.
     *
     * @returns whether the conversation is closed
     */
    isClosed(): boolean;
}

/**
 * Generic interface for a provider of real-time discussion capabilities.
 */
export interface RealtimeProvider {
    /**
     * Returns an array of supported realtime audio input MIME types.
     *
     * @returns an array of supported realtime audio input MIME types
     */
    supportedRealtimeInputAudioTypes(): string[];

    /**
     * Returns an array of supported realtime audio output MIME types.
     *
     * @returns an array of supported realtime audio output MIME types
     */
    supportedRealtimeOutputAudioTypes(): string[];

    /**
     * Create a new real-time conversation.
     *
     * @param requestContext context details for the request
     * @param request real-time conversation request
     * @returns real-time conversation
     */
    realtimeConversation(
        requestContext: RequestContext,
        request: RealtimeConversationRequest,
    ): Promise<RealtimeConversation>;
}

/** Realtime conversation events */
export interface RealtimeConversationEventMap {
    state: TypedEvent<RealtimeConversation, "state">;
    error: RealtimeConversionErrorEvent;
    audio: RealtimeConversionAudioEvent;
}

/** Realtime conversation error event. Check target.isClosed() to check if the conversation has closed. */
export interface RealtimeConversionErrorEvent extends TypedEvent<RealtimeConversation, "error"> {
    /** Error */
    error: unknown;
}

/** Realtime conversation audio event */
export interface RealtimeConversionAudioEvent extends TypedEvent<RealtimeConversation, "audio"> {
    /** Audio data */
    audio: ArrayBufferLike;
}
