import { ChatCompletionProvider } from "./ChatCompletionProvider";
import { ModerationProvider } from "./ModerationProvider";
import { RealtimeProvider } from "./RealtimeProvider";
import { TranscriptionProvider } from "./TranscriptionProvider";

/**
 * Interface representing a provider engine with various capabilities.
 */
export interface Engine {
    /**
     * Returns the moderation provider.
     *
     * @returns the moderation provider
     */
    moderationProvider(): ModerationProvider;

    /**
     * Returns the chat completion provider.
     *
     * @returns the chat completion provider
     */
    chatCompletionProvider(): ChatCompletionProvider;

    /**
     * Returns the transcription provider if available.
     *
     * @returns the transcription provider or undefined if not available
     */
    transcriptionProvider(): TranscriptionProvider | undefined;

    /**
     * Returns the realtime provider if available.
     *
     * @returns the realtime provider or undefined if not available
     */
    realtimeProvider(): RealtimeProvider | undefined;
}
