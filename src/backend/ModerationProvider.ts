import { VerbalWebError } from "../shared/error";
import { RequestContext } from "./RequestContext";
import { TextChunkerParams } from "./TextChunker";

/** Signals that content was rejected by moderation */
export class ModerationRejectedError extends VerbalWebError {
    constructor(reason?: string, options?: ErrorOptions) {
        super(`Moderation flagged content${reason ? ": " + reason : ""}`, options);
        this.name = "ModerationRejectedError";
    }
}

/** Moderation result for individual content */
export interface ModerationResult {
    /** Content */
    content: string;

    /** Whether flagged (rejected) by moderation */
    flagged: boolean;

    /** Reason why flagged */
    reason?: string;
}

/**
 * Generic interface for a moderation provider.
 */
export interface ModerationProvider {
    /** Text chunker parameters for long or streaming content */
    textChunkerParams: TextChunkerParams;

    /**
     * Checks whether the specified content should be accepted or not.
     * Returns asynchronously a record mapping each content string to
     * either `true` if accepted or `false` if rejected. Results array
     * may stop after the first flagged content.
     *
     * @param requestContext Context details for the request
     * @param content content to be checked
     */
    moderation(requestContext: RequestContext, ...content: string[]): Promise<ModerationResult[]>;
}
