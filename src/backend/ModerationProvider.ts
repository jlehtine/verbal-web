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

/**
 * Generic moderation request.
 */
export interface ModerationRequest {
    /** Model identifier */
    model?: string;

    /** User identifier */
    user?: string;

    /** Content to be checked */
    content: string[];
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
    readonly textChunkerParams: TextChunkerParams;

    /**
     * Checks whether the specified content should be accepted or not.
     * Returns asynchronously a record mapping each content string to
     * either `true` if accepted or `false` if rejected. Results array
     * may stop after the first flagged content.
     *
     * @param request moderation request
     */
    moderation(requestContext: RequestContext, request: ModerationRequest): Promise<ModerationResult[]>;
}
