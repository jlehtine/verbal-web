import { RequestContext } from "./RequestContext";

/**
 * Request for transcription.
 */
export interface TranscriptionRequest {
    /** Context details for the request */
    requestContext: RequestContext;

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
     * @param request speech-to-text request
     * @returns transcription
     */
    transcribe(request: TranscriptionRequest): Promise<string>;
}
