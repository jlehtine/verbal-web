import { ModerationProvider, ModerationRejectedError, ModerationRequest, ModerationResult } from "./ModerationProvider";
import { RequestContext } from "./RequestContext";

const MODERATION_CACHE_EXPIRE_MILLIS = process.env.VW_MODERATION_CACHE_EXPIRE_SECONDS
    ? parseInt(process.env.VW_MODERATION_CACHE_EXPIRE_SECONDS) * 1000
    : 60 * 60 * 1000;
const MODERATION_CACHE_EXPIRE_ENTRIES = process.env.VW_MODERATION_CACHE_EXPIRE_ENTRIES
    ? parseInt(process.env.VW_MODERATION_CACHE_EXPIRE_ENTRIES)
    : 1000;
const MODERATION_CACHE_CLEAN_MILLIS = 60 * 1000;
const MODERATION_CACHE_CLEAN_ENTRIES = 1.1 * MODERATION_CACHE_EXPIRE_ENTRIES;

interface CachedModeration {
    created: number;
    result: ModerationResult;
}

/**
 * Caches moderation results of the wrapped provider.
 */
export class ModerationCache implements ModerationProvider {
    private readonly cache = new Map<string, CachedModeration>();

    private moderationCacheCleaned = 0;

    private readonly moderationProvider;

    /**
     * Constructs a new instance.
     *
     * @param moderationProvider Provider doing actual moderation
     */
    constructor(moderationProvider: ModerationProvider) {
        this.moderationProvider = moderationProvider;
    }

    get textChunkerParams() {
        return this.moderationProvider.textChunkerParams;
    }

    checkModeration(requestContext: RequestContext, request: ModerationRequest): Promise<void> {
        return this.moderation(requestContext, request).then((mrs) => {
            for (const mr of mrs) {
                if (mr.flagged) {
                    throw new ModerationRejectedError(mr.reason);
                }
            }
        });
    }

    moderation(requestContext: RequestContext, request: ModerationRequest): Promise<ModerationResult[]> {
        this.cleanModerationCache();
        const cachedResults = new Map(request.content.map((c) => [c, this.cache.get(c)?.result]));
        const res: ModerationResult[] = [];
        for (const r of cachedResults) {
            const mr = r[1];
            if (mr) {
                res.push(mr);
                if (mr.flagged) {
                    return Promise.resolve(res);
                }
            }
        }
        const contentToCheck = [
            ...new Set([...cachedResults.entries()].filter((r) => r[1] === undefined).map((r) => r[0])),
        ];
        return this.moderationProvider.moderation(requestContext, { content: contentToCheck }).then((results) => {
            results.forEach((r) => this.cache.set(r.content, { created: Date.now(), result: r }));
            const resultsMap = new Map(results.map((r) => [r.content, r]));
            return [
                ...res,
                ...contentToCheck
                    .map((c) => resultsMap.get(c))
                    .filter((mr): mr is ModerationResult => mr !== undefined),
            ];
        });
    }

    private cleanModerationCache() {
        const now = Date.now();
        const moderationCacheSize = this.cache.size;
        let entryExpireLimit = Number.MAX_VALUE;
        if (moderationCacheSize > MODERATION_CACHE_CLEAN_ENTRIES) {
            const createdSorted = Array.from(this.cache.values())
                .map((e) => e.created)
                .sort();
            entryExpireLimit = createdSorted[moderationCacheSize - MODERATION_CACHE_EXPIRE_ENTRIES - 1];
        }
        if (entryExpireLimit < Number.MAX_VALUE || now - this.moderationCacheCleaned > MODERATION_CACHE_CLEAN_MILLIS) {
            const timeExpireLimit = now - MODERATION_CACHE_EXPIRE_MILLIS;
            const expireLimit = Math.min(entryExpireLimit, timeExpireLimit);
            for (const [msg, entry] of this.cache.entries()) {
                if (entry.created <= expireLimit) {
                    this.cache.delete(msg);
                }
            }
            this.moderationCacheCleaned = now;
        }
    }
}
