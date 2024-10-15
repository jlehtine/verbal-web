import { RequestContext } from "./RequestContext";

/**
 * Request for transcription.
 */
export interface TranscriptionRequest {
    /** Model identifier */
    model?: string;

    /** User identifier */
    user?: string;

    /** Audio data */
    audio: ArrayBuffer;

    /** MIME type of audio data */
    type: string;
}

/**
 * Generic interface for a transcription provider.
 */
export interface TranscriptionProvider {
    /**
     * Returns an array of supported audio input MIME types.
     *
     * @returns an array of supported audio input MIME types
     */
    supportedTranscriptionAudioTypes(): string[];

    /**
     * Transcribe speech to text. Returns asynchronously the transcription.
     *
     * @param requestContext context details for the request
     * @param request speech-to-text request
     * @returns transcription
     */
    transcribe(requestContext: RequestContext, request: TranscriptionRequest): Promise<string>;
}
