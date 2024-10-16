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

    /** Callback for real-time conversation events */
    callback: RealtimeConversationCallback;
}

/**
 * Real-time callback.
 */
export interface RealtimeConversationCallback {
    /**
     * Called on error. Use conversation.isClosed() to check if the conversation is still open.
     *
     * @param error error
     */
    onError: (error: unknown) => void;

    /**
     * Called when start of speech is detected.
     */
    onSpeechStarted: () => void;

    /**
     * Called when stop of speech is detected.
     */
    onSpeechStopped: () => void;
}

/**
 * Real-time conversation.
 */
export interface RealtimeConversation {
    /**
     * Append user audio data to the audio buffer.
     *
     * @param audio PCM audio data
     */
    appendAudio(audio: ArrayBuffer): void;

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
