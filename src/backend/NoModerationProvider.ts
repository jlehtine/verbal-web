import { ModerationProvider, ModerationRequest, ModerationResult } from "./ModerationProvider";
import { RequestContext } from "./RequestContext";
import { TextChunkerParams } from "./TextChunker";

/**
 * A moderation provider that accepts all content.
 */
export class NoModerationProvider implements ModerationProvider {
    readonly textChunkerParams: TextChunkerParams = {
        maxChunkSize: 1000000000,
        minChunkSize: 1,
        maxChunkOverlap: 1000000000,
        minChunkOverlap: 0,
    };

    moderation(requestContext: RequestContext, request: ModerationRequest): Promise<ModerationResult[]> {
        return Promise.resolve(request.content.map((c) => ({ content: c, flagged: false })));
    }
}
